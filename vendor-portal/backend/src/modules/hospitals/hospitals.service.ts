import {
  Injectable, Logger, ConflictException, NotFoundException, BadRequestException, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Hospital } from './entities/hospital.entity';
import { LicenseRequest } from './entities/license-request.entity';
import { IssuedLicense } from './entities/issued-license.entity';
import { RevocationEvent } from './entities/revocation-event.entity';
import { HisSchemaConfig } from './entities/his-schema-config.entity';
import { HisConfigTemplate } from './entities/his-config-template.entity';
import { HdspUser } from './entities/hdsp-user.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { HospitalSetting } from './entities/hospital-setting.entity';
import { CloudTenant } from '../cloud-tenants/entities/cloud-tenant.entity';
import { HIS_SCHEMA_DEFAULTS } from './his-schema-defaults';
import * as bcrypt from 'bcrypt';
import { SigningService } from '../signing/signing.service';
import { WebhookService } from '../webhook/webhook.service';

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export interface RegisterHospitalDto {
  hospitalName:       string;
  hospitalCode:       string;
  publicIp:           string;
  publicPort:         number;
  webhookUrl:         string;
  machineFingerprint: string;
}

export interface ApproveRequestDto {
  licenseType:    'TRIAL_EXTENSION' | 'MODULE_LICENSE' | 'PERPETUAL';
  modules:        string[];
  maxUsers:       number;
  expiresAt:      string | null;   // ISO string or null for perpetual
  machineLocked:  boolean;
  vendorNotes?:   string;
}

export interface RevokeDto {
  type:         'FULL' | 'MODULE';
  modules?:     string[];          // required when type = MODULE
  reason:       string;
  forceLogout?: boolean;
}

// Registered Tenants trial/licensing column (2026-08-03) -- shape of the
// live `subscription_licenses` row read back from the Cloud Licensing API's
// read-side route (CloudLicensingController.getSubscription()). See
// HospitalsService.fetchCloudSubscription()'s doc comment for why this is
// needed at all: a cloud tenant's trial, if it was ever set via
// tenant-provisioning's issue_trial_license step rather than Vendor
// Portal's own approve/extend-trial flow, has no corresponding row in
// Vendor Portal's own `issued_licenses` table to read locally.
export interface CloudSubscriptionSummary {
  subscriptionStatus: string;
  licensedModules:    string[];
  planId:             string | null;
  maxUsers:           number;
  currentPeriodEnd:   string | null;
}

@Injectable()
export class HospitalsService {
  private readonly logger = new Logger(HospitalsService.name);

  constructor(
    @InjectRepository(Hospital)       private readonly hospitalRepo:    Repository<Hospital>,
    @InjectRepository(LicenseRequest) private readonly requestRepo:     Repository<LicenseRequest>,
    @InjectRepository(IssuedLicense)  private readonly licenseRepo:     Repository<IssuedLicense>,
    @InjectRepository(RevocationEvent)  private readonly revocationRepo:  Repository<RevocationEvent>,
    @InjectRepository(HisSchemaConfig)  private readonly hisConfigRepo:   Repository<HisSchemaConfig>,
    @InjectRepository(HisConfigTemplate) private readonly templateRepo:   Repository<HisConfigTemplate>,
    @InjectRepository(HdspUser)          private readonly hdspUserRepo:   Repository<HdspUser>,
    @InjectRepository(PasswordReset)     private readonly passwordResetRepo: Repository<PasswordReset>,
    @InjectRepository(HospitalSetting)   private readonly settingsRepo:   Repository<HospitalSetting>,
    // Cloud Licensing API (architecture review, 2026-07-29) -- injected
    // directly, not via CloudTenantsModule/CloudTenantsService, mirroring
    // how CloudTenantsService itself already injects the Hospital repo
    // directly rather than importing HospitalsModule (see that module's own
    // doc comment: "no circular dependency, just the one repository it
    // needs"). approveRequest() only needs read access to hdspTenantId/
    // instanceSecret for a cloud request's linked tenant.
    @InjectRepository(CloudTenant)       private readonly cloudTenantRepo: Repository<CloudTenant>,
    private readonly signingService:  SigningService,
    private readonly webhookService:  WebhookService,
  ) {}

  // Customers merge (Phase 2, 2026-07-20) -- guard for the subset of this
  // service's methods that push to or pull from a physical SELF-HOSTED
  // instance over the network (webhookUrl / publicIp:publicPort /
  // instanceToken). A cloud hospital row (deploymentType='cloud', linked
  // via CloudTenantsService.linkHospitalRecord()) has none of these -- on
  // shared cloud infrastructure there is no separate remote "instance" to
  // reach; the tenant's data (including its Oracle DB_CONNECTION config)
  // lives directly in this same platform, scoped by tenant_id.
  //
  // Revised 2026-07-21 (CLOUD_VS_SELF_HOSTED_ROADMAP.md Phase 1/3): this is
  // NOT about cloud lacking Oracle connectivity -- cloud tenants DO connect
  // directly to their own Oracle HIS database (see getHisConfig()'s doc
  // comment; DB_CONNECTION fields are fully available for cloud). This
  // guard specifically covers the 4 methods that push/pull config via
  // webhook or a direct fetch() to a self-hosted instance's own IP:port --
  // syncHisConfig(), pushHisConfigWithUsers(), pushSystemSettings(),
  // testDbConnection(). Those remain self-hosted-only until Phase 3 builds
  // a tenant-scoped OraclePoolManager cloud tenants can use directly
  // in-process instead (testDbConnection in particular should eventually
  // call that instead of proxying to a remote instance's oracle-test route
  // -- not built yet, deliberately deferred post-deployment per the
  // roadmap).
  private assertSelfHosted(hospital: Hospital, action: string): void {
    if (hospital.deploymentType === 'cloud') {
      throw new BadRequestException(
        `${action} is not available for cloud tenants -- this pushes/pulls config over the network to a self-hosted ` +
        `instance's own IP:port, which cloud tenants don't have (their config lives directly in the shared platform). ` +
        `See CLOUD_VS_SELF_HOSTED_ROADMAP.md, Phase 3.`,
      );
    }
  }

  async receivePasswordResetRequest(instanceToken: string, body: any): Promise<void> {
    const hospital = await this.resolveHospitalByInstanceToken(instanceToken);
    if (!hospital) throw new UnauthorizedException('Invalid instance token');
    
    const reset = this.passwordResetRepo.create({
      hospitalId: hospital.id,
      vendorRequestId: body.requestId,
      username: body.username,
      reason: body.reason,
      status: 'REQUESTED',
    });
    await this.passwordResetRepo.save(reset);
    this.logger.log(`Received password reset request for ${body.username} from ${hospital.hospitalCode}`);
  }

  // â”€â”€ Registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async register(dto: RegisterHospitalDto): Promise<{ instanceToken: string; instanceSecret: string }> {
    const existing = await this.hospitalRepo.findOne({ where: { hospitalCode: dto.hospitalCode } });
    if (existing) {
      throw new ConflictException(`Hospital code '${dto.hospitalCode}' is already registered`);
    }

    const instanceToken = crypto.randomBytes(32).toString('hex');
    const instanceSecret = crypto.randomBytes(48).toString('hex');

    const hospital = this.hospitalRepo.create({
      instanceToken,
      instanceSecret,
      hospitalName:       dto.hospitalName,
      hospitalCode:       dto.hospitalCode,
      publicIp:           dto.publicIp,
      publicPort:         dto.publicPort,
      webhookUrl:         dto.webhookUrl,
      machineFingerprint: dto.machineFingerprint,
      status:             'ACTIVE',
    });
    await this.hospitalRepo.save(hospital);

    this.logger.log(`Hospital registered: ${dto.hospitalCode} @ ${dto.publicIp}:${dto.publicPort}`);

    // Confirm registration back to hospital via webhook
    await this.webhookService.deliver(hospital, {
      type:          'REGISTRATION_CONFIRMED',
      instanceToken,
      hospitalCode:  dto.hospitalCode,
    });

    return { instanceToken, instanceSecret };
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Hospital CRUD Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async findAll(): Promise<Array<Hospital & { cloudSubscription?: CloudSubscriptionSummary | null }>> {
    // Registered Tenants list view (2026-08-03) -- pulls each hospital's
    // issued licenses along so the frontend can derive trial/licensed
    // status, currently-licensed modules, and trial expiry without an
    // extra per-row round trip.
    const hospitals = await this.hospitalRepo.find({ order: { registeredAt: 'DESC' }, relations: ['licenses'] });

    // Bug fix (trial-visibility, 2026-08-03): `licenses` above is Vendor
    // Portal's OWN audit trail (issued_licenses) -- it only has rows for
    // grants that went through approveRequest()/extendTrial(). A cloud
    // tenant provisioned straight into a trial by tenant-provisioning's
    // issue_trial_license step (see CloudTenant's doc comment on
    // instanceSecret/instanceToken) never touches either of those, so its
    // real trial status/expiry only exists in ZoeConnect Cloud's own
    // subscription_licenses table. Fetch that live, in parallel, for every
    // cloud row so the list reflects reality rather than "no active
    // license" for tenants that are, in fact, mid-trial.
    const enriched = await Promise.all(hospitals.map(async (h) => {
      if (h.deploymentType !== 'cloud') return h;
      const cloudSubscription = await this.fetchCloudSubscription(h);
      return Object.assign(h, { cloudSubscription });
    }));

    return enriched;
  }

  /**
   * Read-side counterpart of pushCloudEntitlement() -- queries the Cloud
   * Licensing API's `POST /platform/licensing/tenants/:tenantId/subscription/query`
   * route (see that route's own doc comment for why it's POST, not GET) for
   * this hospital's linked cloud tenant's current subscription_licenses row.
   * Returns null on any failure (no linked tenant, tenant not yet
   * provisioned, network error, etc.) -- this is a best-effort enrichment
   * for the tenant list, never something callers should treat as
   * authoritative/blocking.
   */
  private async fetchCloudSubscription(hospital: Hospital): Promise<CloudSubscriptionSummary | null> {
    if (!hospital.cloudTenantId) return null;
    const tenant = await this.cloudTenantRepo.findOne({ where: { id: hospital.cloudTenantId } });
    if (!tenant?.hdspTenantId || !tenant.instanceSecret) return null;

    const baseUrl = process.env.HDSP_BACKEND_URL;
    if (!baseUrl) return null;

    const url = baseUrl.replace(/\/+$/, '') + `/api/v1/platform/licensing/tenants/${tenant.hdspTenantId}/subscription/query`;
    const body = '{}';
    const signature = this.signingService.computeHmac(tenant.instanceSecret, body);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Vendor-Signature': signature },
        body,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        this.logger.warn(`Cloud subscription query failed for tenant ${tenant.hdspTenantId}: HTTP ${res.status}`);
        return null;
      }
      const data = await res.json() as {
        found: boolean; subscriptionStatus?: string; licensedModules?: string[];
        planId?: string | null; maxUsers?: number; currentPeriodEnd?: string | null;
      };
      if (!data.found) return null;
      return {
        subscriptionStatus: data.subscriptionStatus!,
        licensedModules:    data.licensedModules ?? [],
        planId:             data.planId ?? null,
        maxUsers:           data.maxUsers ?? 5,
        currentPeriodEnd:   data.currentPeriodEnd ?? null,
      };
    } catch (err: any) {
      this.logger.warn(`Cloud subscription query failed for tenant ${tenant.hdspTenantId}: ${err.message}`);
      return null;
    }
  }

  async findOne(id: string): Promise<Hospital> {
    const h = await this.hospitalRepo.findOne({
      where: { id },
      relations: ['requests', 'licenses', 'revocations'],
    });
    if (!h) throw new NotFoundException(`Hospital ${id} not found`);
    return h;
  }

  async findByToken(instanceToken: string): Promise<Hospital | null> {
    return this.hospitalRepo.findOne({ where: { instanceToken } });
  }

  async updateNotes(id: string, notes: string): Promise<Hospital> {
    await this.hospitalRepo.update(id, { notes });
    return this.findOne(id);
  }

  async suspend(id: string): Promise<Hospital> {
    await this.hospitalRepo.update(id, { status: 'SUSPENDED' });
    return this.findOne(id);
  }

  async activate(id: string): Promise<Hospital> {
    await this.hospitalRepo.update(id, { status: 'ACTIVE' });
    return this.findOne(id);
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ HIS Config Sync Ã¢â‚¬â€ pull live queries from ZoeConnect instance Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async syncHisConfig(hospitalId: string): Promise<Record<string, string>> {
    const hospital = await this.findOne(hospitalId);
    this.assertSelfHosted(hospital, 'Syncing live HIS config from the instance');
    const url = `http://${hospital.publicIp}:${hospital.publicPort}/api/v1/license/his-config-export`;

    let res: Response;
    try {
      res = await fetch(url, {
        // Non-null assertion: assertSelfHosted() above guarantees this is a
        // self-hosted row, which always has a real instanceToken (set by
        // register() -- see hospital.entity.ts's doc comment on why this
        // column is nullable at the type level even though it's never
        // actually null once assertSelfHosted has passed).
        headers: { 'X-Instance-Token': hospital.instanceToken! },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err: any) {
      throw new BadRequestException(
        `Could not reach ZoeConnect instance at ${hospital.publicIp}:${hospital.publicPort} Ã¢â‚¬â€ ${err.message}`,
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new BadRequestException(`ZoeConnect returned ${res.status}: ${text}`);
    }

    return res.json() as Promise<Record<string, string>>;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ License Requests Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  // Resolves a Hospital row from an instance token using the canonical
  // resolution order shared by every Vendor Portal endpoint that
  // authenticates an inbound ZoeConnect instance:
  //   1. Try `Hospital.instanceToken` directly (self-hosted instances, and
  //      any cloud Hospital row that happens to carry its own token).
  //   2. If that misses, a cloud tenant's own Hospital row (linked via
  //      CloudTenantsService.linkHospitalRecord()) always has
  //      `instanceToken: null` -- self-hosted-only fields are intentionally
  //      left null for a cloud row, since there's no separate physical
  //      instance to authenticate. Fall back to resolving the instanceToken
  //      against `cloud_tenants` instead (the same token ZoeConnect's
  //      provisioning response handed back -- see CloudTenant.instanceToken's
  //      doc comment), then follow that row's `cloudTenantId` link to the
  //      Hospital row it's actually linked to.
  //   3. Return null if neither lookup succeeds; callers decide how to
  //      surface that (their existing exception types/messages are
  //      preserved rather than unified here).
  private async resolveHospitalByInstanceToken(instanceToken: string): Promise<Hospital | null> {
    let hospital = await this.hospitalRepo.findOne({ where: { instanceToken, status: 'ACTIVE' } });
    if (hospital) return hospital;

    const cloudTenant = await this.cloudTenantRepo.findOne({
      where: { instanceToken, provisioningStatus: 'ACTIVE' },
    });
    if (cloudTenant) {
      hospital = await this.hospitalRepo.findOne({
        where: { cloudTenantId: cloudTenant.id, status: 'ACTIVE' },
      });
    }

    return hospital ?? null;
  }

  async createRequest(instanceToken: string, payload: {
    requestedModules: string[];
    currentModules:   string[];
    remarks?:         string;
    machineFingerprint: string;
    isTrial:          boolean;
    expiresAt?:       string | null;
  }): Promise<{ requestId: string }> {
    const hospital = await this.resolveHospitalByInstanceToken(instanceToken);

    if (!hospital) throw new BadRequestException('Unknown or suspended instance token');

    const request = this.requestRepo.create({
      hospital,
      hospitalId:         hospital.id,
      requestedModules:   payload.requestedModules,
      currentModules:     payload.currentModules,
      remarks:            payload.remarks ?? null,
      machineFingerprint: payload.machineFingerprint,
      isTrial:            payload.isTrial,
      status:             'PENDING',
    });
    await this.requestRepo.save(request);

    this.logger.log(`License request from ${hospital.hospitalCode}: modules=${payload.requestedModules.join(',')}`);
    return { requestId: request.id };
  }

  findAllRequests(status?: string): Promise<LicenseRequest[]> {
    const where = status ? { status: status as any } : {};
    return this.requestRepo.find({
      where,
      relations: ['hospital'],
      order: { submittedAt: 'DESC' },
    });
  }

  async findRequest(id: string): Promise<LicenseRequest> {
    const r = await this.requestRepo.findOne({ where: { id }, relations: ['hospital'] });
    if (!r) throw new NotFoundException(`Request ${id} not found`);
    return r;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Approval Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async approveRequest(requestId: string, dto: ApproveRequestDto, issuedById: string): Promise<IssuedLicense> {
    const request = await this.findRequest(requestId);
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Request is already ${request.status}`);
    }

    const hospital = request.hospital;
    const isCloud = hospital.deploymentType === 'cloud';

    // Architecture review (2026-07-29): self-hosted and cloud tenants are
    // NOT the same trust domain (self-hosted is a third party's own
    // infrastructure; cloud is ZoeConnect's own), so they no longer share a
    // delivery mechanism past this point. Self-hosted keeps the original
    // RSA-signed-file + webhook flow byte-for-byte (untouched below). Cloud
    // skips signing/webhook entirely and instead makes a direct,
    // HMAC-authenticated write to ZoeConnect Cloud's own Cloud Licensing API --
    // "a direct, authenticated database-entitlement update," not a signed
    // artifact pushed over a webhook.
    let signedPayloadForRecord: Record<string, unknown>;

    if (isCloud) {
      const cloudPayload = {
        subscriptionStatus:  this.mapLicenseTypeToSubscriptionStatus(dto),
        licensedModules:     dto.modules,
        // License-module-merge fix (2026-07-31): `dto.modules` here is only
        // ever the newly-approved delta (see the approval form's "each
        // approval is a delta license" comment) -- vendor-portal has no
        // reliable way to read this tenant's actual current cloud
        // licensedModules first (no GET counterpart to the subscription PUT
        // exists), so rather than guess/merge locally against a possibly
        // stale `request.currentModules` snapshot, this asks the Cloud
        // Licensing API -- which has the real current row in hand -- to
        // union instead of overwrite. Revocation (below, `revokeLicense()`)
        // deliberately does NOT set this: it computes and sends the full
        // desired (shrunk) module set itself, so it needs the default
        // 'replace' behaviour.
        modulesOp:           'add' as const,
        maxUsers:            dto.maxUsers,
        // Bug fix (license-expiry-clear, 2026-07-31): `dto.expiresAt` is
        // `string | null` (never `undefined`) -- the approval form sends an
        // explicit `null` for PERPETUAL (and for a blank date on any other
        // license type). The old `dto.expiresAt ?? undefined` treated `null`
        // as "nullish" and coerced it to `undefined`, which the Cloud
        // Licensing API reads as "field omitted, don't touch the existing
        // value" -- so a PERPETUAL approval could never clear whatever
        // `currentPeriodEnd` a prior trial period had already set, and kept
        // showing the old (e.g. 30-day) expiry forever. Passing `null`
        // through unchanged now correctly tells it to clear the expiry.
        currentPeriodEnd:    dto.expiresAt,
        // Bug fix (cloud-request-resolution, 2026-07-31): lets the Cloud
        // Licensing API resolve this hospital's own pending `license_requests`
        // row (tenant-side "License Request History") to APPROVED as a side
        // effect of this same push -- see `UpdateSubscriptionLicenseDto
        // .vendorRequestId`'s doc comment. `requestId` here IS the
        // vendor-portal `LicenseRequest.id` the tenant-side row already
        // stores back as its own `vendorRequestId` (set when the request was
        // first submitted, see `VendorSyncService.submitRequest()`), so no
        // extra lookup is needed.
        vendorRequestId:     requestId,
        changedBy:           issuedById,
        reason:              dto.licenseType === 'TRIAL_EXTENSION' ? 'trial_start' as const : 'upgrade' as const,
      };
      // Same double-cast the self-hosted branch below uses for its own
      // concrete `SignedLicense`-shaped object -- a plain object/interface
      // type without an index signature doesn't assign directly to
      // `Record<string, unknown>` under this project's tsconfig.
      signedPayloadForRecord = { ...cloudPayload, licenseKey: crypto.randomUUID(), issuedAt: new Date().toISOString() } as unknown as Record<string, unknown>;

      const cloudResult = await this.pushCloudEntitlement(hospital, cloudPayload);
      if (!cloudResult.ok) {
        this.logger.warn(`License approved but Cloud Licensing API push failed for ${hospital.hospitalCode}: ${cloudResult.error}`);
      }
    } else {
      // Build and sign the license payload -- unchanged self-hosted path.
      const payload = {
        licenseKey:         crypto.randomUUID(),
        hospitalName:       hospital.hospitalName,
        hospitalCode:       hospital.hospitalCode,
        issuedAt:           new Date().toISOString(),
        expiresAt:          dto.expiresAt ?? null,
        modules:            dto.modules,
        maxUsers:           dto.maxUsers,
        machineFingerprint: dto.machineLocked ? hospital.machineFingerprint : null,
      };

      const signedLicense = this.signingService.sign(payload);
      signedPayloadForRecord = signedLicense as unknown as Record<string, unknown>;

      // Deliver license to hospital via webhook -- unchanged self-hosted path.
      const webhookResult = await this.webhookService.deliver(hospital, {
        type:            'LICENSE_APPROVED',
        vendorRequestId: requestId,
        signedLicense:   signedLicense,
      });

      if (!webhookResult.ok) {
        this.logger.warn(`License issued but webhook delivery failed for ${hospital.hospitalCode}: ${webhookResult.error}`);
      }
    }

    // Persist issued license -- vendor-portal's own audit trail of "what
    // was approved when," regardless of deployment type (per the
    // architecture review's explicit instruction).
    const issued = this.licenseRepo.create({
      hospital,
      hospitalId:       hospital.id,
      requestId:        requestId,
      licenseType:      dto.licenseType,
      licensedModules:  dto.modules,
      maxUsers:         dto.maxUsers,
      expiresAt:        dto.expiresAt ? new Date(dto.expiresAt) : null,
      machineLocked:    dto.machineLocked,
      status:           'ACTIVE',
      signedPayload:    signedPayloadForRecord,
      issuedBy:         issuedById,
    });
    await this.licenseRepo.save(issued);

    // Update request status
    request.status     = 'APPROVED';
    request.resolvedAt = new Date();
    request.resolvedBy = issuedById;
    if (dto.vendorNotes) request.vendorNotes = dto.vendorNotes;
    await this.requestRepo.save(request);

    return issued;
  }

  /**
   * ApproveRequestDto has no direct Stripe-shaped `subscriptionStatus` field
   * (it's the self-hosted-shaped licenseType/expiresAt DTO both deployment
   * types share at the approval-form level) -- this maps its
   * `licenseType`/`expiresAt` onto the cloud subscription_licenses vocabulary
   * SubscriptionLicenseProvider actually reads (`trialing`/`active`/
   * `past_due`/`canceled`/`incomplete`). TRIAL_EXTENSION stays 'trialing';
   * MODULE_LICENSE/PERPETUAL (a real paid grant) become 'active'. No Stripe
   * integration exists -- this is purely an administrator-managed mapping,
   * per the architecture review's explicit "administrator-managed
   * entitlements now, real billing later" scope.
   */
  private mapLicenseTypeToSubscriptionStatus(dto: ApproveRequestDto): 'trialing' | 'active' {
    return dto.licenseType === 'TRIAL_EXTENSION' ? 'trialing' : 'active';
  }

  /**
   * Cloud Licensing API push (architecture review, 2026-07-29) -- the cloud
   * counterpart of WebhookService.deliver(), but PUTs directly to ZoeConnect
   * Cloud's own `/platform/licensing/tenants/:tenantId/subscription`
   * endpoint instead of POSTing a signed license to a self-hosted instance's
   * webhook. Reuses the same base-URL/timeout shape CloudTenantsService's
   * `callHdspRaw()` uses for provisioning calls (HDSP_BACKEND_URL), and the
   * same HMAC-over-raw-body scheme WebhookService already uses for
   * self-hosted (`SigningService.computeHmac()`, `X-Vendor-Signature`
   * header) -- just keyed by the cloud tenant's own
   * `CloudTenant.instanceSecret` (captured at provisioning time, see that
   * entity's doc comment) instead of `Hospital.instanceSecret` (always null
   * for a cloud row).
   */
  private async pushCloudEntitlement(
    hospital: Hospital,
    payload: {
      subscriptionStatus: string;
      licensedModules: string[];
      /** License-module-merge fix (2026-07-31): 'add' unions `licensedModules` into the tenant's existing cloud entitlements instead of replacing them -- see `UpdateSubscriptionLicenseDto.modulesOp`'s doc comment. Omitted (default) preserves the original full-replace behaviour, which revocation relies on. */
      modulesOp?: 'replace' | 'add';
      maxUsers?: number;
      /** Bug fix (license-expiry-clear, 2026-07-31): `null` clears the expiry (perpetual); `undefined`/omitted leaves it unchanged. See `UpdateSubscriptionLicenseDto.currentPeriodEnd`'s doc comment. */
      currentPeriodEnd?: string | null;
      /** Bug fix (cloud-request-resolution, 2026-07-31): resolves this tenant's own pending `license_requests` row to APPROVED as a side effect -- see `UpdateSubscriptionLicenseDto.vendorRequestId`'s doc comment. */
      vendorRequestId?: string;
      /** Audit-trail hardening (2026-07-29): "who"/"why", forwarded verbatim to the Cloud Licensing API's audit log. */
      changedBy?: string;
      reason?: string;
    },
  ): Promise<{ ok: boolean; error?: string }> {
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

    const url = baseUrl.replace(/\/+$/, '') + `/api/v1/platform/licensing/tenants/${tenant.hdspTenantId}/subscription`;
    const body = JSON.stringify(payload);
    const signature = this.signingService.computeHmac(tenant.instanceSecret, body);

    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type':       'application/json',
          'X-Vendor-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        this.logger.warn(`Cloud Licensing API push to tenant ${tenant.hdspTenantId} failed (${res.status}): ${errText}`);
        return { ok: false, error: `HTTP ${res.status}: ${errText}` };
      }
      this.logger.log(`Cloud Licensing API push delivered to tenant ${tenant.hdspTenantId}`);
      return { ok: true };
    } catch (err: any) {
      this.logger.error(`Cloud Licensing API push failed for tenant ${tenant.hdspTenantId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Bug fix (cloud-request-resolution, 2026-07-31): the reject-side
   * counterpart to `pushCloudEntitlement()` -- same tenant lookup / HMAC
   * pattern, but PUTs to the Cloud Licensing API's dedicated reject route
   * (`CloudLicensingController.rejectRequest()`) instead of the
   * subscription-update one, since a rejection has no entitlement to push.
   * `rejectRequest()` below previously relied solely on
   * `webhookService.deliver()`, which silently no-ops for cloud hospitals
   * (no `webhookUrl`/`instanceSecret` on a cloud `Hospital` row) -- so a
   * cloud tenant's rejected request was never actually marked resolved on
   * the tenant side, the same failure shape approval had before its own fix.
   */
  private async pushCloudRequestRejection(
    hospital: Hospital,
    vendorRequestId: string,
    payload: { reason?: string; rejectedBy?: string },
  ): Promise<{ ok: boolean; error?: string }> {
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

    const url = baseUrl.replace(/\/+$/, '') + `/api/v1/platform/licensing/tenants/${tenant.hdspTenantId}/requests/${vendorRequestId}/reject`;
    const body = JSON.stringify(payload);
    const signature = this.signingService.computeHmac(tenant.instanceSecret, body);

    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type':       'application/json',
          'X-Vendor-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        this.logger.warn(`Cloud Licensing reject push to tenant ${tenant.hdspTenantId} failed (${res.status}): ${errText}`);
        return { ok: false, error: `HTTP ${res.status}: ${errText}` };
      }
      this.logger.log(`Cloud Licensing reject push delivered to tenant ${tenant.hdspTenantId}`);
      return { ok: true };
    } catch (err: any) {
      this.logger.error(`Cloud Licensing reject push failed for tenant ${tenant.hdspTenantId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async rejectRequest(requestId: string, reason: string, rejectedById: string): Promise<LicenseRequest> {
    const request = await this.findRequest(requestId);
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Request is already ${request.status}`);
    }

    request.status          = 'REJECTED';
    request.rejectionReason = reason;
    request.resolvedAt      = new Date();
    request.resolvedBy      = rejectedById;
    await this.requestRepo.save(request);

    // Bug fix (cloud-request-resolution, 2026-07-31): cloud tenants have no
    // webhook to deliver to (see this method's own doc comment) -- push the
    // rejection straight to the Cloud Licensing API's reject route instead,
    // mirroring approveRequest()'s isCloud branch above.
    if (request.hospital.deploymentType === 'cloud') {
      const cloudResult = await this.pushCloudRequestRejection(request.hospital, requestId, {
        reason,
        rejectedBy: rejectedById,
      });
      if (!cloudResult.ok) {
        this.logger.warn(`Request rejected but Cloud Licensing API reject push failed for ${request.hospital.hospitalCode}: ${cloudResult.error}`);
      }
    } else {
      // Notify hospital -- unchanged self-hosted path.
      await this.webhookService.deliver(request.hospital, {
        type:            'REQUEST_REJECTED',
        vendorRequestId: requestId,
        reason,
      });
    }

    return request;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Trial Extension Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async extendTrial(hospitalId: string, newExpiresAt: string, reason: string, issuedById: string): Promise<void> {
    const hospital = await this.findOne(hospitalId);

    // Bug fix (trial-persistence, 2026-08-03): this previously only pushed a
    // 'TRIAL_EXTENDED' webhook/HMAC event and never wrote anything to
    // vendor-portal's own `issued_licenses` table -- so there was no record
    // for the Registered Tenants list (or any other vendor-portal screen) to
    // read a hospital's trial status/expiry back from, and for cloud
    // tenants specifically the webhook silently no-ops (no webhookUrl on a
    // cloud Hospital row -- the same blind spot approveRequest() and
    // revokeHospital() had before their own 2026-07-29 fixes), so extending
    // a cloud tenant's trial did nothing at all. Now: update (or create) the
    // hospital's ACTIVE TRIAL_EXTENSION license row with the new expiry, so
    // it's queryable, and push the new expiry to the Cloud Licensing API for
    // cloud tenants the same way approveRequest()/revokeHospital() do.
    const existingTrial = await this.licenseRepo.findOne({
      where: { hospitalId, status: 'ACTIVE', licenseType: 'TRIAL_EXTENSION' },
      order: { issuedAt: 'DESC' },
    });

    let trialModules: string[];

    if (existingTrial) {
      existingTrial.expiresAt = new Date(newExpiresAt);
      await this.licenseRepo.save(existingTrial);
      trialModules = existingTrial.licensedModules;
    } else {
      // No prior trial grant -- carry over whatever modules are currently
      // active (if any) so the trial reflects what the hospital already has
      // access to, rather than silently granting nothing.
      const currentActive = await this.licenseRepo.find({
        where: { hospitalId, status: 'ACTIVE' },
        order: { issuedAt: 'DESC' },
      });
      const carryModules = new Set<string>();
      for (const l of currentActive) for (const m of l.licensedModules) carryModules.add(m);

      const trial = this.licenseRepo.create({
        hospital,
        hospitalId,
        requestId:       null,
        licenseType:     'TRIAL_EXTENSION',
        licensedModules: Array.from(carryModules),
        maxUsers:        currentActive[0]?.maxUsers ?? 5,
        expiresAt:       new Date(newExpiresAt),
        machineLocked:   false,
        status:          'ACTIVE',
        signedPayload:   { reason, extendedBy: issuedById, extendedAt: new Date().toISOString() },
        issuedBy:        issuedById,
      });
      await this.licenseRepo.save(trial);
      trialModules = trial.licensedModules;
    }

    if (hospital.deploymentType === 'cloud') {
      const cloudResult = await this.pushCloudEntitlement(hospital, {
        subscriptionStatus: 'trialing',
        licensedModules:    trialModules,
        modulesOp:           'add',
        currentPeriodEnd:    newExpiresAt,
        changedBy:           issuedById,
        reason:              'trial_start',
      });
      if (!cloudResult.ok) {
        this.logger.warn(`Trial extended but Cloud Licensing API push failed for ${hospital.hospitalCode}: ${cloudResult.error}`);
      }
    } else {
      await this.webhookService.deliver(hospital, {
        type:        'TRIAL_EXTENDED',
        newExpiresAt,
        reason,
      });
    }

    this.logger.log(`Trial extended for ${hospital.hospitalCode} to ${newExpiresAt}`);
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Revocation Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async revokeHospital(hospitalId: string, dto: RevokeDto, revokedById: string): Promise<RevocationEvent> {
    const hospital = await this.findOne(hospitalId);
    const isCloud = hospital.deploymentType === 'cloud';

    if (dto.type === 'MODULE' && (!dto.modules || dto.modules.length === 0)) {
      throw new BadRequestException('modules[] is required for MODULE revocation');
    }

    // Mark all active licenses as revoked
    if (dto.type === 'FULL') {
      await this.licenseRepo.update(
        { hospitalId, status: 'ACTIVE' },
        { status: 'REVOKED', revokedBy: revokedById, revokedAt: new Date(), revokeReason: dto.reason },
      );
    }

    const event = this.revocationRepo.create({
      hospital,
      hospitalId,
      revocationType: dto.type,
      modules:        dto.type === 'MODULE' ? dto.modules! : null,
      reason:         dto.reason,
      forceLogout:    dto.forceLogout ?? false,
      revokedBy:      revokedById,
      webhookStatus:  'PENDING',
    });
    await this.revocationRepo.save(event);

    // Architecture review (2026-07-29) follow-up: revocation had the same
    // self-hosted-only blind spot approveRequest() originally had --
    // webhookService.deliverRevocation() silently no-ops for cloud hospitals
    // (no webhookUrl/instanceSecret), so a cloud tenant's access was NEVER
    // actually revoked by this method before this fix. Cloud now pushes
    // straight to the Cloud Licensing API, same as approveRequest()'s cloud
    // branch: FULL revocation maps to `suspended` (an administrative
    // override -- distinct from a billing-driven `canceled`, see
    // subscription-status-transition.util.ts on the ZoeConnect Cloud side)
    // with licensedModules cleared; MODULE revocation keeps the tenant
    // `active` but removes just the named modules from its last-known
    // module list (read from this hospital's own most recent ACTIVE
    // IssuedLicense -- vendor-portal's own record of what was last granted).
    if (isCloud) {
      if (dto.type === 'FULL') {
        const cloudResult = await this.pushCloudEntitlement(hospital, {
          subscriptionStatus: 'suspended',
          licensedModules:    [],
          changedBy:           revokedById,
          reason:              'suspension',
        });
        if (!cloudResult.ok) {
          this.logger.warn(`Revocation recorded but Cloud Licensing API push failed for ${hospital.hospitalCode}: ${cloudResult.error}`);
        }
      } else {
        const lastActive = await this.licenseRepo.findOne({
          where: { hospitalId, status: 'ACTIVE' },
          order: { issuedAt: 'DESC' },
        });
        const currentModules = lastActive?.licensedModules ?? [];
        const remainingModules = currentModules.filter((m) => !dto.modules!.includes(m));
        const cloudResult = await this.pushCloudEntitlement(hospital, {
          subscriptionStatus: 'active',
          licensedModules:    remainingModules,
          changedBy:           revokedById,
          reason:              'downgrade',
        });
        if (!cloudResult.ok) {
          this.logger.warn(`Module revocation recorded but Cloud Licensing API push failed for ${hospital.hospitalCode}: ${cloudResult.error}`);
        }
      }
    } else {
      // Deliver webhook immediately -- unchanged self-hosted path.
      const webhookPayload = dto.type === 'FULL'
        ? { type: 'LICENSE_REVOKED',  reason: dto.reason, forceLogout: dto.forceLogout ?? false }
        : { type: 'MODULE_REVOKED',   reason: dto.reason, modules: dto.modules };

      await this.webhookService.deliverRevocation(event.id, hospital, webhookPayload);
    }

    return event;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Issued Licenses Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  findActiveLicenses(): Promise<IssuedLicense[]> {
    return this.licenseRepo.find({
      where: { status: 'ACTIVE' },
      relations: ['hospital'],
      order: { issuedAt: 'DESC' },
    });
  }

  // All licenses regardless of status Ã¢â‚¬â€ for history view
  findAllLicenses(): Promise<IssuedLicense[]> {
    return this.licenseRepo.find({
      relations: ['hospital'],
      order: { issuedAt: 'DESC' },
    });
  }

  findHospitalLicenses(hospitalId: string): Promise<IssuedLicense[]> {
    return this.licenseRepo.find({
      where: { hospitalId },
      order: { issuedAt: 'DESC' },
    });
  }

  // All revocation events Ã¢â‚¬â€ for transaction log
  findAllRevocations(): Promise<RevocationEvent[]> {
    return this.revocationRepo.find({
      relations: ['hospital'],
      order: { createdAt: 'DESC' },
    });
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ HIS Schema Config Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /** Return config for a hospital, merging saved values with defaults. */
  async getHisConfig(hospitalId: string): Promise<HisSchemaConfig[]> {
    const hospital = await this.findOne(hospitalId); // throws 404 if not found

    const saved = await this.hisConfigRepo.find({ where: { hospitalId } });
    const savedMap = new Map(saved.map(r => [r.configKey, r]));

    // Revised architecture (2026-07-21, CLOUD_VS_SELF_HOSTED_ROADMAP.md
    // Phase 1/3): cloud tenants DO connect directly to their own Oracle HIS
    // database -- DB_CONNECTION (host/port/service/user/password/mode/pool)
    // stays fully available for cloud. The only category excluded for cloud
    // is ATTENDANCE (polling intervals, dependency-poller flags, HIS
    // reconciliation, retroactive recalc) -- Attendance itself is disabled
    // entirely for cloud (see AttendanceModule's conditional exclusion in
    // backend/src/app.module.ts), so its Oracle runtime-tuning knobs are
    // meaningless there. Query Configuration (patient/billing/etc. table+
    // column mappings) and DB_CONNECTION both stay fully available -- cloud
    // uses direct, tenant-scoped Oracle connectivity for everything except
    // Attendance (see Phase 3: OraclePoolManager tenant-scoping, not yet
    // built -- today's single process-wide OraclePoolService is a known,
    // documented gap this doesn't fix).
    //
    // Previously (until this fix) this excluded DB_CONNECTION instead of
    // ATTENDANCE for cloud -- backwards from the intended architecture, and
    // never actually blocked ATTENDANCE at all.
    const defs = hospital.deploymentType === 'cloud'
      ? HIS_SCHEMA_DEFAULTS.filter(d => d.category !== 'ATTENDANCE')
      : HIS_SCHEMA_DEFAULTS;

    // Return defaults merged with any saved overrides Ã¢â‚¬â€ upsert missing rows
    const results: HisSchemaConfig[] = [];
    for (const def of defs) {
      if (savedMap.has(def.key)) {
        results.push(savedMap.get(def.key)!);
      } else {
        // Auto-create with default value so the UI always has a full list
        const row = this.hisConfigRepo.create({
          hospitalId,
          configKey:    def.key,
          configValue:  def.defaultValue,
          defaultValue: def.defaultValue,
          label:        def.label,
          description:  def.description || null,
          configType:   def.configType,
          category:     def.category,
        });
        results.push(await this.hisConfigRepo.save(row));
      }
    }
    return results;
  }

  /** Update one or more config entries. */
  async updateHisConfig(
    hospitalId: string,
    updates: Array<{ configKey: string; configValue: string }>,
  ): Promise<HisSchemaConfig[]> {
    const hospital = await this.findOne(hospitalId);

    // See getHisConfig()'s doc comment above -- ATTENDANCE is the only
    // category blocked for cloud now (reversed from DB_CONNECTION, 2026-07-21).
    if (hospital.deploymentType === 'cloud') {
      const blocked = updates.filter(u => {
        const def = HIS_SCHEMA_DEFAULTS.find(d => d.key === u.configKey);
        return def?.category === 'ATTENDANCE';
      });
      if (blocked.length > 0) {
        throw new BadRequestException(
          `Attendance runtime config fields (${blocked.map(b => b.configKey).join(', ')}) are not applicable to cloud tenants (Attendance is disabled for cloud deployments).`,
        );
      }
    }

    for (const { configKey, configValue } of updates) {
      // Oracle identifiers (TABLE, COLUMN, STATUS_VALUE) are uppercased.
      // SQL_QUERY, TEXT, and CREDENTIAL values are stored as-is Ã¢â‚¬â€ passwords and
      // host names must not be uppercased.
      const def = HIS_SCHEMA_DEFAULTS.find(d => d.key === configKey);
      const shouldUppercase = def?.configType === 'TABLE'
                           || def?.configType === 'COLUMN'
                           || def?.configType === 'STATUS_VALUE';
      await this.hisConfigRepo.upsert(
        {
          hospitalId,
          configKey,
          configValue: shouldUppercase ? configValue.trim().toUpperCase() : configValue.trim(),
          // fill static fields from defaults so upsert doesn't wipe them
          ...(() => {
            const def = HIS_SCHEMA_DEFAULTS.find(d => d.key === configKey);
            return def ? {
              defaultValue: def.defaultValue,
              label:        def.label,
              description:  def.description || null,
              configType:   def.configType,
              category:     def.category,
            } : {};
          })(),
        },
        ['hospitalId', 'configKey'],
      );
    }

    return this.getHisConfig(hospitalId);
  }

  /** Push the saved config (+ provisioned users) to ZoeConnect via webhook. */
  async pushHisConfig(hospitalId: string): Promise<{ ok: boolean; message: string }> {
    return this.pushHisConfigWithUsers(hospitalId);
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ HIS Config Templates Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /** List all saved global templates (summary Ã¢â‚¬â€ no full SQL bodies). */
  listTemplates(): Promise<HisConfigTemplate[]> {
    return this.templateRepo.find({ order: { name: 'ASC' } });
  }

  /** Get a single template by ID including full SQL. */
  async getTemplate(id: string): Promise<HisConfigTemplate> {
    const t = await this.templateRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    return t;
  }

  /**
   * Save current sql.* values from a hospital as a new named template.
   * Throws ConflictException if a template with that name already exists.
   */
  async createTemplate(
    hospitalId: string,
    name: string,
    description: string | null,
  ): Promise<HisConfigTemplate> {
    const existing = await this.templateRepo.findOne({ where: { name } });
    if (existing) throw new ConflictException(`A template named "${name}" already exists`);

    const config = await this.getHisConfig(hospitalId);
    const queries: Record<string, string> = {};
    for (const row of config) {
      if (row.configKey.startsWith('sql.')) {
        queries[row.configKey] = row.configValue;
      }
    }

    const tmpl = this.templateRepo.create({ name, description: description ?? null, queries });
    return this.templateRepo.save(tmpl);
  }

  /** Delete a template. */
  async deleteTemplate(id: string): Promise<void> {
    const t = await this.getTemplate(id);
    await this.templateRepo.remove(t);
  }

  /**
   * Apply a saved template to a hospital Ã¢â‚¬â€ overwrites all sql.* config keys
   * with the template's stored SQL strings.
   */
  async applyTemplate(hospitalId: string, templateId: string): Promise<HisSchemaConfig[]> {
    await this.findOne(hospitalId);
    const tmpl = await this.getTemplate(templateId);

    const updates = Object.entries(tmpl.queries).map(([configKey, configValue]) => ({
      configKey,
      configValue,
    }));

    if (!updates.length) return this.getHisConfig(hospitalId);

    // Save without uppercasing (SQL_QUERY values)
    for (const { configKey, configValue } of updates) {
      const def = HIS_SCHEMA_DEFAULTS.find(d => d.key === configKey);
      await this.hisConfigRepo.upsert(
        {
          hospitalId,
          configKey,
          configValue: configValue.trim(),
          ...(def ? {
            defaultValue: def.defaultValue,
            label:        def.label,
            description:  def.description || null,
            configType:   def.configType,
            category:     def.category,
          } : {}),
        },
        ['hospitalId', 'configKey'],
      );
    }

    return this.getHisConfig(hospitalId);
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ ZoeConnect User Management Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /** List all provisioned ZoeConnect users for a hospital (never returns passwordHash). */
  async listHdspUsers(hospitalId: string): Promise<Omit<HdspUser, 'passwordHash'>[]> {
    await this.findOne(hospitalId);
    const users = await this.hdspUserRepo.find({
      where: { hospitalId },
      order: { createdAt: 'ASC' },
    });
    return users.map(({ passwordHash: _h, ...rest }) => rest);
  }

  /** Create a new ZoeConnect user credential for a hospital. */
  async createHdspUser(
    hospitalId: string,
    dto: { username: string; password: string; role: 'ADMIN' | 'STAFF'; fullName?: string },
  ): Promise<Omit<HdspUser, 'passwordHash'>> {
    await this.findOne(hospitalId);
    const conflict = await this.hdspUserRepo.findOne({ where: { hospitalId, username: dto.username } });
    if (conflict) throw new ConflictException(`Username "${dto.username}" already exists for this hospital`);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.hdspUserRepo.create({
      hospitalId,
      username:     dto.username,
      passwordHash,
      role:         dto.role ?? 'STAFF',
      fullName:     dto.fullName ?? null,
      isActive:     true,
    });
    const saved = await this.hdspUserRepo.save(user);
    const { passwordHash: _h, ...rest } = saved;
    return rest;
  }

  /** Update an ZoeConnect user's role, fullName, isActive Ã¢â‚¬â€ or reset their password. */
  async updateHdspUser(
    userId: string,
    dto: { role?: 'ADMIN' | 'STAFF'; fullName?: string; isActive?: boolean; password?: string },
  ): Promise<Omit<HdspUser, 'passwordHash'>> {
    const user = await this.hdspUserRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`ZoeConnect user ${userId} not found`);

    if (dto.role     !== undefined) user.role     = dto.role;
    if (dto.fullName !== undefined) user.fullName  = dto.fullName ?? null;
    if (dto.isActive !== undefined) user.isActive  = dto.isActive;
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, 12);

    const saved = await this.hdspUserRepo.save(user);
    const { passwordHash: _h, ...rest } = saved;
    return rest;
  }

  /** Delete an ZoeConnect user credential. */
  async deleteHdspUser(userId: string): Promise<void> {
    const user = await this.hdspUserRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`ZoeConnect user ${userId} not found`);
    await this.hdspUserRepo.remove(user);
  }

  /**
   * Extend pushHisConfig to also push provisioned ZoeConnect users.
   * The hdspUsers array in the payload contains username, passwordHash, role, fullName, isActive.
   * ZoeConnect upserts these into its own users table.
   */
  async pushHisConfigWithUsers(hospitalId: string): Promise<{ ok: boolean; message: string }> {
    const hospital = await this.findOne(hospitalId);
    this.assertSelfHosted(hospital, 'Pushing HIS config/users to the instance');
    const config   = await this.getHisConfig(hospitalId);
    const users    = await this.hdspUserRepo.find({ where: { hospitalId } });

    // Split config into schema mappings vs database credentials
    const hisConfig: Record<string, string>     = {};
    const dbCredentials: Record<string, string> = {};

    for (const row of config) {
      if (row.category === 'DB_CONNECTION') {
        // Only include non-empty credentials Ã¢â‚¬â€ don't overwrite a working
        // credential on the ZoeConnect instance with a blank placeholder value.
        if (row.configValue.trim()) {
          dbCredentials[row.configKey] = row.configValue;
        }
      } else {
        hisConfig[row.configKey] = row.configValue;
      }
    }

    const hdspUsers = users.map(u => ({
      username:     u.username,
      passwordHash: u.passwordHash,
      role:         u.role,
      fullName:     u.fullName,
      isActive:     u.isActive,
    }));

    const result = await this.webhookService.deliver(hospital, {
      type:          'HIS_CONFIG_UPDATE',
      hisConfig,
      dbCredentials: Object.keys(dbCredentials).length ? dbCredentials : undefined,
      hdspUsers,
    });

    if (!result.ok) return { ok: false, message: `Webhook delivery failed: ${result.error}` };

    const credMsg = Object.keys(dbCredentials).length
      ? `, DB credentials included`
      : '';
    return { ok: true, message: `HIS config and ${hdspUsers.length} user(s) pushed to hospital${credMsg}.` };
  }

  async provisionCloudTenant(dto: {
    hospitalName: string;
    hospitalCode: string;
    publicIp: string;
    publicPort: number;
    provisioningSecret: string;
  }): Promise<{ instanceToken: string; instanceSecret: string }> {
    let existing = await this.hospitalRepo.findOne({ where: { hospitalCode: dto.hospitalCode } });
    if (existing) {
      if (existing.status !== 'ACTIVE') {
        throw new ConflictException(`Hospital code '${dto.hospitalCode}' is registered but not active`);
      }
      this.logger.log(`Hospital ${dto.hospitalCode} already exists in Vendor Portal, proceeding with provisioning`);
    }

    // Non-null assertions: this legacy method (see its own doc comment --
    // superseded by CloudTenantsService's real provisioning flow) only ever
    // creates/reuses a normal instance-paired row with a real token/secret,
    // never a 'cloud' deploymentType row (those are null-only for the new
    // CloudTenantsService-linked path -- see hospital.entity.ts).
    const instanceToken = existing ? existing.instanceToken! : crypto.randomBytes(32).toString('hex');
    const instanceSecret = existing ? existing.instanceSecret! : crypto.randomBytes(48).toString('hex');

    if (!existing) {
      existing = this.hospitalRepo.create({
        instanceToken,
        instanceSecret,
        hospitalName:       dto.hospitalName,
        hospitalCode:       dto.hospitalCode,
        publicIp:           dto.publicIp,
        publicPort:         dto.publicPort,
        webhookUrl:         `http://${dto.publicIp}:${dto.publicPort}/api/v1/license/vendor-webhook`,
        machineFingerprint: 'CLOUD_PROVISIONED',
        status:             'ACTIVE',
      });
      await this.hospitalRepo.save(existing);
    }

    this.logger.log(`Provisioning cloud tenant: ${dto.hospitalCode} @ ${dto.publicIp}:${dto.publicPort}`);

    const hdspUrl = `http://${dto.publicIp}:${dto.publicPort}`;
    
    let res: Response;
    try {
      res = await fetch(`${hdspUrl}/api/v1/license/internal-provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Provisioning-Secret': dto.provisioningSecret,
        },
        body: JSON.stringify({
          instanceToken,
          instanceSecret,
          vendorApiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
          hospitalName: dto.hospitalName,
          hospitalCode: dto.hospitalCode,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err: any) {
      // If we created it just now, we could delete it, but it's retry-safe
      throw new BadRequestException(`Could not reach ZoeConnect instance at ${hdspUrl}: ${err.message}`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new BadRequestException(`ZoeConnect provisioning failed (${res.status}): ${errText}`);
    }

    // Auto-issue a perpetual license for the cloud tenant
    const licensePayload = {
      licenseKey:         crypto.randomUUID(),
      hospitalName:       existing.hospitalName,
      hospitalCode:       existing.hospitalCode,
      issuedAt:           new Date().toISOString(),
      expiresAt:          null,
      modules:            ['PLATFORM', 'LOYALTY', 'FORMS', 'QUEUE', 'FEEDBACK', 'EIC', 'ATTENDANCE', 'CMS'],
      maxUsers:           9999,
      machineFingerprint: null,
    };
    
    const signedLicense = this.signingService.sign(licensePayload);
    
    const issued = this.licenseRepo.create({
      hospital:         existing,
      hospitalId:       existing.id,
      requestId:        null,
      licenseType:      'PERPETUAL',
      licensedModules:  licensePayload.modules,
      maxUsers:         licensePayload.maxUsers,
      expiresAt:        null,
      machineLocked:    false,
      status:           'ACTIVE',
      signedPayload:    signedLicense as unknown as Record<string, unknown>,
      issuedBy:         '00000000-0000-0000-0000-000000000000',
    });
    await this.licenseRepo.save(issued);

    // Push the newly issued license to the ZoeConnect instance
    await this.webhookService.deliver(existing, {
      type:            'LICENSE_APPROVED',
      signedLicense:   signedLicense,
    });

    return { instanceToken, instanceSecret };
  }

  // ── System Settings ─────────────────────────────────────────────────────────

  async getSystemSettings(hospitalId: string): Promise<HospitalSetting[]> {
    return this.settingsRepo.find({ where: { hospitalId }, order: { settingKey: 'ASC' } });
  }

  async upsertSystemSetting(
    hospitalId: string,
    settingKey: string,
    settingValue: string,
    label: string,
    description: string | null = null,
  ): Promise<HospitalSetting> {
    const existing = await this.settingsRepo.findOne({ where: { hospitalId, settingKey } });
    if (existing) {
      existing.settingValue = settingValue;
      existing.label = label;
      existing.description = description;
      return this.settingsRepo.save(existing);
    }
    const setting = this.settingsRepo.create({ hospitalId, settingKey, settingValue, label, description });
    return this.settingsRepo.save(setting);
  }

  async pushSystemSettings(hospitalId: string): Promise<{ ok: boolean; message: string }> {
    const hospital = await this.findOne(hospitalId);
    this.assertSelfHosted(hospital, 'Pushing system settings to the instance');
    const settings = await this.getSystemSettings(hospitalId);

    const payload: Record<string, string> = {};
    for (const s of settings) {
      payload[s.settingKey] = s.settingValue;
    }

    const result = await this.webhookService.deliver(hospital, {
      type: 'SYSTEM_SETTINGS_UPDATE',
      systemSettings: payload,
    });

    if (!result.ok) return { ok: false, message: `Webhook delivery failed: ${result.error}` };
    return { ok: true, message: `System settings (${settings.length} keys) pushed to hospital.` };
  }

  /** Test DB connection by proxying to ZoeConnect's oracle test endpoint. */
  async testDbConnection(hospitalId: string): Promise<{ ok: boolean; message: string }> {
    const hospital = await this.findOne(hospitalId);
    this.assertSelfHosted(hospital, 'Testing the Oracle DB connection');
    const config   = await this.getHisConfig(hospitalId);

    // Gather db.* credentials from saved config
    const creds: Record<string, string> = {};
    for (const row of config) {
      if (row.category === 'DB_CONNECTION' && row.configValue.trim()) {
        creds[row.configKey] = row.configValue;
      }
    }

    if (!creds['db.host'] || !creds['db.service'] || !creds['db.user'] || !creds['db.password']) {
      return { ok: false, message: 'DB host, service name, username, and password are required before testing.' };
    }

    const url = `http://${hospital.publicIp}:${hospital.publicPort}/api/v1/license/oracle-test`;
    let res: Response;
    try {
      res = await fetch(url, {
        method:  'POST',
        // Non-null assertion: assertSelfHosted() at the top of this method
        // guarantees a real instanceToken (see syncHisConfig()'s identical
        // comment above).
        headers: { 'Content-Type': 'application/json', 'X-Instance-Token': hospital.instanceToken! },
        body:    JSON.stringify({ dbCredentials: creds }),
        signal:  AbortSignal.timeout(15_000),
      });
    } catch (err: any) {
      return { ok: false, message: `Could not reach ZoeConnect instance at ${hospital.publicIp}:${hospital.publicPort} Ã¢â‚¬â€ ${err.message}` };
    }

    const body = await res.json().catch(() => ({ ok: false, message: res.statusText })) as { ok: boolean; message: string };
    return body;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Delete Hospital (full cascade) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  /**
   * Permanently delete a hospital and ALL related data:
   * his_schema_configs, hdsp_users, license_requests, issued_licenses,
   * revocation_events Ã¢â‚¬â€ all cascade via FK onDelete:'CASCADE'.
   *
   * Before deleting, we send a LICENSE_REVOKED + HOSPITAL_DELETED webhook so
   * the ZoeConnect instance resets itself to a clean trial state. Deletion proceeds
   * even if the webhook fails (hospital may be offline / already gone).
   */
  async deleteHospital(id: string): Promise<void> {
    const hospital = await this.hospitalRepo.findOne({ where: { id } });
    if (!hospital) throw new NotFoundException(`Hospital ${id} not found`);

    // Notify ZoeConnect Ã¢â‚¬â€ best effort (don't block deletion on webhook failure)
    try {
      await this.webhookService.deliver(hospital, {
        type:       'LICENSE_REVOKED',
        reason:     'Hospital record permanently deleted from vendor portal',
        forceLogout: true,
        reset:       true,   // instructs ZoeConnect to wipe registration and restart trial
      });
      this.logger.log(`LICENSE_REVOKED webhook sent to ${hospital.hospitalCode} before deletion`);
    } catch (err: any) {
      this.logger.warn(
        `Could not deliver LICENSE_REVOKED to ${hospital.hospitalCode} before deletion: ${err.message}`,
      );
    }

    await this.hospitalRepo.remove(hospital);
    this.logger.warn(`Hospital ${hospital.hospitalCode} (${id}) permanently deleted`);
  }
}


