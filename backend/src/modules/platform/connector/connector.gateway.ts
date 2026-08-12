import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { ConnectorInstance } from './entities/connector-instance.entity';
import type { MessageTransportRequest, MessageTransportResponse, SyncedTemplateDefinition } from '@hdsp/connector';

export interface ConnectorConnectedEvent {
  connectorId: string;
  tenantId: string;
}

interface ConnectorJwtPayload {
  sub: string;      // ConnectorInstance.id
  tenantId: string;
  type: 'connector_access' | 'connector_refresh';
  jti: string;
}

export class ConnectorOfflineError extends Error {
  constructor(connectorId: string) {
    super(`Connector "${connectorId}" is not currently connected`);
    this.name = 'ConnectorOfflineError';
  }
}

interface PendingRequest {
  connectorId: string;
  resolve: (res: MessageTransportResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * ConnectorGateway (ZoeConnect Connector, Phase B — 2026-07-21).
 *
 * The WebSocket-facing half of `WEBSOCKETMessageTransport` (connector-side
 * counterpart: `connector/src/transport/websocket-message-transport.ts`).
 * Reuses the exact same `MessageTransportRequest`/`MessageTransportResponse`
 * shapes `RedisMessageTransport`/`CloudOracleTransport` already speak
 * (imported from `@hdsp/connector`, same as `cloud-oracle.transport.ts`
 * already does) — this is a NEW transport for the SAME protocol, not a
 * new protocol. That's deliberate: it means a future switch of
 * `CloudOracleTransport` from the Redis transport to this one (not done
 * in this pass — see this file's own scope note at the bottom) is a
 * wiring change, not a protocol rewrite.
 *
 * Auth pattern closely mirrors `TokenGateway.handleConnection()` (same
 * codebase, same shape: verify a JWT from `client.handshake.auth.token`,
 * populate `client.data`, join rooms) but verifies against
 * `jwt.connectorSecret` (NOT the user JWT secret) and requires
 * `type === 'connector_access'` — a connector token can never authenticate
 * here as a "user," and a user token can never authenticate here as a
 * connector, by construction (see `ConnectorRegistrationService`'s doc
 * comment on why the secrets are separate).
 *
 * Room strategy: `connector:{connectorId}` (exactly one socket, this
 * specific Connector process) and `tenant:{tenantId}` (all of a tenant's
 * connected connector instances — today always ≤1 in practice, but the
 * architecture doc's §4 deliberately doesn't preclude more than one for
 * HA later).
 *
 * Job dispatch/response correlation lives here (not in a separate
 * service) because it needs direct access to `this.server`/room
 * membership — `ConnectorJobDispatchService` (the BullMQ-backed durable
 * queue in front of this) calls `dispatchToConnector()` and awaits its
 * promise; this class has no idea BullMQ exists.
 *
 * NOT done in this pass (explicitly out of scope for Phase B, per
 * tonight's own scoping): wiring this into `ORACLE_TRANSPORT`/
 * `CloudOracleTransport`'s selection, so HIS business services can't
 * reach a Connector yet even once one is connected -- validated instead
 * via `ConnectorJobDispatchService`'s own test harness against the
 * existing `health-check-select-1` conformance query. Also not done:
 * periodic heartbeat messages (status is currently "online" for the
 * lifetime of the socket connection, "offline" the instant it
 * disconnects — good enough for tonight, but doesn't detect a
 * connector that's connected but wedged/unresponsive).
 *
 * `events` (D.3, "Dynamic Per-Tenant HIS Query Architecture" Publisher,
 * 2026-07-21): a plain Node `EventEmitter` emitting a `'connected'` event
 * (`ConnectorConnectedEvent`) after a socket successfully authenticates
 * and joins its rooms. `HisQueryDefinitionPublisherService` subscribes to
 * this to trigger a full template resync on every (re)connection (see
 * `DYNAMIC_HIS_QUERY_ARCHITECTURE.md` §7's lifecycle table) without this
 * gateway needing to know the Publisher exists -- avoids a circular
 * dependency (`HisConfigModule` already imports `ConnectorModule` for
 * `CloudOracleTransport`'s needs; having this gateway depend back on
 * something in `HisConfigModule` would invert that). A plain `EventEmitter`
 * rather than `@nestjs/event-emitter`'s `EventEmitter2` because this is a
 * single, gateway-local event with exactly one intended subscriber type --
 * pulling in a new module-wide dependency for that felt like more
 * machinery than the problem needs.
 */
@Injectable()
@WebSocketGateway({
  namespace: 'connector',
  cors: { origin: '*', credentials: true },
})
export class ConnectorGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(ConnectorGateway.name);

  // connectorId -> socket.id (exactly one live connection per connector today)
  private readonly connectorSockets = new Map<string, string>();
  // correlationId -> pending dispatch, so a disconnect can fail-fast every
  // outstanding request for that connector instead of waiting for a timeout.
  private readonly pending = new Map<string, PendingRequest>();

  /** See this class's doc comment -- emits 'connected' (ConnectorConnectedEvent) after successful auth. */
  readonly events = new EventEmitter();

  constructor(
    @InjectRepository(ConnectorInstance) private readonly instanceRepo: Repository<ConnectorInstance>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const rawToken = (client.handshake.auth?.token as string) || '';
      if (!rawToken) {
        client.emit('connector:error', { message: 'Missing connector access token' });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<ConnectorJwtPayload>(rawToken, {
        secret: this.config.get<string>('jwt.connectorSecret'),
      });
      if (payload.type !== 'connector_access') {
        throw new Error('Not a connector access token');
      }

      const instance = await this.instanceRepo.findOne({ where: { id: payload.sub } });
      if (!instance || instance.status === 'revoked') {
        client.emit('connector:error', { message: 'Connector instance not found or revoked' });
        client.disconnect();
        return;
      }

      client.data.connectorId = instance.id;
      client.data.tenantId = instance.tenantId;
      this.connectorSockets.set(instance.id, client.id);

      await client.join(`connector:${instance.id}`);
      await client.join(`tenant:${instance.tenantId}`);

      instance.status = 'online';
      instance.lastHeartbeatAt = new Date();
      await this.instanceRepo.save(instance);

      this.logger.log(`Connector connected: id=${instance.id} tenant=${instance.tenantId} socket=${client.id}`);
      this.events.emit('connected', { connectorId: instance.id, tenantId: instance.tenantId } satisfies ConnectorConnectedEvent);
    } catch (err) {
      this.logger.warn(`Connector connection rejected: ${(err as Error).message}`);
      client.emit('connector:error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const connectorId = client.data?.connectorId as string | undefined;
    if (!connectorId) return; // never authenticated -- nothing to clean up

    this.connectorSockets.delete(connectorId);

    // Fail-fast every request still waiting on this connector rather than
    // letting each one time out independently.
    for (const [correlationId, entry] of this.pending) {
      if (entry.connectorId === connectorId) {
        clearTimeout(entry.timer);
        entry.reject(new ConnectorOfflineError(connectorId));
        this.pending.delete(correlationId);
      }
    }

    try {
      const instance = await this.instanceRepo.findOne({ where: { id: connectorId } });
      if (instance && instance.status !== 'revoked') {
        instance.status = 'offline';
        await this.instanceRepo.save(instance);
      }
    } catch (err) {
      this.logger.warn(`Failed to mark connector ${connectorId} offline: ${(err as Error).message}`);
    }

    this.logger.log(`Connector disconnected: id=${connectorId}`);
  }

  @SubscribeMessage('connector:response')
  handleResponse(@MessageBody() res: MessageTransportResponse): void {
    const entry = this.pending.get(res.correlationId);
    if (!entry) return; // late response after timeout/disconnect -- discard, already handled
    clearTimeout(entry.timer);
    this.pending.delete(res.correlationId);
    entry.resolve(res);
  }

  isConnected(connectorId: string): boolean {
    return this.connectorSockets.has(connectorId);
  }

  /**
   * Sends a request to a specific, currently-connected connector and
   * resolves with its correlated response, or rejects on timeout /
   * disconnect / `ConnectorOfflineError` if it's not connected at all.
   * Callers (`ConnectorJobDispatchService`) should treat every rejection
   * here as retryable -- Bull's own retry/backoff handles "connector was
   * briefly offline," this method doesn't need its own retry loop.
   */
  dispatchToConnector(
    connectorId: string,
    req: MessageTransportRequest,
    timeoutMs = 15_000,
  ): Promise<MessageTransportResponse> {
    if (!this.isConnected(connectorId)) {
      return Promise.reject(new ConnectorOfflineError(connectorId));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req.correlationId);
        reject(new Error(`Connector "${connectorId}" did not respond within ${timeoutMs}ms (correlationId=${req.correlationId})`));
      }, timeoutMs);

      this.pending.set(req.correlationId, { connectorId, resolve, reject, timer });
      this.server.to(`connector:${connectorId}`).emit('connector:request', req);
    });
  }

  /**
   * One-way push of compiled query definitions to a specific connected
   * connector (D.3). No response is awaited or correlated -- unlike
   * `dispatchToConnector()`, this isn't a request the Connector answers,
   * it's the Connector being told "here is what you should have locally
   * now." Callers (`HisQueryDefinitionPublisherService`) should check
   * `isConnected()` first if they want to avoid emitting into an empty
   * room; this method doesn't guard against that itself since a push to a
   * momentarily-disconnected room is harmless (socket.io simply delivers
   * to nobody), just not silently a no-op the caller should be surprised by.
   */
  pushTemplateSync(connectorId: string, definitions: SyncedTemplateDefinition[]): void {
    this.server.to(`connector:${connectorId}`).emit('connector:sync-templates', { definitions });
  }
}
