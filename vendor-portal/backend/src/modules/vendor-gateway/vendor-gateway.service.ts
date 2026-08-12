import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordReset } from '../hospitals/entities/password-reset.entity';
import { Hospital } from '../hospitals/entities/hospital.entity';
import { CloudTenant } from '../cloud-tenants/entities/cloud-tenant.entity';
import { SigningService } from '../signing/signing.service';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';

export interface VendorGatewayResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  commandId?: string;
}

@Injectable()
export class VendorGatewayService {
  private readonly logger = new Logger(VendorGatewayService.name);

  constructor(
    @InjectRepository(Hospital)
    private readonly hospitalRepo: Repository<Hospital>,
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepo: Repository<PasswordReset>,
    @InjectRepository(CloudTenant)
    private readonly cloudTenantRepo: Repository<CloudTenant>,
    private readonly signingService: SigningService,
  ) {}

  private async fetchHospital(hospitalId: string): Promise<Hospital> {
    const hospital = await this.hospitalRepo.findOne({ where: { id: hospitalId } });
    if (!hospital) throw new NotFoundException(`Hospital ${hospitalId} not found`);
    return hospital;
  }

  /**
   * Customers merge (Phase 2, 2026-07-20) -- this whole gateway proxies
   * commands/queries to a physical self-hosted instance at
   * publicIp:publicPort, signed with instanceSecret/instanceToken. A cloud
   * hospital row has none of these (see hospital.entity.ts) -- there is no
   * per-tenant instance for the Vendor Portal to remote-command on a shared
   * cloud backend. Same reasoning as HospitalsService.assertSelfHosted();
   * duplicated here rather than shared since this service has no
   * dependency on HospitalsService today.
   */
  private assertSelfHosted(hospital: Hospital): asserts hospital is Hospital & {
    publicIp: string; publicPort: number; instanceToken: string; instanceSecret: string;
  } {
    if (hospital.deploymentType === 'cloud') {
      throw new BadRequestException(
        'Remote Admin commands are not available for cloud tenants yet -- there is no physical instance to reach. ' +
        'See CLOUD_VS_SELF_HOSTED_ROADMAP.md, Phase 3.',
      );
    }
  }

  private generateSignature(
    method: string, 
    path: string, 
    timestamp: string, 
    nonce: string, 
    body: string, 
    secret: string
  ): string {
    const payload = `${method}${path}${timestamp}${nonce}${body}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  async getPasswordResetRequests(hospitalId: string) {
    return this.passwordResetRepo.find({ where: { hospitalId }, order: { createdAt: 'DESC' } });
  }

  async approvePasswordResetRequest(hospitalId: string, reqId: string, note: string, vendorUserId: string) {
    const request = await this.passwordResetRepo.findOne({ where: { id: reqId, hospitalId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'REQUESTED') throw new BadRequestException('Request already processed');

    const hospital = await this.fetchHospital(hospitalId);

    // Cloud-vs-self-hosted split (architecture review follow-up, 2026-07-31):
    // Remote Admin (executeCommand(), below) is an HMAC-signed HTTP POST to
    // hospital.publicIp:publicPort -- it stays responsible ONLY for
    // communicating with a physical self-hosted instance, per
    // assertSelfHosted()'s doc comment, and is never extended to understand
    // "cloud". Cloud tenants instead go through the dedicated Cloud Security
    // API (pushCloudPasswordReset(), mirroring pushCloudEntitlement() /
    // CloudLicensingController exactly) -- a direct, HMAC-authenticated call
    // addressed by hdspTenantId, not an IP:port. This keeps Remote Instance
    // Management (self-hosted) and Cloud Platform Management (cloud)
    // architecturally distinct rather than teaching one transport both jobs.
    const res = hospital.deploymentType === 'cloud'
      ? await this.pushCloudPasswordReset(hospital, request.username, reqId)
      : await this.executeCommand<{ temporaryPassword: string }>(
          hospitalId,
          `/api/v1/vendor/command/security/users/${request.username}/actions/reset-password`,
          { vendorRequestId: reqId },
        );
    if (!res.ok) throw new BadRequestException(`ZoeConnect Command failed: ${res.error}`);

    request.status = 'APPROVED';
    request.approvalNote = note;
    request.approvedBy = vendorUserId;
    request.approvedAt = new Date();
    await this.passwordResetRepo.save(request);

    return { status: 'APPROVED', temporaryPassword: res.data?.temporaryPassword };
  }

  /**
   * Cloud Security API push (mirrors HospitalsService.pushCloudEntitlement()
   * exactly -- same base-URL env var, same HMAC-over-raw-body scheme keyed
   * by the cloud tenant's own `CloudTenant.instanceSecret`, same timeout,
   * same ok/error result shape). Calls the new
   * `platform/security/tenants/:hdspTenantId/password-reset` endpoint on
   * ZoeConnect Cloud, which applies the reset in-process via
   * `PasswordResetService.applyRemoteReset()` -- no IP:port, no Remote Admin
   * command, no webhook.
   */
  private async pushCloudPasswordReset(
    hospital: Hospital,
    username: string,
    vendorRequestId: string,
  ): Promise<VendorGatewayResponse<{ temporaryPassword: string }>> {
    if (!hospital.cloudTenantId) {
      return { ok: false, error: 'Cloud hospital row has no linked cloudTenantId' };
    }
    const tenant = await this.cloudTenantRepo.findOne({ where: { id: hospital.cloudTenantId } });
    if (!tenant?.hdspTenantId || !tenant.instanceSecret) {
      return { ok: false, error: 'Cloud tenant has no hdspTenantId/instanceSecret yet (provisioning may not have completed)' };
    }

    const baseUrl = process.env.HDSP_BACKEND_URL;
    if (!baseUrl) {
      return { ok: false, error: 'HDSP_BACKEND_URL is not configured' };
    }

    const url = baseUrl.replace(/\/+$/, '') + `/api/v1/platform/security/tenants/${tenant.hdspTenantId}/password-reset`;
    const body = JSON.stringify({ username, vendorRequestId });
    const signature = this.signingService.computeHmac(tenant.instanceSecret, body);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':       'application/json',
          'X-Vendor-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        this.logger.warn(`Cloud Security API push to tenant ${tenant.hdspTenantId} failed (${res.status}): ${errText}`);
        return { ok: false, error: `HTTP ${res.status}: ${errText}` };
      }
      const data = await res.json();
      this.logger.log(`Cloud Security API push delivered to tenant ${tenant.hdspTenantId}`);
      return { ok: true, data };
    } catch (err: any) {
      this.logger.error(`Cloud Security API push failed for tenant ${tenant.hdspTenantId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Children's Village "standalone vs HIS-connected" control (see
   * backend/src/modules/childrens-village/adr/0001 and 0002 -- the ADRs that
   * call for exactly this to live in the Vendor Portal). Same
   * self-hosted/cloud branch as `approvePasswordResetRequest()` above:
   * self-hosted goes through the existing Remote Admin query/command path
   * (`executeQuery`/`executeCommand`, HMAC-signed against
   * `hospital.instanceSecret`); cloud goes through the dedicated
   * `CvCloudProviderConfigController` on ZoeConnect Cloud, HMAC-signed
   * against the linked `CloudTenant.instanceSecret`, mirroring
   * `pushCloudPasswordReset()` exactly.
   */
  async getChildrensVillageProvider(hospitalId: string): Promise<VendorGatewayResponse<{ mode: 'internal' | 'oracle_his' }>> {
    const hospital = await this.fetchHospital(hospitalId);
    if (hospital.deploymentType === 'cloud') {
      return this.pushCloudModuleConfig(hospital, 'GET', {});
    }
    return this.executeQuery(hospitalId, '/api/v1/vendor/query/modules/childrens-village/provider');
  }

  async setChildrensVillageProvider(
    hospitalId: string,
    mode: 'internal' | 'oracle_his',
  ): Promise<VendorGatewayResponse<{ mode: 'internal' | 'oracle_his' }>> {
    const hospital = await this.fetchHospital(hospitalId);
    if (hospital.deploymentType === 'cloud') {
      return this.pushCloudModuleConfig(hospital, 'SET', { mode });
    }
    return this.executeCommand(hospitalId, '/api/v1/vendor/command/modules/childrens-village/actions/set-provider', { mode });
  }

  /**
   * Shared cloud push for `getChildrensVillageProvider()`/`setChildrensVillageProvider()`
   * -- same base-URL env var, same HMAC-over-raw-body scheme keyed by the
   * cloud tenant's own `CloudTenant.instanceSecret`, same timeout, same
   * ok/error result shape as `pushCloudPasswordReset()`. `kind` picks the
   * "query" (no-op empty-body POST, see `CvCloudProviderConfigController`'s
   * doc comment for why GET wasn't used) vs "set" route on that controller.
   */
  private async pushCloudModuleConfig(
    hospital: Hospital,
    kind: 'GET' | 'SET',
    body: Record<string, unknown>,
  ): Promise<VendorGatewayResponse<{ mode: 'internal' | 'oracle_his' }>> {
    if (!hospital.cloudTenantId) {
      return { ok: false, error: 'Cloud hospital row has no linked cloudTenantId' };
    }
    const tenant = await this.cloudTenantRepo.findOne({ where: { id: hospital.cloudTenantId } });
    if (!tenant?.hdspTenantId || !tenant.instanceSecret) {
      return { ok: false, error: 'Cloud tenant has no hdspTenantId/instanceSecret yet (provisioning may not have completed)' };
    }

    const baseUrl = process.env.HDSP_BACKEND_URL;
    if (!baseUrl) {
      return { ok: false, error: 'HDSP_BACKEND_URL is not configured' };
    }

    const path = kind === 'GET' ? 'provider/query' : 'provider';
    const url = baseUrl.replace(/\/+$/, '') + `/api/v1/platform/modules/childrens-village/tenants/${tenant.hdspTenantId}/${path}`;
    const bodyString = JSON.stringify(body);
    const signature = this.signingService.computeHmac(tenant.instanceSecret, bodyString);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':       'application/json',
          'X-Vendor-Signature': signature,
        },
        body: bodyString,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        this.logger.warn(`Cloud Modules Config push to tenant ${tenant.hdspTenantId} failed (${res.status}): ${errText}`);
        return { ok: false, error: `HTTP ${res.status}: ${errText}` };
      }
      const data = await res.json();
      return { ok: true, data };
    } catch (err: any) {
      this.logger.error(`Cloud Modules Config push failed for tenant ${tenant.hdspTenantId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async rejectPasswordResetRequest(hospitalId: string, reqId: string, reason: string, vendorUserId: string) {
    const request = await this.passwordResetRepo.findOne({ where: { id: reqId, hospitalId } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'REQUESTED') throw new BadRequestException('Request already processed');
    
    request.status = 'REJECTED';
    request.rejectionReason = reason;
    request.approvedBy = vendorUserId;
    request.approvedAt = new Date();
    await this.passwordResetRepo.save(request);
    
    return { status: 'REJECTED' };
  }

  async executeQuery<T>(hospitalId: string, path: string): Promise<VendorGatewayResponse<T>> {
    const hospital = await this.fetchHospital(hospitalId);
    this.assertSelfHosted(hospital);

    // Vendor queries usually go to /api/v1/vendor/query/...
    const fullUrl = `http://${hospital.publicIp}:${hospital.publicPort}${path}`;
    
    const timestamp = Date.now().toString();
    const nonce = randomUUID();
    const correlationId = randomUUID();
    
    const signature = this.generateSignature('GET', path, timestamp, nonce, '', hospital.instanceSecret);

    try {
      this.logger.debug(`Executing query against ${hospital.hospitalCode}: ${path}`);
      const res = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'X-Instance-ID': hospital.instanceToken,
          'X-Timestamp': timestamp,
          'X-Nonce': nonce,
          'X-Signature': signature,
          'X-Correlation-ID': correlationId,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${errorText}` };
      }

      const data = await res.json();
      return { ok: true, data };
    } catch (err: any) {
      this.logger.error(`Query failed against ${hospital.hospitalCode} (${path}): ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async executeCommand<T>(hospitalId: string, path: string, payload: any): Promise<VendorGatewayResponse<T>> {
    const hospital = await this.fetchHospital(hospitalId);
    this.assertSelfHosted(hospital);

    const fullUrl = `http://${hospital.publicIp}:${hospital.publicPort}${path}`;
    
    const timestamp = Date.now().toString();
    const nonce = randomUUID();
    const correlationId = randomUUID();
    
    const bodyString = JSON.stringify(payload);
    const signature = this.generateSignature('POST', path, timestamp, nonce, bodyString, hospital.instanceSecret);

    try {
      this.logger.debug(`Executing command against ${hospital.hospitalCode}: ${path}`);
      const res = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Instance-ID': hospital.instanceToken,
          'X-Timestamp': timestamp,
          'X-Nonce': nonce,
          'X-Signature': signature,
          'X-Correlation-ID': correlationId,
        },
        body: bodyString,
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { ok: false, error: `HTTP ${res.status}: ${errorText}` };
      }

      const data = await res.json();
      return { 
        ok: true, 
        data: data.result,
        commandId: data.commandId, 
      };
    } catch (err: any) {
      this.logger.error(`Command failed against ${hospital.hospitalCode} (${path}): ${err.message}`);
      return { ok: false, error: err.message };
    }
  }
}

