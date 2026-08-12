import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { KioskPairing } from './entities/kiosk-pairing.entity';
import { KioskDevice, KioskDeviceStatus } from './entities/kiosk-device.entity';
import { KioskRegistrationService } from './kiosk-registration.service';
import { generateActivationCode, normalizeActivationCode } from '../tenant-provisioning/connector-activation-code.util';
import { CreateKioskPairingDto } from './dto/create-kiosk-pairing.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class KioskAdminService {
  constructor(
    @InjectRepository(KioskPairing) private readonly pairingRepo: Repository<KioskPairing>,
    @InjectRepository(KioskDevice) private readonly deviceRepo: Repository<KioskDevice>,
  ) {}

  /**
   * Generates a new activation code for a specific kiosk URL and returns
   * the raw, dash-formatted code exactly once for display (only the
   * bcrypt hash is persisted, same discipline as TenantConnectorPairing).
   * Hospital IT types this code into the kiosk-desktop setup screen once,
   * on the till itself.
   *
   * Hashes the NORMALIZED code (dashes stripped, via
   * normalizeActivationCode -- the same function
   * KioskRegistrationService.register() runs the user's typed-in code
   * through before comparing) rather than the raw "XXXX-XXXX-XXXX"
   * string. Hashing the raw dashed string here while comparing a
   * normalized, dash-stripped string at redemption time would make every
   * activation code fail bcrypt.compare() unconditionally, regardless of
   * what's typed in -- caught 2026-07-25 via a real activation attempt
   * failing immediately on a freshly generated code. (This exact
   * generate/redeem mismatch appears to also exist in
   * TenantProvisioningService's Connector pairing-key generation --
   * flagged separately, out of scope to fix here.)
   */
  async createPairing(tenantId: string, dto: CreateKioskPairingDto, createdBy?: string) {
    const rawCode = generateActivationCode();
    const activationCodeHash = await bcrypt.hash(normalizeActivationCode(rawCode), BCRYPT_ROUNDS);

    const expiresInHours = dto.expiresInHours ?? 72;
    const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);

    const pairing = await this.pairingRepo.save(this.pairingRepo.create({
      tenantId,
      activationCodeHash,
      label: dto.label ?? null,
      kioskUrl: dto.kioskUrl,
      status: 'pending',
      createdBy: createdBy ?? null,
      expiresAt,
    }));

    return { pairingId: pairing.id, activationCode: rawCode, expiresAt: pairing.expiresAt };
  }

  async listPairings(tenantId: string) {
    return this.pairingRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async revokePairing(tenantId: string, pairingId: string) {
    const pairing = await this.pairingRepo.findOne({ where: { id: pairingId, tenantId } });
    if (!pairing) throw new NotFoundException('Activation code not found');
    pairing.status = 'revoked';
    pairing.revokedAt = new Date();
    return this.pairingRepo.save(pairing);
  }

  async listDevices(tenantId: string): Promise<Array<KioskDevice & { displayStatus: KioskDeviceStatus }>> {
    const devices = await this.deviceRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
    return devices.map((device) => ({
      ...device,
      displayStatus: KioskRegistrationService.computeDisplayStatus(device),
    }));
  }

  async disableDevice(tenantId: string, deviceId: string): Promise<KioskDevice> {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId, tenantId } });
    if (!device) throw new NotFoundException('Kiosk device not found');
    device.status = 'disabled';
    device.disabledAt = new Date();
    return this.deviceRepo.save(device);
  }

  async enableDevice(tenantId: string, deviceId: string): Promise<KioskDevice> {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId, tenantId } });
    if (!device) throw new NotFoundException('Kiosk device not found');
    if (device.status === 'disabled') {
      device.status = device.lastHeartbeatAt ? 'offline' : 'registered';
      device.disabledAt = null;
    }
    return this.deviceRepo.save(device);
  }

  async revokeDevice(tenantId: string, deviceId: string): Promise<KioskDevice> {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId, tenantId } });
    if (!device) throw new NotFoundException('Kiosk device not found');
    device.status = 'revoked';
    device.revokedAt = new Date();
    return this.deviceRepo.save(device);
  }
}
