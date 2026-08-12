import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { InjectRedis } from '../../../common/redis/redis.provider';
import { User } from '../../users/entities/user.entity';
import { CACHE_KEYS } from '../../../config/redis.config';

export interface JwtPayload {
  sub: string;          // user ID
  jti: string;          // JWT ID — used for token blacklisting on logout
  username: string;
  hisEmployeeCode?: string | null;
  roles: string[];      // role names (multi-role)
  /**
   * Phase 8 (Multi-Tenancy Activation, Task 8.1) — the tenant this token
   * was minted for, resolved from `user.tenantId` at login time. Still
   * `'default'`'s UUID/code for every existing self-hosted install (Stage
   * A backfilled `user.tenantId` to the single seeded tenant everywhere).
   * Optional (not `?? throw`) so a token minted before this field existed
   * still decodes -- `JwtStrategy.validate()` doesn't require it, only
   * `TenantScopeGuard` (Task 8.3) reads it, and a short (15m) access-token
   * TTL means pre-Phase-8 tokens naturally expire within the deployment
   * window rather than needing a forced re-login.
   */
  tenantId?: string | null;
  /**
   * ZoeConnect Identity Architecture Migration, Phase 2 -- additive alias of
   * `tenantId` above, always stamped with the exact same value at token
   * generation time (see `AuthService.generateTokens()`). Introduced so the
   * JWT literally carries an `organizationId` claim per the target identity
   * model, without renaming `tenantId`/`Tenant` anywhere in this phase (an
   * explicit project-owner instruction -- see that entity's own doc
   * comments). Purely additive: nothing reads this yet, `tenantId` remains
   * the field every existing guard/interceptor/resolver actually checks.
   * Do not let the two drift -- if `tenantId`'s resolution logic ever
   * changes, update this alongside it in the same commit.
   */
  organizationId?: string | null;
  /** Tenant.code (the roadmap's "slug") -- human-readable, for logging/diagnostics; not used for any authorization decision (tenantId is). */
  tenantSlug?: string | null;
  /** Active branch (Oracle orgstructure.id as string). null = not yet selected. */
  activeBranchId?: string | null;
  /** Active department mapped from HIS (Oracle id). null = not yet selected. */
  activeDepartmentId?: string | null;
  /** Active service center mapped from HIS (Oracle id). null = not yet selected. */
  activeServiceCenterId?: string | null;
  /**
   * Display names for activeDepartmentId/activeServiceCenterId, as sent directly
   * by HIS at login time. Oracle's hisdepartment/servicecenter tables (queried
   * live for the manual join panel dropdowns) don't always contain the exact
   * record HIS itself has selected, so these are carried through the JWT as a
   * fallback the frontend can render without depending on that lookup.
   */
  activeDepartmentName?: string | null;
  activeServiceCenterName?: string | null;
  /** True if this session was spawned via HIS auto-login, which locks the location context */
  isHisIntegration?: boolean;
  iat?: number;
  exp?: number;
}

/**
 * Minted only by RegistrationService.mintCapabilityToken() when a token is
 * reserved. Carries no roles/permissions -- it authorizes exactly one
 * reservation's heartbeat/release/map calls, nothing else. Used by the
 * popup-window HIS integration: the HIS page's own JavaScript holds this
 * token (received via postMessage from the popup) and calls the ZoeConnect API
 * directly, cross-origin, without ever touching the receptionist's real
 * session/cookie. See common/guards/reservation-scope.guard.ts for the
 * per-request tokenNumber/reservationId enforcement.
 */
export interface ReservationCapabilityPayload {
  sub:           string; // same userId that made the reservation
  type:          'reservation-capability';
  tokenNumber:   string;
  reservationId: string;
  branchId:      string;
  jti:           string;
  iat?:          number;
  exp?:          number;
}

export interface ReservationCapabilityPrincipal {
  id:               string;
  username:         string;
  isCapabilityToken: true;
  capability: {
    tokenNumber:   string;
    reservationId: string;
    branchId:      string;
  };
}

/**
 * Minted only by WorkstationService.mintSessionToken() -- see
 * modules/token/workstation/workstation.service.ts. Represents "this popup
 * speaks for a configured physical workstation," not a human user: no
 * roles, no permissions, no ZoeConnect login ever happened. Deliberately broader
 * than ReservationCapabilityPayload (it can reserve NEW tokens, not just
 * act on one already-made reservation) but still scoped to exactly one
 * workstation's branch/location/counter -- it cannot read or act on any
 * other workstation's context.
 */
export interface WorkstationSessionPayload {
  sub:           string; // `workstation:${workstationId}`
  type:          'workstation';
  workstationId: string;
  branchId:      string;
  locationId:    string;
  counterId:     string;
  jti:           string;
  iat?:          number;
  exp?:          number;
}

export interface WorkstationPrincipal {
  id:                string;
  username:          string;
  isWorkstationToken: true;
  workstation: {
    workstationId: string;
    branchId:      string;
    locationId:    string;
    counterId:     string;
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRedis() private readonly redis: Redis,
  ) {
    super({
      // Standard clients send the token in the Authorization header. The native
      // browser EventSource API used for SSE (token/registration/queue/stream)
      // cannot set custom headers, so we additionally accept the token via an
      // `access_token` query parameter -- header auth is always tried first and
      // is unaffected. Query-string tokens are short-lived (jwt.expiresIn) and
      // the Nginx access log format for this route masks the query string (see
      // docs/his-integration/nginx-hdsp-widget.conf) to limit log exposure.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('access_token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret'),
    });
  }

  async validate(
    payload: JwtPayload | ReservationCapabilityPayload | WorkstationSessionPayload,
  ): Promise<User | ReservationCapabilityPrincipal | WorkstationPrincipal> {
    // Reservation-capability tokens are a completely different, much
    // narrower principal: no DB user lookup, no roles/permissions, just the
    // one reservation they were minted for. Signature/expiry are already
    // verified by passport-jwt (same jwt.secret) before validate() runs, so
    // no forgery risk in trusting these claims as-is.
    if ((payload as ReservationCapabilityPayload).type === 'reservation-capability') {
      const cap = payload as ReservationCapabilityPayload;
      return {
        id:                cap.sub,
        username:          cap.sub,
        isCapabilityToken: true,
        capability: {
          tokenNumber:   cap.tokenNumber,
          reservationId: cap.reservationId,
          branchId:      cap.branchId,
        },
      };
    }

    // Workstation session tokens: same trust reasoning as above (signature
    // already verified) -- no DB lookup, no human identity at all.
    if ((payload as WorkstationSessionPayload).type === 'workstation') {
      const w = payload as WorkstationSessionPayload;
      return {
        id:                 w.sub,
        username:           w.sub,
        isWorkstationToken: true,
        workstation: {
          workstationId: w.workstationId,
          branchId:      w.branchId,
          locationId:    w.locationId,
          counterId:     w.counterId,
        },
      };
    }

    // Check blacklist — token revoked on logout or password change
    const isBlacklisted = await this.redis.exists(CACHE_KEYS.JWT_BLACKLIST(payload.jti));
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Built manually rather than `this.userRepo.findOne({ relations: [...] })`
    // -- `User.roles`/`User.directPermissions` (and `Role.permissions`) are
    // `eager: true`, and `Repository.findOne()` always sets an internal
    // `take: 1`; combined with any to-many join that trips TypeORM's
    // `distinctAlias.User_id does not exist` pagination-safety bug (see
    // `UsersService` for the full writeup). This runs on every authenticated
    // request, so it's worth keeping off that code path entirely rather than
    // relying on it happening not to trigger today.
    const user = await this.userRepo.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'rolePermissions')
      .leftJoinAndSelect('user.directPermissions', 'directPermissions')
      .where('user.id = :id', { id: payload.sub })
      .getOne();

    if (!user) throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');
    if (user.isLocked) throw new UnauthorizedException('Account is temporarily locked');

    return user;
  }
}
