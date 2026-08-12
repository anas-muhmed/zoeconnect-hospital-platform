import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { CloudTenant } from './entities/cloud-tenant.entity';
import { Hospital } from '../hospitals/entities/hospital.entity';
import { ProvisionCloudTenantDto } from './dto/provision-cloud-tenant.dto';

// Cloud Tenant Onboarding, Phase B Step 6
// (CLOUD_TENANT_ONBOARDING_DESIGN.md, Section 3).
//
// Fully self-contained: reads/writes only the `cloud_tenants` table via
// `CloudTenant`, never touches `Hospital`/`hospitals.service.ts`. The
// existing self-hosted "Register to Vendor" flow (HospitalsService.register,
// called BY an ZoeConnect instance) is completely separate machinery from this
// service (which CALLS OUT to ZoeConnect to provision a brand-new cloud tenant).
@Injectable()
export class CloudTenantsService {
  private readonly logger = new Logger(CloudTenantsService.name);

  constructor(
    @InjectRepository(CloudTenant)
    private readonly cloudTenantRepo: Repository<CloudTenant>,
    // Customers merge (Phase 2) -- see linkHospitalRecord() below and
    // CloudTenantsModule's doc comment for why this is injected directly
    // rather than via HospitalsModule/HospitalsService.
    @InjectRepository(Hospital)
    private readonly hospitalRepo: Repository<Hospital>,
  ) {}

  async list(): Promise<CloudTenant[]> {
    return this.cloudTenantRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<CloudTenant> {
    const tenant = await this.cloudTenantRepo.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Cloud tenant ${id} not found`);
    }
    return tenant;
  }

  /**
   * Provisions a new cloud tenant: generates the SUPER_ADMIN temporary
   * password here (Vendor Portal owns password generation per the approved
   * design -- ZoeConnect never generates or returns one), calls ZoeConnect's
   * provisioning endpoint, and persists the result.
   *
   * Persists a PENDING row *before* calling ZoeConnect (so a crash mid-call still
   * leaves a record to investigate/retry), then updates it to ACTIVE with
   * tenantId/subdomain/loginUrl/provisionedAt immediately on a successful
   * ZoeConnect response, or FAILED with the error otherwise -- per the explicit
   * requirement that those fields "come directly from the ZoeConnect provisioning
   * response and become the Vendor Portal's reference to the tenant."
   */
  async provision(dto: ProvisionCloudTenantDto): Promise<CloudTenant & { tempPassword: string }> {
    // ZoeConnect Identity Architecture Migration, Phase 6: subdomains are no
    // longer part of the platform's identity architecture, so they can no
    // longer serve as this lookup's correlation key.
    //
    // BUGFIX (2026-07-30, real incident): the first cut of this correlation
    // matched on `adminEmail` alone. That's unsafe -- unlike subdomain
    // (which was unique PER ORGANIZATION, so retrying the same hospital
    // always reused the same subdomain), `adminEmail` identifies an
    // ACCOUNT, and this codebase's own test/demo workflow routinely reuses
    // the same admin email across many DIFFERENT hospital names (see the
    // provisioning history: multiple hospitals provisioned with generic
    // reused test admin addresses). Matching on email alone meant
    // provisioning a brand-new, unrelated hospital that happened to reuse
    // a test email got silently treated as a *retry* of some OLDER,
    // unrelated hospital's failed attempt -- `resumeHdspProvisioning()`
    // then re-used that old run, which (if its `create_super_admin_user`
    // step had already succeeded) SKIPPED re-creating the admin account
    // entirely (ZoeConnect's execute() skips any step already 'succeeded').
    // The result: this screen displayed the brand-new hospital's name, a
    // freshly generated temp password, and a "success" banner, while the
    // actual account left behind was the OLD hospital's admin under its
    // OLD username/password -- the displayed credentials never worked.
    //
    // Fix: require BOTH `adminEmail` AND `hospitalName` to match before
    // treating a row as "the same attempt, retry it." Two genuinely
    // different real-world organizations sharing both the same hospital
    // name AND the same admin email is not a realistic collision; a
    // genuine retry of the same failed attempt always preserves both.
    const existing = await this.cloudTenantRepo
      .createQueryBuilder('tenant')
      .where('LOWER(tenant.adminEmail) = LOWER(:email)', { email: dto.adminEmail })
      .andWhere('tenant.hospitalName = :hospitalName', { hospitalName: dto.hospitalName })
      .orderBy('tenant.createdAt', 'DESC')
      .getOne();

    // A previous FAILED attempt does not permanently block retrying with
    // the same admin email -- retrying re-uses (overwrites) that failed row
    // rather than erroring, so the operator can just re-submit the same
    // form after fixing whatever caused the failure (see failureReason on
    // the FAILED row/response). DEPROVISIONED is deliberately NOT treated
    // like FAILED here (unlike a FAILED run, a deprovisioned tenant may
    // have real history worth preserving) -- provisioning a brand-new
    // organization for that same admin email requires deprovisioning
    // context an operator should look at first, so this still blocks with
    // a clear message rather than silently overwriting history.
    // Retry Provisioning concurrency guard (2026-08): 'RETRYING' is the
    // short-lived status retry() atomically claims a FAILED row into
    // (see CloudTenant.provisioningStatus's doc comment) immediately
    // before calling this method -- it must be treated exactly like
    // FAILED here, or every retry() call would immediately 400 against
    // its own just-claimed row.
    if (existing && existing.provisioningStatus !== 'FAILED' && existing.provisioningStatus !== 'RETRYING') {
      const hint = existing.provisioningStatus === 'DEPROVISIONED'
        ? ' It was deprovisioned -- provisioning a new organization for this admin requires operator review first.'
        : '';
      throw new BadRequestException(
        `Admin email "${dto.adminEmail}" is already associated with an existing cloud tenant for hospital "${dto.hospitalName}".${hint}`,
      );
    }

    // A previous FAILED attempt may already have gotten past ZoeConnect's early
    // pipeline steps (create_tenant_row), which commit a real `Tenant` row
    // even though the run failed later (e.g. at create_super_admin_user on
    // a username conflict). ZoeConnect's provisioning pipeline is deliberately
    // NOT rolled back on failure -- only resumed -- so a brand-new
    // provision() call for the same admin identity would immediately 409
    // against that already-committed Tenant row. Retrying must therefore
    // call ZoeConnect's resume endpoint against the previous run (which
    // re-uses that commitment and re-tries only the steps that never
    // succeeded), not start a fresh run.
    //
    // Self-healing fallback: if this local row doesn't know its own
    // provisioningRunId (e.g. it was created before this field existed, or
    // got out of sync some other way), don't just give up and call a fresh
    // provision() -- that would permanently 409 forever against ZoeConnect's
    // already-committed Tenant row with no way to recover. Instead look the
    // run up on ZoeConnect by admin email first.
    const priorRunId = existing?.provisioningRunId
      ?? (existing ? await this.findHdspRunIdByAdminEmail(dto.adminEmail, dto.hospitalName) : null);

    // Tenant-Scoped User Identity, Task 9 (revised Phase 6): the local check
    // above only covers Vendor Portal's OWN `cloud_tenants` table -- it would
    // miss a username/email already taken by a tenant provisioned some
    // other way (e.g. ZoeConnect's internal SUPER_ADMIN-JWT admin path,
    // bypassing Vendor Portal entirely). Extends, not replaces, the existing
    // local pre-check by additionally asking ZoeConnect itself before
    // committing. Skipped when resuming a prior run (`priorRunId` set): in
    // that case the admin identity is EXPECTED to already exist on ZoeConnect's
    // side (this same run's own already-committed attempt), not a real
    // collision.
    if (!priorRunId) {
      await this.checkHdspAvailability(dto);
    }

    let tenant: CloudTenant;
    if (existing) {
      existing.hospitalName = dto.hospitalName;
      existing.subdomain = dto.subdomain ?? null;
      existing.adminUsername = dto.adminUsername;
      existing.adminEmail = dto.adminEmail;
      existing.subscriptionPlan = dto.subscriptionPlan ?? null;
      existing.hdspTenantId = null;
      existing.loginUrl = null;
      existing.provisionedAt = null;
      existing.failureReason = null;
      existing.provisioningStatus = 'PENDING';
      tenant = await this.cloudTenantRepo.save(existing);
    } else {
      tenant = this.cloudTenantRepo.create({
        hospitalName: dto.hospitalName,
        subdomain: dto.subdomain ?? null,
        adminUsername: dto.adminUsername,
        adminEmail: dto.adminEmail,
        subscriptionPlan: dto.subscriptionPlan ?? null,
        provisioningStatus: 'PENDING',
      });
      tenant = await this.cloudTenantRepo.save(tenant);
    }

    const tempPassword = this.generateTempPassword();

    tenant.provisioningStatus = 'PROVISIONING';
    tenant = await this.cloudTenantRepo.save(tenant);

    try {
      const response = priorRunId
        ? await this.resumeHdspProvisioning(priorRunId, {
            adminUsername: dto.adminUsername,
            adminEmail: dto.adminEmail,
            adminFullName: dto.adminFullName,
            adminPassword: tempPassword,
          })
        : await this.callHdspProvisioning({
            hospitalName: dto.hospitalName,
            subdomain: dto.subdomain,
            adminUsername: dto.adminUsername,
            adminEmail: dto.adminEmail,
            adminFullName: dto.adminFullName,
            adminPassword: tempPassword,
            triggeredBy: 'vendor-portal',
          });

      const { summary, run } = response;

      tenant.hdspTenantId = summary.tenantId ?? null;
      tenant.loginUrl = summary.loginUrl ?? null;
      tenant.provisioningRunId = run?.id ?? null;
      // Cloud Licensing API (2026-07-29) -- only set on a genuine new value
      // from this response; a `resume()` response that doesn't re-run
      // stepIssueTrialLicense (already-completed step, not re-dispatched)
      // returns `instanceSecret: null` and must NOT clobber the value this
      // row already captured on the original attempt.
      if (summary.instanceSecret) {
        tenant.instanceSecret = summary.instanceSecret;
      }
      // Allow Cloud Tenants to Submit License Requests -- same
      // only-set-on-a-genuine-new-value reasoning as instanceSecret just
      // above: a resume() response that doesn't re-run stepIssueTrialLicense
      // returns `instanceToken: null` and must not clobber the value this
      // row already captured on the original attempt.
      if (summary.instanceToken) {
        tenant.instanceToken = summary.instanceToken;
      }
      tenant.provisioningStatus = summary.status === 'completed' ? 'ACTIVE' : 'FAILED';
      tenant.provisionedAt = tenant.provisioningStatus === 'ACTIVE' ? new Date() : null;
      if (tenant.provisioningStatus === 'FAILED') {
        tenant.failureReason = run?.error ?? 'ZoeConnect provisioning did not complete';
      }
      tenant = await this.cloudTenantRepo.save(tenant);

      // Customers merge (Phase 2) -- only on a genuine ACTIVE result. A
      // FAILED run has nothing worth surfacing in the unified Hospitals
      // list yet (and may be retried/resumed under the same admin identity --
      // see priorRunId above -- so it shouldn't create a stray row every
      // attempt).
      if (tenant.provisioningStatus === 'ACTIVE') {
        await this.linkHospitalRecord(tenant);
      }

      // The temporary password is returned once, in this response only --
      // it is never persisted (matches ZoeConnect's own posture: no password
      // value is stored beyond what's needed to hand it to the caller once).
      return { ...tenant, tempPassword };
    } catch (err: any) {
      this.logger.error(`Provisioning failed for admin email "${dto.adminEmail}": ${err.message}`);
      tenant.provisioningStatus = 'FAILED';
      tenant.failureReason = err.message;
      tenant = await this.cloudTenantRepo.save(tenant);
      throw err;
    }
  }

  /**
   * "Retry Provisioning" (2026-08, code review follow-up) -- lets an
   * operator recover a FAILED cloud tenant row from the Tenant Details
   * page without re-typing the whole provisioning form. Deliberately does
   * NOT introduce a second resume code path: it rebuilds the exact same
   * `ProvisionCloudTenantDto` from this row's own stored fields and calls
   * `provision()` again, which ALREADY resumes in place rather than
   * starting a new run -- see provision()'s `existing`/`priorRunId`
   * handling above (matches on this row's own adminEmail+hospitalName,
   * finds this row itself as `existing`, and resumes its
   * `provisioningRunId` on ZoeConnect via `resumeHdspProvisioning()`).
   * `retry()` is a UI convenience over that existing machinery, not a new
   * mechanism -- one behavior to test and reason about, not two.
   *
   * Duplicate-Active-Hospital Protection (2026-08, code review follow-up):
   * gated by `evaluateRetryEligibility()` below BEFORE ever calling
   * `provision()`/`resumeHdspProvisioning()` -- see that method's doc
   * comment for the full reasoning. This is the only thing standing
   * between a stale FAILED saga and accidentally resuming underneath an
   * already-provisioned, ACTIVE workspace for the same hospital.
   *
   * Concurrent-Retry Guard (2026-08, code review follow-up): two Retry
   * clicks racing (double-click, or two operators on the same row) must
   * not both call `resumeHdspProvisioning()` against the same ZoeConnect
   * saga at once. Rather than a distributed lock (Redis, or a Postgres
   * session-level advisory lock -- the latter is a real footgun with a
   * pooled connection, since `pg_advisory_lock`/`_unlock` are tied to the
   * specific pooled connection they ran on, which TypeORM does not
   * guarantee stays fixed across two separate `.query()` calls), this
   * uses a single atomic, conditional UPDATE (`... WHERE provisioning_status
   * = 'FAILED'`) to claim the row into the transitional `RETRYING` status
   * (see that status's own doc comment on the entity). Postgres serializes
   * concurrent UPDATEs to the same row -- the second racing UPDATE blocks
   * until the first commits, then re-evaluates its own WHERE clause against
   * the now-committed 'RETRYING' value and matches zero rows. Whichever
   * request's UPDATE affects 0 rows loses the race and gets a clear,
   * specific error instead of silently double-resuming.
   */
  async retry(id: string): Promise<CloudTenant & { tempPassword: string }> {
    const tenant = await this.findOne(id);
    const eligibility = await this.evaluateRetryEligibility(tenant);
    if (!eligibility.allowed) {
      throw new BadRequestException(eligibility.reason);
    }

    const claim = await this.cloudTenantRepo
      .createQueryBuilder()
      .update(CloudTenant)
      .set({ provisioningStatus: 'RETRYING' })
      .where('id = :id', { id: tenant.id })
      .andWhere('provisioning_status = :status', { status: 'FAILED' })
      .execute();

    if (claim.affected !== 1) {
      throw new ConflictException(
        'This provisioning run is already being retried by another request. Please wait for it to finish and refresh.',
      );
    }

    return this.provision({
      hospitalName: tenant.hospitalName,
      subdomain: tenant.subdomain ?? undefined,
      adminUsername: tenant.adminUsername,
      adminEmail: tenant.adminEmail,
      adminFullName: undefined,
      subscriptionPlan: tenant.subscriptionPlan ?? undefined,
    });
  }

  /**
   * Public read-only counterpart to the gate inside `retry()` -- lets the
   * Vendor Portal frontend ask "would Retry be allowed right now?" BEFORE
   * the operator clicks the button, so the UI can disable it and show the
   * real reason up front instead of surfacing a generic error only after
   * a failed click (Retry Provisioning Enhancement requirement 3/4).
   */
  async getRetryEligibility(id: string): Promise<{ allowed: boolean; reason?: string }> {
    const tenant = await this.findOne(id);
    return this.evaluateRetryEligibility(tenant);
  }

  /**
   * Duplicate-Active-Hospital Protection (2026-08, code review follow-up
   * on Retry Provisioning). Real incident this guards against: hospital
   * provisioned once, fails partway (e.g. the ensure_global_roles gap);
   * operator re-provisions the SAME hospital through the normal form,
   * this time with a different (corrected) admin identity, and it
   * succeeds -- leaving one ACTIVE `CloudTenant` row and one orphaned
   * FAILED row for the same real-world hospital. If an operator later
   * clicked Retry on that stale FAILED row, `provision()`'s own
   * correlation (keyed on THIS row's adminEmail+hospitalName, which is
   * still the OLD admin identity) would find itself as `existing` and
   * happily resume the old ZoeConnect saga -- creating a second,
   * inconsistent workspace for a hospital that already has a working one.
   *
   * Detection: the two rows share no immutable identifier that survives a
   * failed attempt (see this file's investigation, summarized in the
   * report delivered alongside this change) -- `hdspTenantId` is null on
   * the FAILED row precisely because it never got that far, `adminEmail`
   * is the field that legitimately DIFFERS between the two attempts, and
   * `subdomain` is optional/frequently absent post-Phase-6. `hospitalName`
   * (case-insensitive, trimmed) is the only field both rows share and the
   * one this schema already treats as the human-facing organization
   * identity everywhere else (`Tenant.name`, `cloud_tenants.hospital_name`).
   *
   * Known limitation, deliberately accepted: `hospitalName` is business
   * data, not a synthetic ID -- two genuinely different real-world
   * hospitals that happen to share an exact (normalized) name would
   * false-positive here and have their Retry blocked; that's the safe
   * failure direction (see this method's own read-only, block-only
   * framing above) and just means "start a fresh provisioning request"
   * instead of "click Retry" for that rare case. The opposite risk raised
   * in review -- a hospital renamed AFTER being provisioned, so an old
   * FAILED row's stored name no longer matches its later-renamed ACTIVE
   * counterpart, silently defeating this check -- is not reachable today:
   * I verified there is no rename/update path anywhere in this codebase
   * for a `CloudTenant` row's `hospitalName` once created (`provision()`
   * only ever writes it via the `existing`-row-reuse branch, which is this
   * exact retry flow re-asserting the SAME stored value, never a
   * standalone rename endpoint). If a hospital-rename feature is ever
   * added, this check should be revisited alongside it.
   *
   * Read-only, additive, and scoped ONLY to the Retry path -- never runs
   * for the normal provision() form submission, never touches the
   * existing ACTIVE row, never touches self-hosted (this entire service
   * only runs in vendor-portal, which self-hosted deployments don't use --
   * see CloudTenantsService's own header comment).
   */
  private async evaluateRetryEligibility(tenant: CloudTenant): Promise<{ allowed: boolean; reason?: string }> {
    if (tenant.provisioningStatus === 'RETRYING') {
      return {
        allowed: false,
        reason: 'This provisioning run is already being retried. Please wait for it to finish and refresh.',
      };
    }
    if (tenant.provisioningStatus !== 'FAILED') {
      return {
        allowed: false,
        reason: `Only a FAILED provisioning run can be retried (current status: ${tenant.provisioningStatus}).`,
      };
    }

    const supersededBy = await this.cloudTenantRepo
      .createQueryBuilder('t')
      .where('t.id != :id', { id: tenant.id })
      .andWhere('t.provisioningStatus = :status', { status: 'ACTIVE' })
      .andWhere('LOWER(TRIM(t.hospitalName)) = LOWER(TRIM(:hospitalName))', { hospitalName: tenant.hospitalName })
      .getOne();

    if (supersededBy) {
      return {
        allowed: false,
        reason: 'This provisioning request has already been superseded by a successful provisioning. Retry is no longer available.',
      };
    }

    return { allowed: true };
  }

  /**
   * Tenant-Scoped User Identity, Task 9 -- calls ZoeConnect's new
   * `POST /platform/tenant-provisioning/check-availability` before
   * `provision()` commits anything.
   *
   * ZoeConnect Identity Architecture Migration, Phase 6 REVISION: `adminUsername`/
   * `adminEmail` are now the hard blockers (ZoeConnect reports them as
   * `blocking: true` -- global, case-insensitive uniqueness per Phase 4).
   * `subdomain`, if supplied at all, is advisory-only on ZoeConnect's side now
   * (`blocking: false`) -- logged for visibility, never thrown.
   *
   * Deliberately a courtesy check, not a hard dependency: if the call
   * itself fails (network blip, ZoeConnect briefly unreachable, provisioning not
   * configured at all) this falls through and lets `provision()` proceed
   * to the real call, which will surface any genuine collision itself --
   * just later in the pipeline, exactly like the behavior before this task
   * existed. A failed pre-flight check must never be the reason a
   * legitimate provisioning attempt can't proceed.
   */
  private async checkHdspAvailability(dto: ProvisionCloudTenantDto): Promise<void> {
    const baseUrl = process.env.HDSP_BACKEND_URL;
    const apiKey = process.env.HDSP_PROVISIONING_API_KEY;
    if (!baseUrl || !apiKey) {
      // Not configured at all -- the real provisioning call a few lines
      // below will fail with a clear, specific error about this; no need
      // to duplicate that here with a less specific one.
      return;
    }

    let result: CheckAvailabilityResponse;
    try {
      result = await this.callHdsp<CheckAvailabilityResponse>(
        '/api/v1/platform/tenant-provisioning/check-availability',
        {
          ...(dto.subdomain ? { subdomain: dto.subdomain } : {}),
          adminUsername: dto.adminUsername,
          adminEmail: dto.adminEmail,
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `ZoeConnect pre-flight availability check failed, proceeding without it: ${err.message}`,
      );
      return;
    }

    const fields = Object.values(result.fields);
    const blocked = fields.filter((f) => f.blocking && f.taken);
    if (blocked.length > 0) {
      throw new BadRequestException(
        blocked.map((f) => f.note ?? `${f.field} is already taken`).join(' '),
      );
    }

    const advisories = fields.filter((f) => !f.blocking && f.taken);
    if (advisories.length > 0) {
      this.logger.log(
        `Pre-flight advisory for admin email "${dto.adminEmail}": ` +
        advisories.map((f) => f.note).join(' '),
      );
    }
  }

  /**
   * CRITICAL FEATURE (production incident, 2026-08 -- live-typing username
   * availability): unlike `checkHdspAvailability()` above (a private,
   * throw-or-void PRE-SUBMIT gate embedded in `provision()`), this is a
   * PUBLIC method returning a structured, per-field result -- built for
   * `PublicSignupController`'s new `check-availability` endpoint, called
   * repeatedly while a prospective customer is still typing on zoeconnect.
   * in/sign-up, well before they ever submit the form.
   *
   * Reuses the exact same HDSP endpoint and shared plumbing as
   * `checkHdspAvailability()` (`callHdsp` -> ZoeConnect's own
   * `TenantProvisioningService.checkAvailability()`, which already
   * implements the reserved-system-username check -- see that method's own
   * `RESERVED_SYSTEM_USERNAMES` doc comment) -- no duplicated availability
   * logic, this is a thin response-shape adapter for the
   * `AvailabilityResponse` contract `useFieldAvailability`-style frontend
   * hooks already expect elsewhere in this codebase (`backend/src/common/
   * validation/field-availability.types.ts`).
   *
   * Deliberately DOES throw on a genuine failure to reach ZoeConnect (unlike
   * the courtesy pre-flight check, which fails open) -- a live-typing check
   * has no "fall through to the real call" to fail open INTO; the caller
   * (PublicSignupController) maps a thrown error to the whole request
   * failing, which the frontend hook already treats as "back to idle,
   * non-blocking" (see useFieldAvailability's own `.catch()`), not as a
   * false "taken".
   */
  async checkPublicAvailability(params: {
    adminUsername?: string;
    adminEmail?: string;
  }): Promise<{ fields: Record<string, { available: boolean; reason?: 'already_exists' | 'reserved' }> }> {
    const result = await this.callHdsp<CheckAvailabilityResponse>(
      '/api/v1/platform/tenant-provisioning/check-availability',
      {
        ...(params.adminUsername ? { adminUsername: params.adminUsername } : {}),
        ...(params.adminEmail ? { adminEmail: params.adminEmail } : {}),
      },
    );

    const fields: Record<string, { available: boolean; reason?: 'already_exists' | 'reserved' }> = {};
    for (const [key, f] of Object.entries(result.fields)) {
      if (!f.taken) {
        fields[key] = { available: true };
        continue;
      }
      // ZoeConnect's own note text is the only place today that
      // distinguishes "reserved system username" from "genuinely taken" --
      // matched by substring rather than adding a third wire field, since
      // this is the ONE call site that needs the distinction and the note
      // text is already stable, tested copy (see RESERVED_SYSTEM_USERNAMES's
      // doc comment on the ZoeConnect side). If ZoeConnect's copy ever
      // changes, this falls back safely to 'already_exists' -- never a
      // crash, and never a false 'available'.
      fields[key] = {
        available: false,
        reason: f.note?.toLowerCase().includes('reserved for platform system accounts') ? 'reserved' : 'already_exists',
      };
    }
    return { fields };
  }

  private generateTempPassword(): string {
    // 24 random bytes, base64url-encoded, trimmed to a manageable length --
    // meets ProvisionTenantDto's `adminPassword` min-length-8 requirement
    // on the ZoeConnect side with plenty of margin.
    return crypto.randomBytes(24).toString('base64url');
  }

  private async callHdspProvisioning(payload: {
    hospitalName: string;
    subdomain?: string;
    adminUsername: string;
    adminEmail: string;
    adminFullName?: string;
    adminPassword: string;
    triggeredBy?: string;
  }): Promise<HdspProvisioningResponse> {
    return this.callHdsp('/api/v1/platform/tenant-provisioning', payload);
  }

  /**
   * Retries a previously-failed run in place instead of starting a new one
   * -- see the doc comment above provision()'s priorRunId branch for why a
   * fresh provision() call can't be used here (the subdomain's Tenant row
   * is already committed by the earlier steps that DID succeed).
   * `overrides` lets the caller correct exactly the fields that commonly
   * cause a step 9 failure (username/email conflict) plus a fresh
   * password, without touching hospitalName/subdomain -- see
   * TenantProvisioningService.resume() on the ZoeConnect side for why those two
   * are deliberately not overridable.
   */
  private async resumeHdspProvisioning(
    runId: string,
    overrides: { adminUsername?: string; adminEmail?: string; adminFullName?: string; adminPassword: string },
  ): Promise<HdspProvisioningResponse> {
    return this.callHdsp(`/api/v1/platform/tenant-provisioning/${runId}/resume`, overrides);
  }

  /**
   * Recovery lookup for when this local row's provisioningRunId is missing
   * (see the self-healing comment above provision()'s priorRunId). Calls
   * ZoeConnect's GET /platform/tenant-provisioning (all runs, internal-operator
   * listing -- Task 10.7) and finds the most recent run whose
   * requestedAdminEmail matches (case-insensitively), since ZoeConnect has no
   * email-filtered lookup endpoint today.
   *
   * ZoeConnect Identity Architecture Migration, Phase 6: previously matched on
   * `requestedSubdomain` -- subdomains are no longer a reliable correlation
   * key (optional now, and no longer globally unique/identity-bearing), so
   * this matches on `requestedAdminEmail` instead, mirroring the same
   * global-uniqueness anchor `provision()`'s own local lookup now uses.
   *
   * BUGFIX (2026-07-30): also requires `requestedHospitalName` to match --
   * see the long comment on `provision()`'s own `existing` lookup for why
   * email alone is unsafe (this codebase's test/demo workflow routinely
   * reuses the same admin email across different hospital names, which
   * would otherwise resume a completely unrelated older attempt and
   * silently skip re-creating the admin account).
   *
   * Returns null if ZoeConnect has no record either (genuinely a brand-new
   * admin identity) or the request itself fails -- callers fall back to a
   * fresh provision() call in that case, same as before this method existed.
   */
  private async findHdspRunIdByAdminEmail(adminEmail: string, hospitalName: string): Promise<string | null> {
    const baseUrl = process.env.HDSP_BACKEND_URL;
    const apiKey = process.env.HDSP_PROVISIONING_API_KEY;
    if (!baseUrl || !apiKey) {
      return null;
    }

    try {
      const url = baseUrl.replace(/\/+$/, '') + '/api/v1/platform/tenant-provisioning';
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'X-Vendor-Portal-Api-Key': apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return null;
      }
      const runs = (await res.json()) as Array<{
        id: string;
        requestedAdminEmail: string;
        requestedHospitalName: string;
        status: string;
        createdAt: string;
      }>;
      const matches = runs
        .filter((r) =>
          r.requestedAdminEmail?.toLowerCase() === adminEmail.toLowerCase() &&
          r.requestedHospitalName === hospitalName)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return matches[0]?.id ?? null;
    } catch (err: any) {
      this.logger.warn(`Could not look up prior ZoeConnect run for admin email "${adminEmail}" / hospital "${hospitalName}": ${err.message}`);
      return null;
    }
  }

  // Generic so callers other than provision()/resume() (e.g.
  // checkHdspAvailability()) can reuse this same request/error-handling
  // shape against an endpoint with a different response body, without
  // duplicating the fetch/timeout/error-mapping logic.
  private async callHdsp<T = HdspProvisioningResponse>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.callHdspRaw<T>(path, 'POST', body);
  }

  /**
   * Phase 10.1/10.2 (Cloud Tenant Operations) -- GET variant of `callHdsp`
   * for read-only calls (provisioning-run detail) and a bodyless-POST
   * variant for the deprovision action. Shares the same base-URL/API-key
   * config check and error-mapping shape as `callHdsp` so a misconfigured
   * or unreachable ZoeConnect surfaces the same kind of error regardless of verb.
   */
  private async callHdspGet<T>(path: string): Promise<T> {
    return this.callHdspRaw<T>(path, 'GET');
  }

  private async callHdspRaw<T>(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
  ): Promise<T> {
    const baseUrl = process.env.HDSP_BACKEND_URL;
    const apiKey = process.env.HDSP_PROVISIONING_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new BadRequestException(
        'Cloud provisioning is not configured: HDSP_BACKEND_URL and HDSP_PROVISIONING_API_KEY must both be set',
      );
    }

    const url = baseUrl.replace(/\/+$/, '') + path;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Vendor-Portal-Api-Key': apiKey,
        },
        ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err: any) {
      throw new BadRequestException(`Could not reach ZoeConnect at ${baseUrl}: ${err.message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new BadRequestException(`ZoeConnect returned ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Cloud Tenant Operations, Phase 10.1 -- read-only provisioning history
   * for the Tenant Details page. Proxies ZoeConnect's `GET
   * /platform/tenant-provisioning/:runId`, keyed off the local row's
   * `provisioningRunId` (set once `provision()`/`resume()` gets a response
   * back from ZoeConnect -- see that field's doc comment on the entity). Returns
   * `null` rather than throwing when there's no run to look up yet (a
   * PENDING row that never got as far as calling ZoeConnect), so the frontend can
   * render an empty-state instead of an error.
   */
  async getProvisioningHistory(id: string): Promise<HdspRunDetail | null> {
    const tenant = await this.findOne(id);
    if (!tenant.provisioningRunId) {
      return null;
    }
    return this.callHdspGet<HdspRunDetail>(
      `/api/v1/platform/tenant-provisioning/${tenant.provisioningRunId}`,
    );
  }

  /**
   * Cloud Tenant Operations, Phase 10.2 -- wires Vendor Portal up to ZoeConnect's
   * existing `TenantProvisioningService.deprovision()` (Task 10.8), which
   * until now had no caller anywhere in this codebase (see
   * PHASE_10_DEFERRED_BACKLOG.md item 8). Deliberately as narrow as the
   * ZoeConnect endpoint itself -- this flips the tenant to inactive and revokes
   * its connector pairings; it is NOT a delete, and there is no
   * un-deprovision path (matches ZoeConnect's own "pilot rollback, not full
   * lifecycle management" scope for this action).
   *
   * Requires `hdspTenantId` -- a row that never got that far (PENDING/
   * FAILED before ZoeConnect returned a tenant id) has nothing on the ZoeConnect side
   * to deprovision.
   */
  async deprovision(id: string): Promise<CloudTenant> {
    const tenant = await this.findOne(id);
    if (!tenant.hdspTenantId) {
      throw new BadRequestException(
        'This tenant never completed provisioning on ZoeConnect — nothing to deprovision.',
      );
    }
    if (tenant.provisioningStatus === 'DEPROVISIONED') {
      throw new BadRequestException('This tenant has already been deprovisioned.');
    }

    await this.callHdspRaw(
      `/api/v1/platform/tenant-provisioning/tenants/${tenant.hdspTenantId}/deprovision`,
      'POST',
    );

    tenant.provisioningStatus = 'DEPROVISIONED';
    const saved = await this.cloudTenantRepo.save(tenant);

    // Customers merge (Phase 2) -- keep the linked hospital row's status in
    // sync so a deprovisioned tenant doesn't keep showing as ACTIVE/
    // manageable in the unified Hospitals list. Best-effort: a missing link
    // (e.g. this tenant was provisioned before Phase 2 existed) is not a
    // reason to fail the deprovision itself, which has already succeeded on
    // ZoeConnect's side by this point.
    try {
      const linked = await this.hospitalRepo.findOne({ where: { cloudTenantId: saved.id } });
      if (linked) {
        await this.hospitalRepo.update(linked.id, { status: 'SUSPENDED' });
      }
    } catch (err: any) {
      this.logger.warn(`Could not sync linked hospital status after deprovisioning ${saved.id}: ${err.message}`);
    }

    return saved;
  }

  /**
   * Customers merge (Phase 2, 2026-07-20) -- creates (or, on a retried
   * provisioning attempt, re-uses) the `hospitals` row that gives a cloud
   * tenant the same ongoing management surface self-hosted hospitals get:
   * license viewing, ZoeConnect user management, system settings, HIS Query
   * Configuration. See HospitalsService's per-method guards for the parts
   * of that surface that do NOT work for a cloud row (anything that pushes
   * to a physical instance's publicIp:port -- there isn't one).
   *
   * Looked up by `cloudTenantId`, not `hospitalCode`, so a retried/resumed
   * provisioning run (see provision()'s priorRunId handling) updates the
   * same row instead of creating a duplicate.
   *
   * hospitalCode is derived with a `cloud-` prefix to avoid colliding with
   * self-hosted's own hospitalCode values (which follow a different,
   * operator-chosen naming convention) under the single global unique
   * constraint both share.
   *
   * ZoeConnect Identity Architecture Migration, Phase 6: previously derived
   * from `tenant.subdomain`, which is now optional and may be null. Falls
   * back to a slugified `hospitalName` plus a short slice of the tenant's
   * own uuid (always present, always unique) to guarantee a collision-free
   * code even when two tenants share a similar hospital name.
   */
  private async linkHospitalRecord(tenant: CloudTenant): Promise<void> {
    const codeSeed = tenant.subdomain
      ?? `${tenant.hospitalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}-${tenant.id.slice(0, 8)}`;
    const hospitalCode = `cloud-${codeSeed}`;
    let hospital = await this.hospitalRepo.findOne({ where: { cloudTenantId: tenant.id } });

    if (hospital) {
      hospital.hospitalName = tenant.hospitalName;
      hospital.status = 'ACTIVE';
    } else {
      hospital = this.hospitalRepo.create({
        deploymentType: 'cloud',
        cloudTenantId: tenant.id,
        hospitalName: tenant.hospitalName,
        hospitalCode,
        status: 'ACTIVE',
        // Self-hosted-only fields intentionally left null -- see
        // hospital.entity.ts's doc comment on why these are nullable now.
        instanceToken: null,
        instanceSecret: null,
        publicIp: null,
        publicPort: null,
        webhookUrl: null,
        machineFingerprint: null,
      });
    }

    try {
      await this.hospitalRepo.save(hospital);
    } catch (err: any) {
      // Non-fatal: provisioning itself already succeeded on ZoeConnect's side by
      // the time this runs (see the call site). A hospitalCode collision
      // (23505) is the only realistically expected failure here -- log it
      // clearly rather than lose the tenant record silently, but don't
      // throw and unwind an otherwise-successful provisioning response.
      this.logger.error(
        `Could not link hospital record for cloud tenant ${tenant.id} (hospitalCode="${hospitalCode}"): ${err.message}`,
      );
    }
  }

  /**
   * Subdomain Release Lifecycle -- wires Vendor Portal up to ZoeConnect's
   * `TenantProvisioningService.releaseSubdomain()`. Deliberately calls
   * ZoeConnect FIRST and only stamps the local `subdomainReleasedAt` copy on
   * success: ZoeConnect's `Tenant` row is the actual source of truth for
   * subdomain uniqueness (see CLOUD_TENANT_ONBOARDING_DESIGN.md's own
   * note that `cloud_tenants.subdomain` is not that source of truth) --
   * if ZoeConnect's call fails, this local row must NOT record a release that
   * didn't really happen, or a later provision() here would let a new
   * tenant through Vendor Portal's own check only to 409 against ZoeConnect's
   * still-claimed subdomain.
   *
   * Requires the row to actually be DEPROVISIONED first (mirrors ZoeConnect's
   * own guard) and not already released -- both produce a clear,
   * actionable error rather than a confusing pass-through of whatever
   * ZoeConnect's error text happens to be.
   */
  async releaseSubdomain(id: string): Promise<CloudTenant> {
    const tenant = await this.findOne(id);
    if (!tenant.hdspTenantId) {
      throw new BadRequestException(
        'This tenant never completed provisioning on ZoeConnect — there is no ZoeConnect-side subdomain claim to release.',
      );
    }
    // ZoeConnect Identity Architecture Migration, Phase 6: subdomain is now
    // optional -- a tenant provisioned without one has no subdomain claim
    // to release at all.
    if (!tenant.subdomain) {
      throw new BadRequestException('This tenant has no subdomain on record — nothing to release.');
    }
    if (tenant.provisioningStatus !== 'DEPROVISIONED') {
      throw new BadRequestException(
        `Only a deprovisioned tenant's subdomain can be released (current status: ${tenant.provisioningStatus}).`,
      );
    }
    if (tenant.subdomainReleasedAt) {
      throw new BadRequestException(
        `Subdomain "${tenant.subdomain}" was already released at ${tenant.subdomainReleasedAt.toISOString()}.`,
      );
    }

    await this.callHdspRaw(
      `/api/v1/platform/tenant-provisioning/tenants/${tenant.hdspTenantId}/release-subdomain`,
      'POST',
    );

    tenant.subdomainReleasedAt = new Date();
    return this.cloudTenantRepo.save(tenant);
  }

  // ── Connector Management (Task #102, "Vendor Portal Connector
  // Management," 2026-07-22) ────────────────────────────────────────────
  //
  // Every method below is a thin proxy to the ZoeConnect-side endpoints added to
  // `TenantProvisioningController` under the same task -- Vendor Portal
  // never talks to a hospital's Connector directly (there is no network
  // path for that; a hospital's Connector only ever calls OUT to ZoeConnect,
  // never the reverse) and never exposes ZoeConnect's own internal endpoints to
  // the browser directly (the Vendor Portal frontend calls THIS backend,
  // which calls ZoeConnect -- same shape as every other cloud-tenant operation
  // in this file). All require `hdspTenantId` (a tenant that never
  // finished provisioning has no ZoeConnect-side Connector to manage at all --
  // same guard `deprovision()`/`releaseSubdomain()` already apply above).

  private requireHdspTenantId(tenant: CloudTenant): string {
    if (!tenant.hdspTenantId) {
      throw new BadRequestException(
        'This tenant never completed provisioning on ZoeConnect — there is no Connector to manage yet.',
      );
    }
    return tenant.hdspTenantId;
  }

  /**
   * Connector status + health summary for the Connector page's top panel.
   * Proxies `GET /platform/tenant-provisioning/tenants/:tenantId/connector`.
   * `registered: false` (never returned an `hdspTenantId` guard error, just
   * ZoeConnect's own honest "no ConnectorInstance yet" response) is a normal,
   * expected state for a freshly-provisioned tenant whose hospital hasn't
   * installed/activated a Connector yet -- not an error.
   */
  async getConnectorStatus(id: string): Promise<ConnectorStatusResponse> {
    const tenant = await this.findOne(id);
    const tenantId = this.requireHdspTenantId(tenant);
    return this.callHdspGet<ConnectorStatusResponse>(
      `/api/v1/platform/tenant-provisioning/tenants/${tenantId}/connector`,
    );
  }

  /** Recent connector-lifecycle audit activity. Proxies the matching ZoeConnect GET route. */
  async getConnectorActivity(id: string, limit?: number): Promise<ConnectorActivityEntry[]> {
    const tenant = await this.findOne(id);
    const tenantId = this.requireHdspTenantId(tenant);
    const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
    return this.callHdspGet<ConnectorActivityEntry[]>(
      `/api/v1/platform/tenant-provisioning/tenants/${tenantId}/connector/activity${qs}`,
    );
  }

  /** "Republish Query Definitions." Proxies the matching ZoeConnect POST route. */
  async republishConnectorDefinitions(id: string): Promise<PublishSummaryResponse> {
    const tenant = await this.findOne(id);
    const tenantId = this.requireHdspTenantId(tenant);
    return this.callHdspRaw<PublishSummaryResponse>(
      `/api/v1/platform/tenant-provisioning/tenants/${tenantId}/connector/republish`,
      'POST',
    );
  }

  /** "Force Connector Resync." Proxies the matching ZoeConnect POST route. */
  async resyncConnector(id: string): Promise<PublishSummaryResponse & { connectorId: string }> {
    const tenant = await this.findOne(id);
    const tenantId = this.requireHdspTenantId(tenant);
    return this.callHdspRaw<PublishSummaryResponse & { connectorId: string }>(
      `/api/v1/platform/tenant-provisioning/tenants/${tenantId}/connector/resync`,
      'POST',
    );
  }

  /**
   * "Generate Activation Code" / "Regenerate Activation Code" -- same ZoeConnect
   * operation either way, see `TenantProvisioningController
   * .regenerateConnectorActivationCode()`'s doc comment on why there's only
   * one backend route for both. Returns `activationCode` in the clear,
   * exactly once, exactly like `provision()` above returns `tempPassword`
   * once -- never persisted here, never retrievable again after this
   * response.
   */
  async regenerateConnectorActivationCode(id: string): Promise<ActivationCodeResponse> {
    const tenant = await this.findOne(id);
    const tenantId = this.requireHdspTenantId(tenant);
    return this.callHdspRaw<ActivationCodeResponse>(
      `/api/v1/platform/tenant-provisioning/tenants/${tenantId}/connector-activation-code/regenerate`,
      'POST',
    );
  }

  /**
   * Connector installer version/download info -- NOT tenant-scoped (one
   * current build for every tenant), so unlike every other method in this
   * section it doesn't resolve a `CloudTenant` row at all. Proxies ZoeConnect's
   * `GET /platform/tenant-provisioning/connector-installer`.
   */
  async getConnectorInstaller(): Promise<ConnectorInstallerResponse> {
    return this.callHdspGet<ConnectorInstallerResponse>(
      '/api/v1/platform/tenant-provisioning/connector-installer',
    );
  }
}

// ── Connector Management response shapes (Task #102) ────────────────────
// Mirror ZoeConnect's `TenantProvisioningController` response shapes exactly --
// this backend adds no fields and renames nothing, it's a pure proxy.

export type ConnectorStatusResponse =
  | { registered: false }
  | {
      registered: true;
      connectorId: string;
      status: string;
      hostname: string | null;
      version: string | null;
      lastSeenAt: string | null;
      isConnected: boolean;
      registeredAt: string;
      definitions: { definitionCount: number; lastCompiledAt: string | null };
    };

export interface ConnectorActivityEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  newValue: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PublishSummaryResponse {
  ok: true;
  tenantId: string;
  changedQueryIds: string[];
  skippedQueryIds: string[];
  pushed: boolean;
}

export interface ActivationCodeResponse {
  pairingId: string;
  activationCode: string;
  status: string;
  expiresAt: string;
}

export type ConnectorInstallerResponse =
  | { available: false }
  | { available: true; version: string; downloadUrl: string; releaseNotes: string | null };

export interface HdspRunDetail {
  run: {
    id: string;
    status: string;
    error?: string | null;
    createdAt: string;
    updatedAt?: string;
  };
  steps: Array<{
    stepNumber: number;
    stepName: string;
    status: 'pending' | 'in_progress' | 'succeeded' | 'failed';
    lastError: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
}

interface HdspProvisioningResponse {
  run: { id: string; status: string; error?: string | null };
  summary: {
    tenantId: string | null;
    subdomain: string | null;
    adminUsername: string;
    loginUrl: string | null;
    status: string;
    // Cloud Licensing API (2026-07-29) -- see CloudTenant.instanceSecret's
    // doc comment. Optional on this interface since older ZoeConnect
    // deployments predating this field simply won't include it.
    instanceSecret?: string | null;
    // Allow Cloud Tenants to Submit License Requests -- see
    // CloudTenant.instanceToken's doc comment. Same optionality reasoning
    // as instanceSecret above.
    instanceToken?: string | null;
  };
}

/**
 * Tenant-Scoped User Identity, Task 9 -- mirrors ZoeConnect's
 * `TenantProvisioningService.checkAvailability()` response shape exactly
 * (see that method's doc comment on the ZoeConnect side for what `blocking`
 * means). As of Phase 6, `adminUsername`/`adminEmail` are the blocking
 * fields (global, case-insensitive uniqueness) and `subdomain` -- if
 * present at all -- is advisory-only.
 */
interface CheckAvailabilityResponse {
  canProceed: boolean;
  fields: Record<string, { field: string; taken: boolean; blocking: boolean; note?: string }>;
}
