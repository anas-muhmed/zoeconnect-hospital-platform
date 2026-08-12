import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  ConnectedSocket, MessageBody, OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

import { TokenService, TokenCalledPayload, DisplayTheme } from './token.service';
import { TokenQueueService }               from './queue/token-queue.service';
import type { ILicenseProvider }           from '../platform/infrastructure/licensing/license-provider.interface';
import { LICENSE_PROVIDER }                from '../platform/infrastructure/tokens';
import { DEFAULT_BRANCH_ID }               from '../branch/branch.service';
import { SubdomainTenantMiddleware }       from '../../common/middleware/subdomain-tenant.middleware';

/**
 * TokenGateway -- Socket.io namespace: /token
 *
 * Room strategy:
 *   branch:{branchId}   -- all clients (operators, kiosks, display boards) in a branch
 *   location:{locationId} -- operator clients joined to a specific location
 *   display:{slug}      -- display board clients (GAP-17)
 *   kiosk:{slug}        -- kiosk clients (GAP-17)
 *
 * Events FROM clients:
 *   token:join          { locationId, counterNumber }
 *   token:leave         { locationId, counterNumber }
 *   token:heartbeat     { locationId, counterNumber }
 *   token:call          { locationId, counterNumber, tokenNumber }
 *   token:mark-no-show  { locationId, counterNumber, tokenNumber }
 *   token:reset         { locationId, counterNumber }
 *   token:join-display  { slug }   -- GAP-17: display board subscribes to its room
 *   token:join-kiosk    { slug }   -- GAP-17: kiosk subscribes to its room
 *
 * Events TO clients:
 *   token:state         LocationState[]
 *   token:called        TokenCalledPayload
 *   token:issued        { locationId, issuedCount }
 *   token:session       { locked, locationId?, counterNumber? }
 *   token:error         { message }
 *   token:daily-reset   { branchId, resetAt }
 *   token:mode-changed  { branchId, mode }
 */
@WebSocketGateway({
  namespace: 'token',
  cors: { origin: '*', credentials: true },
})
export class TokenGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(TokenGateway.name);

  // userId => { socketId, locationId, counterNumber }
  private readonly operatorMap = new Map<
    string,
    { socketId: string; locationId: string; counterNumber: number }
  >();
  // socketId => userId (reverse lookup on disconnect)
  private readonly socketToUser = new Map<string, string>();
  // socketId => branchId (for branch-scoped broadcasts)
  private readonly socketBranch = new Map<string, string>();

  constructor(
    private readonly tokenService:      TokenService,
    private readonly tokenQueueService: TokenQueueService,
    private readonly jwtService:        JwtService,
    private readonly config:            ConfigService,
    // Bug fix (token-gateway-license-check, 2026-07-31): was `LicenseService`
    // (self-hosted-only, queries the global `license_master` table with no
    // tenant scoping at all) -- see this constructor's former injection and
    // the `handleConnection()` check below, replaced with the same
    // tenant-aware `LICENSE_PROVIDER` abstraction `LicenseGuard` already uses
    // for every HTTP route. For a cloud tenant, `LicenseService` was checking
    // the wrong table entirely (its real entitlements live in
    // `subscription_licenses`, read by `SubscriptionLicenseProvider`), saw a
    // stray single `license_master` row with only `PLATFORM` licensed, and
    // disconnected the socket -- the client reconnected into the same
    // failure every time, producing a permanent "Connecting..." spinner on
    // the Token Queue counter page even for a fully-licensed QUEUE module.
    @Inject(LICENSE_PROVIDER) private readonly licenseProvider: ILicenseProvider,
    private readonly subdomainResolver: SubdomainTenantMiddleware,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // -- Connection lifecycle --------------------------------------------------

  // Fix (2026-07-20, real incident -- Token Queue "Join a Billing Counter"
  // cross-tenant leak, final piece): the admin Counter page's location
  // dropdown is populated entirely from the `token:state` WebSocket event
  // (see useTokenSocket.ts), NOT the HTTP /token/locations or
  // /token/public/state routes fixed earlier tonight -- this gateway was
  // untouched by any of those fixes and never derived a tenant at all.
  // Both connection paths below now resolve `client.data.tenantId` and
  // pass it explicitly into TokenService, exactly like the HTTP routes:
  //   - Authenticated (JWT) clients: the token payload already carries
  //     `tenantId` (same claim `SessionTenantResolver` reads server-side
  //     for REST requests).
  //   - Public (no-JWT) clients (TV display boards, kiosks): there is no
  //     Fastify `onRequest` hook for a websocket upgrade, so
  //     SubdomainTenantMiddleware never ran for these connections either.
  //     Resolves the same way it would have, directly from the handshake's
  //     Host/X-Forwarded-Host headers, via the shared
  //     `resolveFromHost()` helper extracted from that middleware tonight.
  async handleConnection(client: Socket): Promise<void> {
    try {
      const rawToken =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') ?? '');

      // -- Public display board / kiosk -- no auth token ---------------------
      if (!rawToken) {
        let branchId = (client.handshake.query?.branchId as string) || DEFAULT_BRANCH_ID;
        let tenantId: string | undefined;

        // Cloud Token Queue Display fix (2026-07-31, real incident): a
        // display board that knows its own `displayToken` (globally unique,
        // see TokenLocation.displayToken's doc comment) can resolve its
        // tenant directly from that location row -- no hostname-based
        // guessing needed, and correct for cloud tenants (who have no
        // per-tenant subdomain for resolveFromHost() below to find).
        // Also adopts the location's own branchId, so the room this socket
        // joins actually matches the location it's displaying, rather than
        // whatever branchId query param (or DEFAULT_BRANCH_ID) was passed.
        const displayToken = client.handshake.query?.displayToken as string | undefined;
        if (displayToken) {
          const loc = await this.tokenService.getPublicLocationByDisplayToken(displayToken);
          if (loc) {
            tenantId = loc.tenantId ?? undefined;
            branchId = loc.branchId ?? branchId;
          }
        }

        // Fallback for connections with no displayToken (older clients,
        // self-hosted where hostname resolution is reliable since 'default'
        // is genuinely the only tenant).
        if (tenantId === undefined) {
          const forwardedHost = client.handshake.headers['x-forwarded-host'];
          const rawHost = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
          const effectiveHost = rawHost?.split(',')[0]?.trim() || client.handshake.headers.host;
          const resolved = await this.subdomainResolver.resolveFromHost(effectiveHost, client.handshake.headers.host, rawHost);
          tenantId = resolved.tenantId;
        }

        client.data.isPublic  = true;
        client.data.branchId  = branchId;
        client.data.tenantId  = tenantId;
        this.socketBranch.set(client.id, branchId);
        await client.join(`branch:${branchId}`);
        const publicState = await this.tokenService.getPublicState(branchId, tenantId);
        client.emit('token:state', publicState);
        this.logger.log(`Public client connected: ${client.id} branch=${branchId} tenant=${tenantId}`);
        return;
      }

      const payload = this.jwtService.verify(rawToken, {
        secret: this.config.get<string>('jwt.secret'),
      });

      const user = await this.userRepo.findOne({
        where: { id: payload.sub },
        relations: ['roles', 'roles.permissions', 'directPermissions'],
      });

      if (!user || !user.isActive) {
        client.emit('token:error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      // ZoeConnect Identity Architecture Migration, Phase 5 -- authenticated
      // connections resolve organization entirely from the JWT's
      // `tenantId`/`organizationId` claim now, with no Host-header fallback.
      // The fallback this replaced (resolving from the handshake's Host
      // header when the claim was absent) existed only for tokens minted
      // before Task 8.1 introduced the `tenantId` claim -- every current
      // access token (15m TTL) and refresh token (7d default TTL) carries it,
      // so that fallback was already effectively unreachable in practice; an
      // authenticated connection with neither claim now simply has no
      // resolved tenant, same as this gateway already handles for any other
      // legitimately-undefined `tenantId` (see `getAllLocationsState`'s own
      // `tenantId ?? null` handling below). Public/kiosk connections above
      // are untouched -- Host/subdomain resolution remains exactly as it was
      // for that non-authenticated path.
      //
      // Moved above the license check below (bug fix,
      // token-gateway-license-check, 2026-07-31) -- `licenseProvider.getStatus()`
      // needs this tenantId to check the RIGHT tenant's entitlements instead
      // of silently defaulting to no tenant at all.
      const tenantId = payload.tenantId as string | undefined;

      const status = await this.licenseProvider.getStatus(tenantId);
      if (!status.isValid || !status.licensedModules.includes('QUEUE')) {
        client.emit('token:error', { message: 'Queue Management module license has expired' });
        client.disconnect();
        return;
      }

      const branchId = (payload.activeBranchId as string) || DEFAULT_BRANCH_ID;
      client.data.userId    = user.id;
      client.data.role      = user.roles?.map((r) => r.name).join(',') ?? '';
      client.data.branchId  = branchId;
      client.data.tenantId  = tenantId;
      // Bug fix: this used to only fetch/flatten role permissions, silently
      // dropping any permission granted directly to the user (User.
      // directPermissions -- see users/entities/user.entity.ts's
      // permissionKeys getter, which REST's PermissionsGuard correctly
      // includes via User.hasPermission()). A user granted e.g.
      // TOKEN:COUNTER:MANAGE as an individual override rather than via role
      // membership would pass every REST-guarded check but still get
      // "Permission denied" on socket actions like token:reset, because
      // this gateway rebuilt its own permission list from scratch instead
      // of reusing hasPermission()/permissionKeys.
      const rolePermKeys = (user.roles?.flatMap((r) => r.permissions ?? []) ?? []).map(
        (p: any) => `${p.moduleCode}:${p.resource}:${p.action}`,
      );
      const directPermKeys = (user.directPermissions ?? []).map(
        (p: any) => `${p.moduleCode}:${p.resource}:${p.action}`,
      );
      client.data.permissions = [...new Set([...rolePermKeys, ...directPermKeys])];

      this.socketToUser.set(client.id, user.id);
      this.socketBranch.set(client.id, branchId);
      await client.join(`branch:${branchId}`);

      const existing = await this.tokenService.findExistingSession(user.id);
      if (existing) {
        const { locationId, counterNumber } = existing;
        try {
          await this.tokenService.joinCounter(user.id, locationId, counterNumber);
          this.operatorMap.set(user.id, { socketId: client.id, locationId, counterNumber });
          await client.join(`location:${locationId}`);
          client.emit('token:session', { locked: true, locationId, counterNumber });
          this.logger.log(
            `Auto-restored session: user=${user.id} location=${locationId} counter=${counterNumber}`,
          );
        } catch (err: any) {
          this.logger.warn(`Session restore failed for user=${user.id}: ${err.message}`);
        }
      }

      const state = await this.tokenService.getAllLocationsState(branchId, tenantId);
      client.emit('token:state', state);

      this.logger.log(`Connected: ${client.id} (user=${user.id}, tenant=${tenantId ?? '(none)'})`);
    } catch (err: any) {
      // Debuggability fix (2026-07-31): this used to be a bare `catch {}` --
      // ANY exception in the whole handleConnection() body (a bad/expired
      // JWT, a DB error, a bug in a helper it calls, license-provider
      // failures, anything) was silently swallowed and reported to the
      // client as the exact same "Authentication required" message, with
      // NOTHING written to the server logs. That made it impossible to tell
      // "the user really isn't authenticated" apart from "something else
      // threw partway through" -- e.g. the client-facing message stayed
      // "Authentication required" even for a failure that had nothing to do
      // with auth, hiding the real cause. The client-facing message is
      // unchanged (still generic, no internal detail leaked to the socket),
      // but the real error now always reaches the server logs.
      this.logger.error(`handleConnection failed: ${err?.message ?? err}`, err?.stack);
      client.emit('token:error', { message: 'Authentication required' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const branchId = this.socketBranch.get(client.id) ?? DEFAULT_BRANCH_ID;
    this.socketBranch.delete(client.id);

    if (client.data.isPublic) {
      this.logger.log(`Public client disconnected: ${client.id} branch=${branchId}`);
      return;
    }
    const userId = this.socketToUser.get(client.id);
    if (userId) {
      const entry = this.operatorMap.get(userId);
      if (entry && entry.socketId === client.id) {
        this.operatorMap.delete(userId);
        await this.broadcastState(branchId);
      }
      this.socketToUser.delete(client.id);
    }
    this.logger.log(`Disconnected: ${client.id} branch=${branchId}`);
  }

  // -- token:join ------------------------------------------------------------

  @SubscribeMessage('token:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { locationId: string; counterNumber: number },
  ): Promise<void> {
    if (!this.hasPermission(client, 'TOKEN:COUNTER:OPERATE')) {
      client.emit('token:error', { message: 'Permission denied' });
      return;
    }

    const { locationId, counterNumber } = data;
    const userId = client.data.userId as string;

    try {
      await this.tokenService.joinCounter(userId, locationId, counterNumber);
      this.operatorMap.set(userId, { socketId: client.id, locationId, counterNumber });
      await client.join(`location:${locationId}`);
      client.emit('token:session', { locked: true, locationId, counterNumber });
      await this.broadcastState(client.data.branchId ?? DEFAULT_BRANCH_ID);
      this.logger.log(`Operator ${userId} joined location=${locationId} counter=${counterNumber}`);
    } catch (err: any) {
      client.emit('token:error', { message: err.message ?? 'Failed to join counter' });
    }
  }

  // -- token:leave -----------------------------------------------------------

  @SubscribeMessage('token:leave')
  async handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { locationId: string; counterNumber: number },
  ): Promise<void> {
    const userId = client.data.userId as string;
    await this.tokenService.leaveCounter(userId, data.locationId, data.counterNumber);
    this.operatorMap.delete(userId);
    await client.leave(`location:${data.locationId}`);
    client.emit('token:session', { locked: false });
    await this.broadcastState(client.data.branchId ?? DEFAULT_BRANCH_ID);
  }

  // -- token:heartbeat -------------------------------------------------------

  @SubscribeMessage('token:heartbeat')
  async handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { locationId: string; counterNumber: number },
  ): Promise<void> {
    const userId = client.data.userId as string;
    await this.tokenService.heartbeat(userId, data.locationId, data.counterNumber);
  }

  // -- token:call ------------------------------------------------------------

  @SubscribeMessage('token:call')
  async handleCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { locationId: string; counterNumber: number; tokenNumber: number },
  ): Promise<void> {
    if (!this.hasPermission(client, 'TOKEN:COUNTER:OPERATE')) {
      client.emit('token:error', { message: 'Permission denied' });
      return;
    }

    const userId = client.data.userId as string;

    try {
      const payload = await this.tokenService.callToken(
        userId,
        data.locationId,
        data.counterNumber,
        data.tokenNumber,
      );
      this.broadcastTokenCalled(payload);
      await this.broadcastState(client.data.branchId ?? DEFAULT_BRANCH_ID);

      // GAP-2: additionally transition token_records status to CALLED.
      // Best-effort -- must not throw or block the response if the record is absent.
      this.tokenQueueService.callTokenRecord({
        referenceId: data.locationId,
        tokenNumber: data.tokenNumber,
        counterId:   payload.counterId,
        calledBy:    userId,
        branchId:    payload.branchId ?? DEFAULT_BRANCH_ID,
      }).catch((err: unknown) =>
        this.logger.warn(`callTokenRecord: ${(err as Error).message}`),
      );
    } catch (err: any) {
      client.emit('token:error', { message: err.message ?? 'Failed to call token' });
    }
  }

  // -- token:recall ----------------------------------------------------------

  /**
   * Re-announces a token for a patient who missed their original call.
   * Emits 'token:called' to the display board just like a normal call,
   * so the board flashes and audio plays again. Does NOT alter the Redis
   * called-set (token stays marked as called for deduplication purposes).
   */
  @SubscribeMessage('token:recall')
  async handleRecall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { locationId: string; counterNumber: number; tokenNumber: number },
  ): Promise<void> {
    if (!this.hasPermission(client, 'TOKEN:COUNTER:OPERATE')) {
      client.emit('token:error', { message: 'Permission denied' });
      return;
    }

    const userId = client.data.userId as string;

    try {
      const payload = await this.tokenService.recallToken(
        userId,
        data.locationId,
        data.counterNumber,
        data.tokenNumber,
      );
      this.broadcastTokenCalled(payload);
      await this.broadcastState(client.data.branchId ?? DEFAULT_BRANCH_ID);
    } catch (err: any) {
      client.emit('token:error', { message: err.message ?? 'Failed to recall token' });
    }
  }

  // -- token:mark-no-show ------------------------------------------------------

  /**
   * Marks an already-called token as "did not arrive". The token is
   * permanently disabled for the rest of the day (see markNotArrived).
   */
  @SubscribeMessage('token:mark-no-show')
  async handleMarkNoShow(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { locationId: string; counterNumber: number; tokenNumber: number },
  ): Promise<void> {
    if (!this.hasPermission(client, 'TOKEN:COUNTER:OPERATE')) {
      client.emit('token:error', { message: 'Permission denied' });
      return;
    }

    const userId = client.data.userId as string;

    try {
      const payload = await this.tokenService.markNotArrived(
        userId,
        data.locationId,
        data.counterNumber,
        data.tokenNumber,
      );
      this.server.to(`branch:${payload.branchId ?? DEFAULT_BRANCH_ID}`).emit('token:no-show', payload);
      await this.broadcastState(client.data.branchId ?? DEFAULT_BRANCH_ID);
    } catch (err: any) {
      client.emit('token:error', { message: err.message ?? 'Failed to mark token as not-arrived' });
    }
  }

  // -- token:reset -----------------------------------------------------------

  @SubscribeMessage('token:reset')
  async handleReset(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { locationId: string; counterNumber: number },
  ): Promise<void> {
    if (!this.hasPermission(client, 'TOKEN:COUNTER:MANAGE')) {
      client.emit('token:error', { message: 'Permission denied' });
      return;
    }
    await this.tokenService.resetCounter(data.locationId, data.counterNumber);
    await this.broadcastState(client.data.branchId ?? DEFAULT_BRANCH_ID);
  }

  // -- token:join-display (GAP-17) -------------------------------------------

  /**
   * Display boards call this after connecting to subscribe to a display-specific
   * room (display:{slug}) in addition to the branch room they join on connect.
   * Events targeted at a specific display (e.g. custom layout updates) can be
   * emitted to this room without flooding all branch clients.
   */
  @SubscribeMessage('token:join-display')
  async handleJoinDisplay(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { slug: string },
  ): Promise<void> {
    if (!data?.slug) {
      client.emit('token:error', { message: 'slug required for token:join-display' });
      return;
    }
    await client.join(`display:${data.slug}`);
    this.logger.log(`Display joined room display:${data.slug} (socket=${client.id})`);
    // Send current state immediately so the board doesn't need to wait
    const branchId = (client.data.branchId as string) ?? DEFAULT_BRANCH_ID;
    const tenantId = (client.data.tenantId as string | undefined) ?? null;
    const state = await this.tokenService.getPublicState(branchId, tenantId);
    client.emit('token:state', state);
  }

  // -- token:join-kiosk (GAP-17) ---------------------------------------------

  /**
   * Kiosks call this after connecting to subscribe to a kiosk-specific room
   * (kiosk:{slug}). Targeted events (e.g. remote disable, config push) can be
   * emitted to this room without affecting operators or display boards.
   */
  @SubscribeMessage('token:join-kiosk')
  async handleJoinKiosk(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { slug: string },
  ): Promise<void> {
    if (!data?.slug) {
      client.emit('token:error', { message: 'slug required for token:join-kiosk' });
      return;
    }
    await client.join(`kiosk:${data.slug}`);
    this.logger.log(`Kiosk joined room kiosk:${data.slug} (socket=${client.id})`);
  }

  // -- Broadcast helpers -----------------------------------------------------

  broadcastTokenCalled(payload: TokenCalledPayload): void {
    const room = payload.branchId ? `branch:${payload.branchId}` : null;
    if (room) {
      this.server.to(room).emit('token:called', payload);
    } else {
      this.server.emit('token:called', payload);
    }
  }

  broadcastTokenIssued(locationId: string, issuedCount: number, branchId?: string | null): void {
    // GAP-15 fix: emit to the branch room instead of globally.
    const bid = branchId ?? DEFAULT_BRANCH_ID;
    this.server.to(`branch:${bid}`).emit('token:issued', { locationId, issuedCount });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  broadcastConfigUpdated(config: any): void {
    this.server.emit('config:updated', config);
  }

  /**
   * Notifies every client on this branch that the token issuance mode
   * (LOCATION_BASED / SERVICE_CENTER_BASED) just changed, so operators who
   * already have the Token Queue counter page open switch join panels
   * immediately instead of showing a stale mode until they reload.
   */
  broadcastModeChanged(branchId: string, mode: string): void {
    this.server.to(`branch:${branchId}`).emit('token:mode-changed', { branchId, mode });
  }

  // Fix (2026-07-20, real incident): this used to compute ONE state array
  // for the whole branch room and emit it to every socket in that room --
  // correct only when a `branch:{id}` room is truly one tenant's clients.
  // In practice, cloud tenants share the synthetic DEFAULT_BRANCH_ID ('2')
  // for their default branch, so `branch:2` contains sockets from every
  // cloud tenant at once, and every operator action (join/call/reset/etc.,
  // each of which calls this method) re-broadcast ALL tenants' full
  // location lists to ALL of them. Rather than re-keying every room join
  // and the ~20 external call sites across TokenController/
  // TokenConfigController/TokenKioskController/TokenQueueController/
  // TokenDailyResetService that call `broadcastState(branchId)` today (out
  // of scope to safely land tonight), this computes state PER DISTINCT
  // TENANT actually present in the room and emits each tenant's own slice
  // only to that tenant's sockets -- external callers are unaffected.
  async broadcastState(branchId?: string): Promise<void> {
    const bid = branchId ?? DEFAULT_BRANCH_ID;
    const room = `branch:${bid}`;
    const sockets = await this.server.in(room).fetchSockets();

    const byTenant = new Map<string, typeof sockets>();
    for (const s of sockets) {
      const tenantKey = (s.data as { tenantId?: string }).tenantId ?? '__none__';
      const bucket = byTenant.get(tenantKey);
      if (bucket) bucket.push(s); else byTenant.set(tenantKey, [s]);
    }

    await Promise.all(
      Array.from(byTenant.entries()).map(async ([tenantKey, tenantSockets]) => {
        const tenantId = tenantKey === '__none__' ? undefined : tenantKey;
        const state = await this.tokenService.getAllLocationsState(bid, tenantId ?? null);
        for (const s of tenantSockets) {
          s.emit('token:state', state);
        }
      }),
    );
  }

  /**
   * GAP-20: Broadcast token sequence rollover notification to the branch room.
   * Clients (counters, display boards) should show an alert so staff know
   * the counter has wrapped around to startNumber.
   */
  broadcastRollover(
    branchId: string,
    referenceId: string,
    maxNumber: number,
    startNumber: number,
  ): void {
    const bid = branchId ?? DEFAULT_BRANCH_ID;
    this.server.to(`branch:${bid}`).emit('token:rollover', {
      branchId: bid,
      referenceId,
      maxNumber,
      startNumber,
      rolledAt: new Date().toISOString(),
    });
  }

  /** GAP-5: broadcast daily-reset event so kiosks and display boards can react */
  broadcastReset(branchId: string): void {
    const bid = branchId ?? DEFAULT_BRANCH_ID;
    this.server.to(`branch:${bid}`).emit('token:daily-reset', { branchId: bid, resetAt: new Date().toISOString() });
  }

  /** Emit an event to a specific display board room */
  broadcastToDisplay(slug: string, event: string, data: unknown): void {
    this.server.to(`display:${slug}`).emit(event, data);
  }

  /** Emit an event to a specific kiosk room */
  broadcastToKiosk(slug: string, event: string, data: unknown): void {
    this.server.to(`kiosk:${slug}`).emit(event, data);
  }

  private hasPermission(client: Socket, perm: string): boolean {
    const roles: string[] = (client.data.role as string ?? '').split(',').filter(Boolean);
    if (roles.includes('SUPER_ADMIN') || roles.includes('HOSPITAL_ADMIN')) return true;
    return (client.data.permissions as string[] ?? []).includes(perm);
  }
}
