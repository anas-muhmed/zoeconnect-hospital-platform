import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { InjectRedis } from '../../../common/redis/redis.provider';
import { KioskDevice, KioskDeviceStatus } from './entities/kiosk-device.entity';
import { KioskPairing } from './entities/kiosk-pairing.entity';
import { normalizeActivationCode } from '../tenant-provisioning/connector-activation-code.util';

/**
 * Registration/refresh/heartbeat for Kiosk Desktop (Electron) tills.
 * Deliberately mirrors ConnectorRegistrationService
 * (../connector/connector-registration.service.ts) field-for-field where
 * the two devices' lifecycles genuinely match (activation-code redemption,
 * separate-secret JWT issuance, jti-blacklist refresh rotation) -- see
 * that file's inline comments for the full rationale, not repeated here.
 * The one real behavioural difference is `heartbeat()`, which the
 * Connector doesn't have a REST equivalent of yet (it flips online/offline
 * from its WebSocket gateway's connect/disconnect instead) -- kiosks poll
 * over plain REST on a timer, so this is a genuine addition, not a copy.
 *
 * Reuses `normalizeActivationCode` from the Connector's own
 * tenant-provisioning util rather than re-implementing code parsing --
 * the two devices deliberately share the same human-typeable
 * XXXX-XXXX-XXXX code shape.
 */

interface KioskJwtPayload {
  sub: string; // KioskDevice.id
  tenantId: string;
  type: 'kiosk_access' | 'kiosk_refresh';
  jti: string;
}

// A kiosk is considered "online" if it heartbeat within the last 90s --
// 3x the kiosk-desktop ConnectionMonitor/heartbeat interval (30s), giving
// slack for one missed beat before flipping to "offline" in admin views.
const ONLINE_THRESHOLD_MS = 90_000;

@Injectable()
export class KioskRegistrationService {
  private readonly logger = new Logger(KioskRegistrationService.name);

  constructor(
    @InjectRepository(KioskDevice) private readonly deviceRepo: Repository<KioskDevice>,
    @InjectRepository(KioskPairing) private readonly pairingRepo: Repository<KioskPairing>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async register(activationCode: string, hostname?: string, appVersion?: string) {
    const normalizedCode = normalizeActivationCode(activationCode);

    const candidates = await this.pairingRepo.find({ where: { status: 'pending' } });
    const now = new Date();
    let matched: KioskPairing | null = null;
    for (const candidate of candidates) {
      if (candidate.expiresAt && candidate.expiresAt < now) continue;
      if (await bcrypt.compare(normalizedCode, candidate.activationCodeHash)) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      this.logger.warn('Kiosk registration failed: no matching pending activation code');
      throw new UnauthorizedException('Invalid or expired activation code');
    }

    matched.status = 'active';
    await this.pairingRepo.save(matched);

    const device = await this.deviceRepo.save(this.deviceRepo.create({
      tenantId: matched.tenantId,
      pairingId: matched.id,
      label: matched.label,
      kioskUrl: matched.kioskUrl,
      status: 'registered',
      hostname: hostname ?? null,
      appVersion: appVersion ?? null,
    }));

    this.logger.log(`Kiosk device registered: id=${device.id} tenant=${matched.tenantId} pairing=${matched.id}`);

    const tokens = await this.issueTokens(device.id, device.tenantId);
    return {
      kioskDeviceId: device.id,
      tenantId: device.tenantId,
      kioskUrl: device.kioskUrl,
      label: device.label,
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    let payload: KioskJwtPayload;
    try {
      payload = this.jwtService.verify<KioskJwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.kioskRefreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired kiosk refresh token');
    }
    if (payload.type !== 'kiosk_refresh') {
      throw new UnauthorizedException('Invalid kiosk refresh token');
    }

    const isBlacklisted = await this.redis.exists(this.blacklistKey(payload.jti));
    if (isBlacklisted) throw new UnauthorizedException('Kiosk refresh token revoked');

    const device = await this.deviceRepo.findOne({ where: { id: payload.sub } });
    if (!device || device.status === 'revoked' || device.status === 'disabled') {
      throw new UnauthorizedException('Kiosk device not found, disabled, or revoked');
    }

    const refreshTtl = this.parseTtl(this.config.get<string>('jwt.kioskRefreshExpiresIn', '90d'));
    await this.redis.setex(this.blacklistKey(payload.jti), refreshTtl, '1');

    const tokens = await this.issueTokens(device.id, device.tenantId);
    return { kioskDeviceId: device.id, tenantId: device.tenantId, kioskUrl: device.kioskUrl, ...tokens };
  }

  /**
   * Called by KioskAuthGuard-protected `POST /kiosk/heartbeat` roughly
   * every 30s from a live kiosk. Rejects (throws) if the device has been
   * administratively disabled/revoked since it last checked in, so
   * kiosk-desktop's heartbeat loop can detect that and switch itself to a
   * "this kiosk has been disabled" screen without the admin having to
   * physically visit the till.
   */
  async heartbeat(deviceId: string, meta: { hostname?: string; appVersion?: string }): Promise<KioskDevice> {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
    if (!device) throw new UnauthorizedException('Kiosk device not found');
    if (device.status === 'disabled' || device.status === 'revoked') {
      throw new ForbiddenException(`Kiosk device is ${device.status}`);
    }

    device.status = 'online';
    device.lastHeartbeatAt = new Date();
    if (meta.hostname) device.hostname = meta.hostname;
    if (meta.appVersion) device.appVersion = meta.appVersion;
    return this.deviceRepo.save(device);
  }

  /** Read-time status: flips a stale 'online' row to 'offline' for display, without a background job. See ONLINE_THRESHOLD_MS. */
  static computeDisplayStatus(device: KioskDevice): KioskDeviceStatus {
    if (device.status === 'disabled' || device.status === 'revoked' || device.status === 'registered') {
      return device.status;
    }
    const isStale = !device.lastHeartbeatAt
      || Date.now() - device.lastHeartbeatAt.getTime() > ONLINE_THRESHOLD_MS;
    return isStale ? 'offline' : 'online';
  }

  private async issueTokens(deviceId: string, tenantId: string) {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();

    const accessToken = this.jwtService.sign(
      { sub: deviceId, tenantId, type: 'kiosk_access', jti: accessJti } as KioskJwtPayload,
      {
        secret: this.config.get<string>('jwt.kioskSecret'),
        expiresIn: this.config.get<string>('jwt.kioskExpiresIn', '15m'),
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: deviceId, tenantId, type: 'kiosk_refresh', jti: refreshJti } as KioskJwtPayload,
      {
        secret: this.config.get<string>('jwt.kioskRefreshSecret'),
        expiresIn: this.config.get<string>('jwt.kioskRefreshExpiresIn', '90d'),
      },
    );
    return { accessToken, refreshToken };
  }

  private blacklistKey(jti: string): string {
    return `kiosk:jwt:blacklist:${jti}`;
  }

  private parseTtl(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 90 * 86400;
    const val = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return val * (multipliers[unit] ?? 86400);
  }
}
