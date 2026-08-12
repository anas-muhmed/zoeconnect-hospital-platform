import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { InjectRedis } from '../../../common/redis/redis.provider';
import { ConnectorInstance } from './entities/connector-instance.entity';
import { TenantConnectorPairing } from '../tenant-provisioning/entities/tenant-connector-pairing.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { normalizeActivationCode } from '../tenant-provisioning/connector-activation-code.util';

interface ConnectorJwtPayload {
  sub: string;      // ConnectorInstance.id
  tenantId: string;
  type: 'connector_access' | 'connector_refresh';
  jti: string;
}

/**
 * ConnectorRegistrationService (ZoeConnect Connector, Phase A — 2026-07-21).
 *
 * Finally consumes `TenantConnectorPairing`, which
 * `TenantProvisioningService.stepGenerateConnectorPairingKey()` has been
 * generating (one 'pending' row per cloud tenant, auto-run during
 * provisioning) since long before any connector-side code existed to
 * redeem it. See both `HDSP_CLOUD_CONNECTOR_ARCHITECTURE.md` (§6, §11)
 * and `HDSP_CONNECTOR_CURRENT_STATE_AUDIT.md` ("the biggest missing
 * piece") for why this specific gap mattered more than any other: without
 * it, nothing distinguishes which tenant a Connector process actually
 * belongs to once it reaches a shared transport.
 *
 * Token design deliberately mirrors `AuthService`'s existing
 * access+refresh pattern (stateless JWTs, verified against a config
 * secret, blacklist-on-rotate via a short-TTL Redis key keyed by `jti`) --
 * same shape, same operational story, easiest to reason about --
 * but signed with SEPARATE `jwt.connectorSecret`/`connectorRefreshSecret`
 * values (see `jwt.config.ts`) so a connector token can never be presented
 * to `JwtAuthGuard`/`JwtStrategy` (user routes) and succeed, and vice
 * versa, even by accident.
 *
 * A pairing key is single-use: redeeming it flips the owning
 * `TenantConnectorPairing.status` from 'pending' to 'active' in the same
 * call. A lost/corrupted local connector credential requires the admin to
 * generate a fresh pairing key (not built yet — Phase A only covers the
 * consume side; TenantProvisioningService already has the generate side)
 * rather than reusing the original one, matching the "shown once, never
 * recoverable" convention this codebase already uses for every other
 * bootstrap secret (instance tokens, vendor registration).
 */
@Injectable()
export class ConnectorRegistrationService {
  private readonly logger = new Logger(ConnectorRegistrationService.name);

  constructor(
    @InjectRepository(ConnectorInstance) private readonly instanceRepo: Repository<ConnectorInstance>,
    @InjectRepository(TenantConnectorPairing) private readonly pairingRepo: Repository<TenantConnectorPairing>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * D.6 ("Onboarding UX," 2026-07-22): `tenantCode` is now OPTIONAL.
   * Hospital IT typing an Activation Code into the Connector's local
   * config UI (`ConnectorGateway`'s "one screen, one field" design goal)
   * should never need to also know or enter their tenant's internal code
   * -- the code itself is sufficiently unique (see
   * connector-activation-code.util.ts's entropy analysis) to identify the
   * right tenant via a global candidate scan. `tenantCode` stays
   * supported (unchanged behavior, scoped scan) for any other caller that
   * already has it and wants the narrower/faster lookup -- backward
   * compatible, not replaced.
   *
   * `pairingKey` is normalized (`normalizeActivationCode()`) before
   * comparison, so "abcd-efgh-jklm", "ABCDEFGHJKLM", and "abcd efgh jklm"
   * (typed, pasted, or read aloud over the phone) all match identically --
   * the SAME normalization the generator's hash was computed from, so
   * this is not a leniency added on top of the stored hash, it's the
   * canonical form the hash always represented.
   */
  async register(tenantCode: string | undefined, pairingKey: string, hostname?: string) {
    const normalizedCode = normalizeActivationCode(pairingKey);
    let tenant: Tenant | null = null;

    if (tenantCode) {
      tenant = await this.tenantRepo.findOne({ where: { code: tenantCode } });
      if (!tenant) {
        // Deliberately the same message as "code didn't match" below --
        // don't let an attacker distinguish "tenant code doesn't exist"
        // from "tenant exists but code is wrong" via response content.
        throw new UnauthorizedException('Invalid tenant code or activation code');
      }
    }

    // A tenant may have multiple 'pending' pairing rows (e.g. an earlier
    // code expired/was never redeemed and a fresh one was generated) --
    // bcrypt.compare every candidate rather than assuming exactly one
    // exists. Scoped to one tenant's rows when tenantCode was given;
    // otherwise a global scan across every tenant's currently-pending
    // codes (see this method's own doc comment for why that's safe).
    const candidates = await this.pairingRepo.find({
      where: tenant ? { tenantId: tenant.id, status: 'pending' } : { status: 'pending' },
    });

    const now = new Date();
    let matched: TenantConnectorPairing | null = null;
    for (const candidate of candidates) {
      if (candidate.expiresAt && candidate.expiresAt < now) continue; // expired -- never a valid match, regardless of hash
      if (await bcrypt.compare(normalizedCode, candidate.pairingKeyHash)) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      this.logger.warn(`Connector registration failed: no matching pending activation code${tenantCode ? ` for tenant "${tenantCode}"` : ''}`);
      throw new UnauthorizedException('Invalid tenant code or activation code');
    }

    // Resolve the tenant now if the scan was global (tenant wasn't looked
    // up above because tenantCode wasn't given).
    if (!tenant) {
      tenant = await this.tenantRepo.findOne({ where: { id: matched.tenantId } });
      if (!tenant) {
        // Should be unreachable (a pairing row's tenantId always refers to
        // a real tenant) -- fails loudly rather than silently registering
        // a connector against a tenant that no longer exists.
        throw new UnauthorizedException('Invalid tenant code or activation code');
      }
    }

    matched.status = 'active';
    await this.pairingRepo.save(matched);

    const instance = await this.instanceRepo.save(this.instanceRepo.create({
      tenantId: tenant.id,
      pairingId: matched.id,
      status: 'registered',
      hostname: hostname ?? null,
    }));

    this.logger.log(`Connector registered: id=${instance.id} tenant=${tenant.code} pairing=${matched.id}`);

    const tokens = await this.issueTokens(instance.id, tenant.id);
    return { connectorId: instance.id, tenantId: tenant.id, ...tokens };
  }

  async refresh(refreshToken: string) {
    let payload: ConnectorJwtPayload;
    try {
      payload = this.jwtService.verify<ConnectorJwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.connectorRefreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired connector refresh token');
    }
    if (payload.type !== 'connector_refresh') {
      throw new UnauthorizedException('Invalid connector refresh token');
    }

    const isBlacklisted = await this.redis.exists(this.blacklistKey(payload.jti));
    if (isBlacklisted) throw new UnauthorizedException('Connector refresh token revoked');

    const instance = await this.instanceRepo.findOne({ where: { id: payload.sub } });
    if (!instance || instance.status === 'revoked') {
      throw new UnauthorizedException('Connector instance not found or revoked');
    }

    // Rotate: blacklist the redeemed refresh token's jti for its
    // remaining lifetime (same shape as AuthService.refreshToken()), issue
    // a fresh access+refresh pair.
    const refreshTtl = this.parseTtl(this.config.get<string>('jwt.connectorRefreshExpiresIn', '30d'));
    await this.redis.setex(this.blacklistKey(payload.jti), refreshTtl, '1');

    const tokens = await this.issueTokens(instance.id, instance.tenantId);
    return { connectorId: instance.id, tenantId: instance.tenantId, ...tokens };
  }

  private async issueTokens(connectorId: string, tenantId: string) {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();

    const accessToken = this.jwtService.sign(
      { sub: connectorId, tenantId, type: 'connector_access', jti: accessJti } as ConnectorJwtPayload,
      {
        secret: this.config.get<string>('jwt.connectorSecret'),
        expiresIn: this.config.get<string>('jwt.connectorExpiresIn', '15m'),
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: connectorId, tenantId, type: 'connector_refresh', jti: refreshJti } as ConnectorJwtPayload,
      {
        secret: this.config.get<string>('jwt.connectorRefreshSecret'),
        expiresIn: this.config.get<string>('jwt.connectorRefreshExpiresIn', '30d'),
      },
    );
    return { accessToken, refreshToken };
  }

  private blacklistKey(jti: string): string {
    return `connector:jwt:blacklist:${jti}`;
  }

  private parseTtl(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 30 * 86400;
    const val = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return val * (multipliers[unit] ?? 86400);
  }
}
