import {
  Injectable, Logger, ConflictException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Tenant } from '../tenant/entities/tenant.entity';
import { Role } from '../../rbac/entities/role.entity';
import { Permission } from '../../rbac/entities/permission.entity';
import { SubscriptionLicense } from '../../licensing/entities/subscription-license.entity';
import { VendorRegistration } from '../../licensing/entities/vendor-registration.entity';
import { User } from '../../users/entities/user.entity';
import { assertGlobalIdentityAvailable } from '../../users/global-identity-conflict.util';
import { AuthService } from '../../auth/auth.service';
import {
  TenantProvisioningRun, ProvisioningRunStatus,
} from './entities/tenant-provisioning-run.entity';
import { TenantProvisioningStep } from './entities/tenant-provisioning-step.entity';
import { TenantConnectorPairing } from './entities/tenant-connector-pairing.entity';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { CheckProvisioningAvailabilityDto } from './dto/check-provisioning-availability.dto';
import { TenantProvisionedEvent, TENANT_PROVISIONED_EVENT } from './events/tenant-provisioned.event';
import { generateActivationCode } from './connector-activation-code.util';
import { OrganizationBranchService } from '../../organization-branch/organization-branch.service';

/** One field's pre-flight result -- see `checkAvailability()`'s doc comment for what `blocking` means. */
export interface FieldAvailability {
  field: string;
  taken: boolean;
  blocking: boolean;
  note?: string;
}

const BCRYPT_ROUNDS = 12;

/**
 * D.6 ("Onboarding UX," 2026-07-22): validity window for a connector
 * Activation Code. 72 hours -- generous enough that a code generated
 * during initial tenant provisioning (which may sit unactivated for a
 * few days while a hospital's IT schedules the on-site install) doesn't
 * expire before anyone gets to it, while still being short enough that a
 * short, human-typeable code (much lower entropy than the original
 * 43-character opaque token) isn't valid indefinitely. A regenerated code
 * (`regenerateConnectorActivationCode()`, used when hospital IT is
 * activating RIGHT NOW) uses the same window -- deliberately not
 * shortened further, since there's no operational reason to differentiate
 * "first code" from "replacement code" here.
 */
const ACTIVATION_CODE_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * The 10 pipeline steps from spec Section 8.1, plus one additive 11th step
 * ('create_default_org_branch', ZoeConnect Identity Architecture Migration,
 * Phase 1 -- not part of the original spec, inserted after
 * 'create_super_admin_user'). Kept as an ordered const array (not scattered
 * magic numbers) so `provision()`/`resume()` and the step-dispatch table
 * stay in lockstep.
 */
const STEP_NAMES = [
  'create_tenant_row',
  'reserve_subdomain',
  'ensure_global_roles',
  'ensure_global_permissions',
  'ensure_global_settings',
  'allocate_storage_namespace',
  'generate_connector_pairing_key',
  'issue_trial_license',
  'create_super_admin_user',
  // ZoeConnect Identity Architecture Migration, Phase 1 -- creates the one
  // default `organization_branches` row for the newly-provisioned tenant
  // (see stepCreateDefaultOrgBranch() below). Placed after
  // 'create_super_admin_user' and before 'emit_tenant_provisioned_event'
  // per the phase's explicit ordering requirement; purely additive, does
  // not touch any prior step's behavior.
  'create_default_org_branch',
  'emit_tenant_provisioned_event',
] as const;

/** Default roles this platform seeds globally today -- see seed-platform.ts. Mirrored here, not duplicated as new rows, per the Role-entity global-uniqueness finding (PHASE_10_ARCHITECTURE_REVIEW.md, Question 7). */
const REQUIRED_GLOBAL_ROLES = [
  'SUPER_ADMIN', 'HOSPITAL_ADMIN', 'LOYALTY_OPERATOR', 'MARKETING_TEAM',
  'MANAGEMENT', 'EIC_THERAPIST', 'EIC_CENTRE_HEAD', 'TOKEN_OPERATOR',
];

/**
 * CRITICAL FIX (production incident, 2026-08): usernames chosen for a new
 * tenant's SUPER_ADMIN share ONE global, case-insensitive namespace with
 * every other user in the system (users.username, globally unique -- see
 * 1788500000000-GlobalIdentityUniqueness.ts) -- including the platform's
 * own bootstrap login account (`seed-platform.ts`'s "Creating Super Admin
 * user" section, username literally `superadmin`). REAL INCIDENT: an
 * operator ran `npm run seed` to unblock a failed provisioning run's
 * `ensure_global_roles` step (see 1790700000000-SeedGlobalRolesAndPermissions.ts,
 * which now makes that manual step unnecessary going forward) -- as an
 * unrelated side effect of that SAME script, the platform's own
 * `superadmin` bootstrap account was created, permanently occupying that
 * username. A subsequent tenant-provisioning attempt (or a public
 * self-signup retry) that happened to choose `adminUsername: "superadmin"`
 * was then correctly, but VERY confusingly, rejected as "already in use" --
 * indistinguishable, from the caller's point of view, from a genuine
 * collision with some other real customer's account.
 *
 * Fixed by rejecting this (and any future platform-reserved) username
 * EXPLICITLY and EARLY, with a distinct error message that tells the
 * caller WHY, rather than letting it fall through to the generic global
 * uniqueness conflict. This does not (and should not) delete or rename the
 * platform's own bootstrap account -- it prevents this specific class of
 * confusing collision from ever happening again, for this or any future
 * reserved name. Checked in BOTH `checkAvailability()` (the pre-flight /
 * live-typing check) and `stepCreateSuperAdminUser()` (the actual write
 * path) -- the latter is defense-in-depth for any caller that skips or
 * never reaches the pre-flight check (e.g. `resume()`, which deliberately
 * skips the pre-flight check for a run's OWN already-committed identity --
 * see CloudTenantsService.provision()'s `priorRunId` handling).
 */
const RESERVED_SYSTEM_USERNAMES = ['superadmin'];

function isReservedSystemUsername(username: string): boolean {
  return RESERVED_SYSTEM_USERNAMES.includes(username.trim().toLowerCase());
}

@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    @InjectRepository(TenantProvisioningRun) private readonly runRepo: Repository<TenantProvisioningRun>,
    @InjectRepository(TenantProvisioningStep) private readonly stepRepo: Repository<TenantProvisioningStep>,
    @InjectRepository(TenantConnectorPairing) private readonly pairingRepo: Repository<TenantConnectorPairing>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(SubscriptionLicense) private readonly licenseRepo: Repository<SubscriptionLicense>,
    // Cloud Licensing API (2026-07-29) -- see stepIssueTrialLicense()'s doc
    // comment below for why this is created directly (explicit tenantId
    // param) here instead of via VendorSyncService.autoRegisterCloudTenant()
    // (which requires ambient TenantContextStorage this synchronous
    // provisioning pipeline doesn't establish). Mirrors this module's own
    // established convention (see TenantProvisioningModule's doc comment)
    // of consuming another module's entity directly rather than depending
    // on its service layer.
    @InjectRepository(VendorRegistration) private readonly vendorRegRepo: Repository<VendorRegistration>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly authService: AuthService,
    private readonly eventEmitter: EventEmitter2,
    private readonly config: ConfigService,
    // ZoeConnect Identity Architecture Migration, Phase 1 -- injected as a
    // full service (mirrors this constructor's own AuthService precedent
    // above) rather than a raw repository, since
    // stepCreateDefaultOrgBranch() only needs OrganizationBranchService's
    // already-idempotent ensureDefaultForTenant(), not a broader repo surface.
    private readonly orgBranchService: OrganizationBranchService,
  ) { }

  /**
   * Tenant-Scoped User Identity, Task 9 -- pre-flight collision check.
   * Called by Vendor Portal's `CloudTenantsService.provision()` before it
   * commits step 1. Also usable by the internal admin-facing provisioning
   * UI for the same reason.
   *
   * ZoeConnect Identity Architecture Migration, Phase 6 REVISION: subdomains
   * are no longer part of the platform's identity architecture, so
   * `subdomain` is now advisory/historical only (`blocking: false`) --
   * reported purely for legacy-field visibility, never a reason to reject
   * provisioning. `adminUsername`/`adminEmail` are now the real blocking
   * checks: as of Phase 4's global case-insensitive unique indexes
   * (`uq_users_username_ci`/`uq_users_email_ci`), these values must be
   * unique across the ENTIRE platform, not per-tenant -- a collision here
   * is a genuine, unambiguous availability failure, exactly like the
   * pre-Phase-4 `subdomain` check used to be.
   */
  async checkAvailability(dto: CheckProvisioningAvailabilityDto): Promise<{
    canProceed: boolean;
    fields: {
      subdomain?: FieldAvailability;
      adminUsername?: FieldAvailability;
      adminEmail?: FieldAvailability;
      hisEmployeeCode?: FieldAvailability;
    };
  }> {
    const fields: {
      subdomain?: FieldAvailability;
      adminUsername?: FieldAvailability;
      adminEmail?: FieldAvailability;
      hisEmployeeCode?: FieldAvailability;
    } = {};

    // Historical/advisory only (Phase 6) -- never blocks provisioning.
    if (dto.subdomain) {
      const subdomainTaken = !!(await this.tenantRepo.findOne({
        where: { subdomain: dto.subdomain, subdomainReleasedAt: IsNull() },
      }));
      fields.subdomain = {
        field: 'subdomain',
        taken: subdomainTaken,
        blocking: false,
        ...(subdomainTaken && {
          note: `Subdomain "${dto.subdomain}" is already recorded against another tenant -- informational only, ` +
            `subdomains are no longer used for routing, login, or provisioning decisions.`,
        }),
      };
    }

    let usernameTaken = false;
    if (dto.adminUsername) {
      // CRITICAL FIX (production incident, 2026-08): checked BEFORE the
      // generic uniqueness query -- see RESERVED_SYSTEM_USERNAMES's own doc
      // comment. A reserved name is always reported with a distinct,
      // specific reason, not folded into the generic "already in use" path
      // below (even though a reserved name IS, as a factual matter, also
      // currently taken -- the point is telling the caller WHY, so this
      // doesn't look like a random collision with some other customer).
      if (isReservedSystemUsername(dto.adminUsername)) {
        usernameTaken = true;
        fields.adminUsername = {
          field: 'adminUsername',
          taken: true,
          blocking: true,
          note: `Username "${dto.adminUsername}" is reserved for platform system accounts and cannot be used for a tenant administrator. Please choose a different username.`,
        };
      } else {
        usernameTaken = await this.userRepo
          .createQueryBuilder('user')
          .where('LOWER(user.username) = LOWER(:username)', { username: dto.adminUsername })
          .getExists();
        fields.adminUsername = {
          field: 'adminUsername',
          taken: usernameTaken,
          blocking: true,
          ...(usernameTaken && {
            note: `Username "${dto.adminUsername}" is already in use. Usernames must be globally unique (case-insensitive) across all organizations.`,
          }),
        };
      }
    }

    let emailTaken = false;
    if (dto.adminEmail) {
      emailTaken = await this.userRepo
        .createQueryBuilder('user')
        .where('LOWER(user.email) = LOWER(:email)', { email: dto.adminEmail })
        .getExists();
      fields.adminEmail = {
        field: 'adminEmail',
        taken: emailTaken,
        blocking: true,
        ...(emailTaken && {
          note: `Email "${dto.adminEmail}" is already in use. Emails must be globally unique (case-insensitive) across all organizations.`,
        }),
      };
    }

    if (dto.hisEmployeeCode) {
      const taken = !!(await this.userRepo.findOne({ where: { hisEmployeeCode: dto.hisEmployeeCode } }));
      fields.hisEmployeeCode = {
        field: 'hisEmployeeCode',
        taken,
        blocking: false,
        ...(taken && {
          note: `HIS employee code "${dto.hisEmployeeCode}" is already used by at least one other tenant -- this ` +
            `is allowed (tenant-scoped, not global), shown for visibility only. Note: a new tenant's SUPER_ADMIN ` +
            `is never created with an hisEmployeeCode at provisioning time in the current flow.`,
        }),
      };
    }

    return { canProceed: !usernameTaken && !emailTaken, fields };
  }

  /**
   * Kicks off a brand-new provisioning run and executes all 10 steps.
   * If any step throws, the run is left `failed` at that step (not rolled
   * back -- see `resume()` for how a later retry picks up where it stopped).
   *
   * `mode` (Phase 12, Task 12.4): implements spec Section 8.1's own
   * documented "Self-hosted equivalent" note -- "the installer runs a
   * reduced version of the same pipeline (skip subdomain generation, skip
   * Connector-pairing-key generation since the Connector runs embedded,
   * use FileLicenseProvider instead of step 8's subscription call) -- same
   * service, same steps where applicable." `mode: 'self_hosted'` makes
   * Steps 2/7/8 record themselves as an explicit, tracked skip
   * (`skipped: true` in `resultData`, never silently omitted from the step
   * ledger) rather than executing their cloud-specific logic. Called by
   * `scripts/provision-self-hosted.ts` (the installer's one-shot CLI
   * entrypoint), never by the HTTP admin API -- `TenantProvisioningController`
   * always provisions in `'cloud'` mode (its own default), so this phase's
   * addition is purely additive and does not change the API's existing
   * behavior at all.
   *
   * KNOWN LIMITATION, documented rather than silently assumed away: `mode`
   * is not persisted on the `TenantProvisioningRun` row, so `resume()`
   * (below) always resumes in `'cloud'` mode regardless of which mode the
   * original `provision()` call used. This is fine for the self-hosted
   * installer's actual use (a single one-shot call, idempotent via the
   * "does a non-system tenant already exist" check in
   * `scripts/provision-self-hosted.ts`), but means a self-hosted run that
   * fails partway through cannot currently be resumed via `resume()` in
   * the same reduced mode -- re-running the installer script is the
   * supported recovery path today, not a stored resume() call. Persisting
   * `mode` on the run row is a small, natural follow-up if that gap
   * matters in practice.
   */
  async provision(dto: ProvisionTenantDto, mode: 'cloud' | 'self_hosted' = 'cloud'): Promise<TenantProvisioningRun> {
    // ZoeConnect Identity Architecture Migration, Phase 6: subdomains are no
    // longer part of the platform's identity architecture. If a caller
    // still supplies one (backward compatibility -- some integrations may
    // not have updated yet), it is recorded on the Tenant row for history
    // (see stepCreateTenantRow()) but is no longer an enforcement gate here.
    // The real gate is now global username/email uniqueness, enforced by
    // stepCreateSuperAdminUser() -> AuthService.setupSuperAdmin() ->
    // assertGlobalIdentityAvailable() (Phase 4.1), which already throws a
    // clear ConflictException before any write if either is taken.

    const run = await this.runRepo.save(this.runRepo.create({
      requestedHospitalName: dto.hospitalName,
      requestedSubdomain: dto.subdomain ?? null,
      requestedAdminUsername: dto.adminUsername,
      requestedAdminEmail: dto.adminEmail,
      requestedAdminFullName: dto.adminFullName ?? null,
      status: 'in_progress',
      currentStepNumber: 1,
      triggeredBy: dto.triggeredBy ?? null,
    }));

    await this.stepRepo.save(
      STEP_NAMES.map((stepName, idx) => this.stepRepo.create({
        runId: run.id,
        stepNumber: idx + 1,
        stepName,
        status: 'pending',
      })),
    );

    return this.execute(run, dto, mode);
  }

  /**
   * Re-reads a run's steps, skips everything already `succeeded`, and
   * restarts from the first `pending`/`failed` step. This is what makes
   * provisioning resumable after a transient failure (spec Section 8.1
   * question "can onboarding resume after failure?" -- yes, answered here).
   * The original request fields are NOT re-supplied by the caller by
   * default; they're read back off the `TenantProvisioningRun` row itself,
   * since a resume request may come from an admin retry action days later.
   *
   * `overrides` exists because the single most common real failure mode at
   * step 9 (`create_super_admin_user`) is a username/email conflict --
   * simply re-supplying a password and retrying the exact same username
   * fails again with the same conflict. `hospitalName`/`subdomain` are
   * deliberately NOT overridable here: subdomain is already committed by
   * step 2 (`reserve_subdomain`, a real `Tenant` row), so changing it isn't
   * a "resume", it's a different tenant -- that needs a fresh provision()
   * call against a different subdomain instead.
   */
  async resume(
    runId: string,
    overrides?: { adminUsername?: string; adminEmail?: string; adminFullName?: string; adminPassword?: string },
  ): Promise<TenantProvisioningRun> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`provisioning run '${runId}' not found`);
    }
    if (run.status === 'completed') {
      return run;
    }

    if (overrides?.adminUsername) run.requestedAdminUsername = overrides.adminUsername;
    if (overrides?.adminEmail) run.requestedAdminEmail = overrides.adminEmail;
    if (overrides?.adminFullName) run.requestedAdminFullName = overrides.adminFullName;

    const dto: ProvisionTenantDto = {
      hospitalName: run.requestedHospitalName,
      subdomain: run.requestedSubdomain ?? undefined,
      adminUsername: run.requestedAdminUsername,
      adminEmail: run.requestedAdminEmail,
      // Only needed by create_super_admin_user. Not persisted anywhere on
      // the run row (security), so a resume that needs to retry that step
      // must supply a fresh password via this optional param -- see that
      // step's own doc comment for why resuming without one throws instead
      // of silently creating an unusable account.
      adminPassword: overrides?.adminPassword ?? '',
      adminFullName: run.requestedAdminFullName ?? undefined,
      triggeredBy: run.triggeredBy ?? undefined,
    };

    // If create_super_admin_user previously FAILED (e.g. a username/email
    // conflict), it naturally re-runs below -- its status isn't 'succeeded',
    // so execute()'s skip-if-succeeded logic never applies to it in the
    // first place.
    //
    // BUGFIX (2026-07-30): if create_super_admin_user previously SUCCEEDED
    // (a LATER step is what failed) and this resume() call supplies a fresh
    // `adminPassword`, execute()'s `forceRedispatchAdminStep` deliberately
    // re-dispatches this step anyway -- see stepCreateSuperAdminUser()'s own
    // doc comment for why: without this, a resumed run could report success
    // while silently leaving the ORIGINAL admin account's ORIGINAL password
    // in place, which is exactly what happened in the real incident this
    // fix addresses. No extra step-reset is needed here in either case --
    // `execute()`'s own condition handles both.

    run.status = 'in_progress';
    run.error = null;
    await this.runRepo.save(run);

    return this.execute(run, dto);
  }

  private async execute(run: TenantProvisioningRun, dto: ProvisionTenantDto, mode: 'cloud' | 'self_hosted' = 'cloud'): Promise<TenantProvisioningRun> {
    const steps = await this.stepRepo.find({ where: { runId: run.id }, order: { stepNumber: 'ASC' } });

    for (const step of steps) {
      // BUGFIX (2026-07-30, real incident): every other step is safely
      // skippable once 'succeeded' -- but `create_super_admin_user` is a
      // deliberate exception. Vendor Portal's "shown once" temp-password
      // dialog depends on an invariant: whatever password it displays MUST
      // already be the account's real, current password. Silently skipping
      // an already-succeeded create_super_admin_user step (as this loop
      // used to, unconditionally) let a RESUMED run report success while
      // leaving the ORIGINAL admin account's ORIGINAL password untouched --
      // the freshly generated password shown to the operator never worked.
      // See stepCreateSuperAdminUser()'s own doc comment for the idempotent
      // refresh-in-place logic this re-dispatch triggers. Only forced when
      // the caller actually supplies a fresh `adminPassword` -- a resume()
      // call that omits it (not touching admin credentials at all, e.g. an
      // operator only retrying a later failed step) still skips this step
      // exactly as before.
      const forceRedispatchAdminStep = step.stepName === 'create_super_admin_user' && !!dto.adminPassword;
      if (step.status === 'succeeded' && !forceRedispatchAdminStep) {
        continue;
      }

      // BUGFIX (2026-07-30): captured BEFORE `step.status`/`step.resultData`
      // are overwritten below -- `stepCreateSuperAdminUser()` needs to know
      // whether THIS specific step row was already 'succeeded' (and, if so,
      // what it created) to decide whether to refresh an existing admin
      // account instead of creating a new one. Querying the DB for a
      // 'succeeded' row with this (runId, stepName) from inside the step
      // method itself would find nothing -- by that point this very row has
      // already been flipped to 'in_progress' a few lines below (there is
      // exactly one step row per (runId, stepName), reused across every
      // resume(), never re-created).
      const priorResultDataForRedispatch = forceRedispatchAdminStep && step.status === 'succeeded'
        ? step.resultData
        : null;

      step.status = 'in_progress';
      step.startedAt = new Date();
      step.attempts += 1;
      await this.stepRepo.save(step);

      try {
        // step.stepName is persisted as a plain `string` column
        // (TenantProvisioningStep entity) since TypeORM columns can't carry
        // a literal-union type -- narrowed here rather than widening
        // dispatchStep's own signature, since dispatchStep's whole point is
        // exhaustive checking against the fixed STEP_NAMES set.
        const resultData = await this.dispatchStep(
          step.stepName as (typeof STEP_NAMES)[number],
          run,
          dto,
          mode,
          priorResultDataForRedispatch,
        );
        step.status = 'succeeded';
        step.completedAt = new Date();
        step.resultData = resultData ?? null;
        step.lastError = null;
        await this.stepRepo.save(step);

        run.currentStepNumber = step.stepNumber + 1;
        await this.runRepo.save(run);
      } catch (err) {
        step.status = 'failed';
        step.lastError = err instanceof Error ? err.message : String(err);
        await this.stepRepo.save(step);

        run.status = 'failed';
        run.error = `Step ${step.stepNumber} (${step.stepName}) failed: ${step.lastError}`;
        await this.runRepo.save(run);

        this.logger.error(`Provisioning run ${run.id} failed at step ${step.stepNumber} (${step.stepName}): ${step.lastError}`);
        return run;
      }
    }

    run.status = 'completed';
    run.completedAt = new Date();
    await this.runRepo.save(run);
    return run;
  }

  private async dispatchStep(
    stepName: (typeof STEP_NAMES)[number],
    run: TenantProvisioningRun,
    dto: ProvisionTenantDto,
    mode: 'cloud' | 'self_hosted' = 'cloud',
    /**
     * BUGFIX (2026-07-30): only ever non-null for a forced re-dispatch of
     * `create_super_admin_user` (see execute()'s `priorResultDataForRedispatch`
     * capture) -- the resultData THIS SAME step row had recorded from an
     * earlier execute() call, before this dispatch's own status/resultData
     * overwrite happened. Every other step ignores this parameter entirely.
     */
    priorResultData?: Record<string, unknown> | null,
  ): Promise<Record<string, unknown> | null> {
    switch (stepName) {
      case 'create_tenant_row':
        return this.stepCreateTenantRow(run, dto, mode);
      case 'reserve_subdomain':
        return this.stepReserveSubdomain(run, dto, mode);
      case 'ensure_global_roles':
        return this.stepEnsureGlobalRoles();
      case 'ensure_global_permissions':
        return this.stepEnsureGlobalPermissions();
      case 'ensure_global_settings':
        return this.stepEnsureGlobalSettings();
      case 'allocate_storage_namespace':
        return this.stepAllocateStorageNamespace(run);
      case 'generate_connector_pairing_key':
        return this.stepGenerateConnectorPairingKey(run, mode);
      case 'issue_trial_license':
        return this.stepIssueTrialLicense(run, dto, mode);
      case 'create_super_admin_user':
        return this.stepCreateSuperAdminUser(run, dto, priorResultData);
      case 'create_default_org_branch':
        return this.stepCreateDefaultOrgBranch(run, dto);
      case 'emit_tenant_provisioned_event':
        return this.stepEmitTenantProvisionedEvent(run, dto);
      default:
        throw new BadRequestException(`unknown provisioning step '${stepName}'`);
    }
  }

  // --- Step 1: create the Tenant row itself. ------------------------------
  private async stepCreateTenantRow(run: TenantProvisioningRun, dto: ProvisionTenantDto, mode: 'cloud' | 'self_hosted'): Promise<Record<string, unknown>> {
    if (run.tenantId) {
      // Already created by an earlier attempt (resume case) -- nothing to do.
      return { tenantId: run.tenantId, reused: true };
    }

    // Subdomain Release Lifecycle: `code` carries its own unconditional,
    // permanent UNIQUE constraint (correctly so -- it's meant to stay a
    // stable identifier for THIS tenant row forever, unlike `subdomain`,
    // which can now be released and reused by a different tenant). That
    // means a released-and-reused subdomain will re-slugify to a `code`
    // that's already taken by the old, still-present (never deleted)
    // deprovisioned row -- previously a hard ConflictException here, which
    // would have defeated the entire point of releasing a subdomain.
    // Disambiguate instead of blocking: try the bare slug first (the
    // overwhelmingly common case -- brand-new subdomain, no collision),
    // then '-2', '-3', ... until a free one is found. Bounded at 1000
    // purely as a sanity backstop against an infinite loop; a real
    // deployment will never come close to that many reuses of one subdomain.
    //
    // ZoeConnect Identity Architecture Migration, Phase 6: subdomain is no
    // longer the seed for `code` -- most provisioning requests won't supply
    // one anymore. Fall back to `hospitalName` (always present) when
    // `subdomain` is absent; `slugifyCode()` now does real slugification
    // (lowercasing, non-alphanumeric collapse) so an arbitrary hospital name
    // like "Apollo Multi-Specialty Hospital" still produces a safe,
    // DNS-label-shaped code.
    const baseCode = this.slugifyCode(dto.subdomain || dto.hospitalName);
    let code = baseCode;
    for (let suffix = 2; await this.tenantRepo.findOne({ where: { code } }); suffix++) {
      if (suffix > 1000) {
        throw new ConflictException(`could not derive a free tenant code from '${dto.subdomain || dto.hospitalName}' after 1000 attempts`);
      }
      code = `${baseCode}-${suffix}`.slice(0, 50);
    }

    // Self-hosted has exactly one tenant and no subdomain-based routing
    // (SubdomainTenantMiddleware, Phase 8, is a cloud-mode concern) -- leave
    // `subdomain` null rather than persisting the installer's placeholder
    // value as if it were a real, routable subdomain.
    //
    // ZoeConnect Identity Architecture Migration, Phase 6: `subdomain` is no
    // longer treated as this tenant's identity or used for auth/login-URL
    // generation anywhere downstream -- it is preserved on the row purely
    // for historical/backward-compatibility purposes when a caller still
    // supplies one. `dto.subdomain` is optional now, so this is `null` for
    // the common case going forward.
    const tenant = await this.tenantRepo.save(this.tenantRepo.create({
      code,
      name: dto.hospitalName,
      subdomain: mode === 'self_hosted' ? null : (dto.subdomain ?? null),
      status: 'active',
      isSystem: false,
    }));

    run.tenantId = tenant.id;
    await this.runRepo.save(run);

    return { tenantId: tenant.id, code: tenant.code };
  }

  // --- Step 2: subdomain reservation. --------------------------------------
  // The DB-level UNIQUE constraint added in this phase's migration
  // (1783840000000-CreateTenantProvisioning.ts) is the actual enforcement
  // mechanism -- Step 1 already failed with a ConflictException if the
  // subdomain were taken. This step is a deliberate, cheap confirmation
  // pass (re-reads the row Step 1 just wrote) rather than a no-op, so the
  // step ledger has an explicit, auditable record that reservation was
  // verified, not merely assumed.
  //
  // Phase 12, Task 12.4: self-hosted skips subdomain generation entirely
  // per spec Section 8.1's own "Self-hosted equivalent" note -- tracked as
  // an explicit skip in the step ledger, not a silent omission.
  private async stepReserveSubdomain(run: TenantProvisioningRun, dto: ProvisionTenantDto, mode: 'cloud' | 'self_hosted'): Promise<Record<string, unknown>> {
    if (mode === 'self_hosted') {
      return { skipped: true, note: 'self-hosted install has no subdomain-based tenant routing (Phase 8 SubdomainTenantMiddleware is a cloud-mode concern)' };
    }
    // ZoeConnect Identity Architecture Migration, Phase 6: subdomain is now
    // optional and no longer part of the platform's identity/routing model
    // -- when the caller didn't supply one, there is nothing to verify here.
    // Tracked as an explicit skip in the step ledger, same convention as the
    // self-hosted branch above, rather than silently no-op'd.
    if (!dto.subdomain) {
      return { skipped: true, note: 'no subdomain supplied -- subdomains are no longer required or used for organization identity/login (Phase 6)' };
    }
    const tenant = await this.tenantRepo.findOne({ where: { id: run.tenantId! } });
    if (!tenant || tenant.subdomain !== dto.subdomain) {
      throw new BadRequestException('subdomain reservation could not be verified against the created tenant row');
    }
    return { subdomain: tenant.subdomain, verified: true };
  }

  // --- Steps 3 & 4: Roles / Permissions. -----------------------------------
  // DOCUMENTED REINTERPRETATION (not silently glossed over): the spec's
  // literal text ("seed default Roles/Permissions scoped to tenant_id")
  // assumes genuine per-tenant rows are possible. They are not --
  // `Role.name` and `Permission.(moduleCode,resource,action)` both carry a
  // GLOBAL unique constraint in this schema (see
  // PHASE_10_ARCHITECTURE_REVIEW.md, Question 7, and seed-platform.ts's own
  // `ON CONFLICT ("name") DO NOTHING` pattern, which only makes sense if
  // roles are shared, not per-tenant). Creating a second 'SUPER_ADMIN' row
  // for a new tenant would violate that constraint outright.
  //
  // So these two steps do NOT create new rows. They verify the platform's
  // global role/permission catalog (seeded once, at platform-install time,
  // by seed-platform.ts) is present and complete, and fail loudly if it
  // is not -- a newly provisioned tenant needs those global rows to exist
  // before Step 9 can assign SUPER_ADMIN to its admin user. This is an
  // idempotent verification step, not a per-tenant seeding step.
  private async stepEnsureGlobalRoles(): Promise<Record<string, unknown>> {
    const existing = await this.roleRepo.find({ where: {} });
    const existingNames = new Set(existing.map((r) => r.name));
    const missing = REQUIRED_GLOBAL_ROLES.filter((name) => !existingNames.has(name));
    if (missing.length > 0) {
      throw new BadRequestException(
        `platform is missing required global role(s): ${missing.join(', ')} -- run seed-platform before provisioning tenants`,
      );
    }
    return { verifiedRoles: REQUIRED_GLOBAL_ROLES, note: 'global catalog verified, no per-tenant rows created (Role.name has a global unique constraint)' };
  }

  private async stepEnsureGlobalPermissions(): Promise<Record<string, unknown>> {
    const count = await this.permissionRepo.count();
    if (count === 0) {
      throw new BadRequestException('platform has zero global permissions seeded -- run seed-platform before provisioning tenants');
    }
    return { permissionCount: count, note: 'global catalog verified, no per-tenant rows created (Permission has a global unique constraint on moduleCode+resource+action)' };
  }

  // --- Step 5: Settings. ----------------------------------------------------
  // DOCUMENTED REINTERPRETATION, same root cause as Steps 3/4:
  // SystemSetting, CMSSettings, and FeedbackSettings are all de-facto
  // global singleton tables in this codebase today (unique on setting_key
  // alone; CMS/Feedback settings have doc comments literally stating
  // "single-row table"). No service anywhere has a genuine per-tenant
  // "create a new settings row" path, and building one is a business-module
  // change explicitly out of scope for this phase (per the user's Option 3
  // decision: "no business-module changes"). Building real per-tenant
  // settings rows would mean altering SettingsService/CmsSettingsService/
  // FeedbackSettingsService's read paths too, which is exactly the kind of
  // expansion Option 3 deferred.
  //
  // This step is therefore an explicit no-op, not a silent skip: it is
  // still tracked in the step ledger (status will read 'succeeded' with a
  // `deferred: true` resultData flag) so the provisioning run's audit trail
  // honestly reflects that tenant-scoped settings do not exist yet, rather
  // than implying they were created. Tracked in PHASE_10_DEFERRED_BACKLOG.md
  // under a future "per-tenant settings" item.
  private async stepEnsureGlobalSettings(): Promise<Record<string, unknown>> {
    return {
      deferred: true,
      note: 'SystemSetting/CMSSettings/FeedbackSettings are global singleton tables today; no per-tenant settings row is created by this step. See PHASE_10_DEFERRED_BACKLOG.md.',
    };
  }

  // --- Step 6: storage namespace. --------------------------------------------
  // Confirmed near-no-op: S3StorageProvider._key() already prefixes every
  // object key with `<tenantId>/...` whenever a tenantId is supplied
  // (Phase 3 Task 3.3), keyed off the Tenant.id that Step 1 just created.
  // There is no separate "namespace" resource to allocate -- it falls out
  // automatically from the tenant existing. This step just records that
  // fact in the run's audit trail.
  private async stepAllocateStorageNamespace(run: TenantProvisioningRun): Promise<Record<string, unknown>> {
    return {
      storagePrefix: `${run.tenantId}/`,
      note: 'no separate allocation needed -- S3StorageProvider prefixes by tenantId automatically (Phase 3, Task 3.3)',
    };
  }

  // --- Step 7: Connector pairing key. ----------------------------------------
  // Phase 12, Task 12.4: self-hosted skips this per spec Section 8.1's own
  // note -- "skip Connector-pairing-key generation since the Connector runs
  // embedded." A self-hosted install that does use the connector-relay
  // Oracle variant (docker-compose.selfhosted.yml's commented-out
  // `connector` service) reaches Redis over a private, host-local network
  // with no cross-tenant ambiguity to authenticate against -- there is
  // nothing this credential would gate that isn't already implied by
  // "you're running on this hospital's own server."
  private async stepGenerateConnectorPairingKey(run: TenantProvisioningRun, mode: 'cloud' | 'self_hosted'): Promise<Record<string, unknown>> {
    if (mode === 'self_hosted') {
      return { skipped: true, note: 'Connector runs embedded/local for self-hosted installs -- no pairing credential needed' };
    }
    // D.6: human-typeable Activation Code (e.g. "ABCD-EFGH-JKLM"), not the
    // original 43-character opaque base64url token -- see
    // connector-activation-code.util.ts's doc comment for the full
    // rationale. The stored hash is of the code AS GENERATED, which is
    // already in normalized form (uppercase, no stray characters).
    const rawCode = generateActivationCode();
    const pairingKeyHash = await bcrypt.hash(rawCode, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + ACTIVATION_CODE_TTL_MS);

    const pairing = await this.pairingRepo.save(this.pairingRepo.create({
      tenantId: run.tenantId!,
      pairingKeyHash,
      status: 'pending',
      expiresAt,
    }));

    // The raw code is returned ONLY in this step's resultData, which the
    // admin controller (Task 10.7) surfaces once in its response -- it is
    // never persisted in plaintext anywhere, including here on retry: a
    // resumed run that re-executes this step (only possible if it never
    // reached 'succeeded') generates a fresh code rather than recovering
    // the old one, since the old one was never stored.
    return {
      pairingId: pairing.id, activationCode: rawCode, status: pairing.status, expiresAt: expiresAt.toISOString(),
      // Back-compat alias: anything still reading `pairingKey` from a
      // provisioning-run result blob (e.g. an older admin UI build)
      // keeps working -- same raw value, just under both names.
      pairingKey: rawCode,
    };
  }

  /**
   * D.6 ("Onboarding UX," 2026-07-22) -- on-demand regeneration, closing
   * the gap `PHASE_10_DEFERRED_BACKLOG.md` §5 flagged ("no rotation path
   * beyond generating a brand-new value manually"). Revokes every
   * currently-`pending` row for the tenant first (a stale, unactivated
   * code from provisioning-time -- or a previous regenerate call -- must
   * stop working the instant a fresh one is issued, so a hospital IT
   * person can never accidentally activate with an old code someone else
   * also has a copy of), then creates and returns a brand-new one, same
   * shape as the provisioning step's own result. Does NOT touch `active`
   * rows -- an already-activated Connector is unaffected by regenerating
   * a new activation code for that tenant (a new code only matters for
   * pairing a NEXT/additional Connector instance, or replacing an
   * unactivated one).
   */
  async regenerateConnectorActivationCode(tenantId: string): Promise<{
    pairingId: string; activationCode: string; status: string; expiresAt: string;
  }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);

    const stalePending = await this.pairingRepo.find({ where: { tenantId, status: 'pending' } });
    for (const stale of stalePending) {
      stale.status = 'revoked';
      stale.revokedAt = new Date();
    }
    if (stalePending.length) await this.pairingRepo.save(stalePending);

    const rawCode = generateActivationCode();
    const pairingKeyHash = await bcrypt.hash(rawCode, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + ACTIVATION_CODE_TTL_MS);

    const pairing = await this.pairingRepo.save(this.pairingRepo.create({
      tenantId, pairingKeyHash, status: 'pending', expiresAt,
    }));

    this.logger.log(`Connector activation code regenerated: tenant=${tenantId} pairingId=${pairing.id} (${stalePending.length} prior pending code(s) revoked)`);

    return { pairingId: pairing.id, activationCode: rawCode, status: pairing.status, expiresAt: expiresAt.toISOString() };
  }

  // --- Step 8: initial trial license. -----------------------------------------
  // Phase 12, Task 12.4: self-hosted skips this per spec Section 8.1's own
  // note -- "use FileLicenseProvider instead of step 8's subscription
  // call." `SubscriptionLicense` (this step's entity) is specifically the
  // cloud/`LICENSE_PROVIDER_MODE=subscription` entity; self-hosted's
  // default `LICENSE_PROVIDER_MODE=file` is served by `LicenseService`,
  // which already auto-activates a 30-day trial license on `onModuleInit()`
  // the first time the backend boots with zero existing `license_master`
  // rows (see `license.service.ts`'s `activateTrial()`) -- creating a
  // `SubscriptionLicense` row here too would be redundant, not
  // complementary, since nothing in self-hosted mode ever reads that table.
  private async stepIssueTrialLicense(run: TenantProvisioningRun, dto: ProvisionTenantDto, mode: 'cloud' | 'self_hosted'): Promise<Record<string, unknown>> {
    if (mode === 'self_hosted') {
      return { skipped: true, note: 'self-hosted uses FileLicenseProvider / LicenseService.activateTrial() (auto-run on boot), not the SubscriptionLicense table' };
    }

    // Cloud Licensing API (architecture review, 2026-07-29): a brand-new
    // cloud tenant starts with 'PLATFORM' actually licensed (matches the
    // product owner's own example -- an empty licensedModules array meant
    // a freshly-provisioned cloud tenant could log in but had literally no
    // module access until Vendor Portal's first entitlement push) and a
    // real 30-day currentPeriodEnd (previously left null, which made
    // daysRemaining/isExpiringSoon permanently null/false and gave
    // SubscriptionLicenseProvider nothing to compute a trial window from).
    const trialDays = this.config.get<number>('LICENSE_TRIAL_DAYS', 30);
    const currentPeriodEnd = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    // Phase 6: subdomain is optional now -- fall back to hospitalName, same
    // as stepCreateTenantRow()'s code derivation above.
    const hospitalCode = this.slugifyCode(dto.subdomain || dto.hospitalName);

    const license = await this.licenseRepo.save(this.licenseRepo.create({
      tenantId: run.tenantId!,
      hospitalName: dto.hospitalName,
      hospitalCode,
      subscriptionStatus: 'trialing',
      licensedModules: ['PLATFORM'],
      maxUsers: 5,
      currentPeriodEnd,
    }));

    // Cloud Licensing API: eagerly create this tenant's VendorRegistration
    // row at provisioning time (rather than deferring to
    // VendorSyncService.autoRegisterCloudTenant() on first login) so its
    // instanceToken/instanceSecret exist and can be handed back to Vendor
    // Portal in this same provisioning response -- Vendor Portal needs that
    // secret up front to authenticate its future PUT .../subscription calls
    // (HMAC over VendorRegistration.instanceSecret, see
    // CloudLicensingHmacGuard). Idempotent: a resumed run that already has
    // a registration row for this tenant reuses it instead of creating a
    // second one (the DB's per-tenant partial unique index would reject a
    // duplicate anyway).
    let registration = await this.vendorRegRepo.findOne({ where: { tenantId: run.tenantId! } });
    if (!registration) {
      registration = this.vendorRegRepo.create({
        instanceToken: crypto.randomBytes(32).toString('hex'),
        instanceSecret: crypto.randomBytes(32).toString('hex'),
        vendorApiUrl: 'internal://vendor-portal',
        hospitalName: dto.hospitalName,
        hospitalCode,
        publicIp: '0.0.0.0',
        publicPort: 0,
        machineFingerprint: '',
        status: 'ACTIVE',
        tenantId: run.tenantId!,
      });
      try {
        registration = await this.vendorRegRepo.save(registration);
      } catch (err: any) {
        if (err?.code === '23505') {
          registration = await this.vendorRegRepo.findOne({ where: { tenantId: run.tenantId! } });
        } else {
          throw err;
        }
      }
    }

    return {
      licenseId: license.id,
      subscriptionStatus: license.subscriptionStatus,
      currentPeriodEnd: license.currentPeriodEnd?.toISOString() ?? null,
      instanceToken: registration?.instanceToken ?? null,
      instanceSecret: registration?.instanceSecret ?? null,
    };
  }

  // --- Step 9: SUPER_ADMIN user. ------------------------------------------------
  private async stepCreateSuperAdminUser(
    run: TenantProvisioningRun,
    dto: ProvisionTenantDto,
    priorResultData?: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    if (!dto.adminPassword) {
      // Reachable via resume() when the caller didn't supply a fresh
      // password -- the original one is never persisted anywhere on the run
      // row (security), so a resume that needs to (re)run this step must
      // pass `adminPassword` explicitly (resume()'s optional second param /
      // the resume endpoint's request body).
      throw new BadRequestException(
        'cannot create the SUPER_ADMIN user on a resumed run without a password; pass adminPassword to resume()',
      );
    }

    // CRITICAL FIX (production incident, 2026-08) -- defense-in-depth
    // duplicate of the same check in checkAvailability(): this is the
    // ACTUAL write path, reachable even when the pre-flight check was
    // skipped or never called (e.g. CloudTenantsService.provision()'s
    // `resume()` path deliberately skips its own pre-flight check for a
    // run's own already-committed identity -- see RESERVED_SYSTEM_
    // USERNAMES's doc comment for the full incident this closes). Without
    // this, that specific path would still surface the confusing generic
    // `assertGlobalIdentityAvailable()` conflict below instead of a clear,
    // specific explanation.
    if (isReservedSystemUsername(dto.adminUsername)) {
      throw new ConflictException(
        `Username "${dto.adminUsername}" is reserved for platform system accounts and cannot be used for a tenant administrator. Please choose a different username.`,
      );
    }

    // BUGFIX (2026-07-30, real incident): this step can now be re-dispatched
    // even though it already succeeded on an earlier attempt -- see
    // execute()'s `forceRedispatchAdminStep` condition. That exists to
    // enforce an invariant Vendor Portal's "shown once" temp-password
    // dialog depends on: the password it displays must already be the
    // account's real, current password. Simply re-running
    // AuthService.setupSuperAdmin() here would throw ("Super admin already
    // exists") the moment isSetupRequired() sees the account this same run
    // already created -- so detect that case first and REFRESH the
    // existing account in place instead of trying to create a second one.
    //
    // `priorResultData` is passed in from execute() (via dispatchStep) --
    // NOT re-queried from the DB here, because by the time this method runs,
    // execute() has already flipped this exact (runId, stepName) row's
    // status to 'in_progress' and persisted it (there is exactly one step
    // row per (runId, stepName), reused across every resume()). A DB query
    // for a 'succeeded' row here would always find nothing.
    const priorUserId = priorResultData?.userId as string | undefined;

    if (priorUserId) {
      const existingAdmin = await this.userRepo.findOne({ where: { id: priorUserId } });
      if (existingAdmin) {
        // Global identity check excluding this same row -- re-supplying the
        // SAME username/email on a routine retry must not spuriously
        // conflict with the account being refreshed.
        await assertGlobalIdentityAvailable(this.userRepo, {
          username: dto.adminUsername,
          email: dto.adminEmail,
          excludeUserId: existingAdmin.id,
        });

        existingAdmin.username = dto.adminUsername;
        existingAdmin.email = dto.adminEmail;
        if (dto.adminFullName) existingAdmin.fullName = dto.adminFullName;
        existingAdmin.passwordHash = await bcrypt.hash(dto.adminPassword, BCRYPT_ROUNDS);
        // Treat a freshly (re)issued temporary password like any other
        // administrator-issued temp password (same posture as
        // PasswordResetService's approval flow) -- force a change on first
        // use rather than silently leaving the temp password permanent.
        existingAdmin.mustChangePassword = true;
        const saved = await this.userRepo.save(existingAdmin);

        this.logger.warn(
          `Provisioning run ${run.id}: create_super_admin_user re-dispatched on an already-succeeded step -- ` +
          `refreshed existing admin (userId=${saved.id}) with the newly supplied username/email/password instead ` +
          `of creating a duplicate account.`,
        );

        return {
          userId: saved.id, username: saved.username, email: saved.email, role: 'SUPER_ADMIN', refreshed: true,
        };
      }
      // Falls through to the normal create path below if the previously
      // recorded user id no longer resolves to a real row (e.g. manually
      // deleted) -- better to create a fresh account than return stale,
      // dangling data referencing a user that no longer exists.
    }

    const admin = await this.authService.setupSuperAdmin(
      {
        username: dto.adminUsername,
        email: dto.adminEmail,
        fullName: dto.adminFullName,
        password: dto.adminPassword,
      },
      run.tenantId,
    );

    return { userId: admin.id, username: admin.username, email: admin.email, role: admin.role };
  }

  // --- Step 10: default Organization Branch. --------------------------------
  // ZoeConnect Identity Architecture Migration, Phase 1 -- creates the single
  // default `organization_branches` row every tenant is expected to have
  // from the moment it exists (used only when Oracle HIS is not connected
  // for this tenant -- see organization-branch.entity.ts's doc comment; this
  // is completely independent of the HIS Branch flow / DEFAULT_BRANCH_ID).
  //
  // Idempotent via OrganizationBranchService.ensureDefaultForTenant(), same
  // "does a default already exist -- if so, reuse it" resume-safety pattern
  // as stepIssueTrialLicense()'s VendorRegistration reuse above: a resumed
  // run that already created this row (e.g. it succeeded before a LATER
  // step failed) does not create a duplicate.
  //
  // `run.tenantId` is guaranteed set by this point -- Step 1
  // (stepCreateTenantRow) always runs before this step and either creates
  // the Tenant row or short-circuits as already-created on resume; there is
  // no code path where execute() reaches Step 10 with `run.tenantId` unset.
  private async stepCreateDefaultOrgBranch(run: TenantProvisioningRun, dto: ProvisionTenantDto): Promise<Record<string, unknown>> {
    const branch = await this.orgBranchService.ensureDefaultForTenant(run.tenantId!, dto.hospitalName);
    return { organizationBranchId: branch.id, code: branch.code, isDefault: branch.isDefault };
  }

  // --- Step 11: TenantProvisioned event. -------------------------------------
  private async stepEmitTenantProvisionedEvent(run: TenantProvisioningRun, dto: ProvisionTenantDto): Promise<Record<string, unknown>> {
    const tenant = await this.tenantRepo.findOne({ where: { id: run.tenantId! } });
    const adminStep = await this.stepRepo.findOne({ where: { runId: run.id, stepName: 'create_super_admin_user' } });
    const adminUserId = (adminStep?.resultData?.userId as string) ?? '';

    this.eventEmitter.emit(
      TENANT_PROVISIONED_EVENT,
      new TenantProvisionedEvent(
        run.tenantId!,
        tenant?.code ?? '',
        dto.hospitalName,
        dto.subdomain ?? null,
        adminUserId,
        dto.adminEmail,
        run.id,
      ),
    );

    return { emitted: true };
  }

  /**
   * ZoeConnect Identity Architecture Migration, Phase 6: previously assumed
   * its input was always already a DNS-label-safe subdomain (naive
   * `.toLowerCase().slice(0, 50)`). Now also fed `hospitalName` (e.g.
   * "Apollo Multi-Specialty Hospital, Chennai") when no subdomain is
   * supplied, so this needs to actually slugify: lowercase, collapse any
   * run of non-alphanumeric characters to a single hyphen, trim leading/
   * trailing hyphens, cap at 50 chars. Falls back to a short random suffix
   * if the input slugifies to nothing (e.g. a hospital name made entirely
   * of punctuation/non-Latin characters) so `code` is never an empty string.
   */
  private slugifyCode(seed: string): string {
    const slug = seed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    return slug || `org-${crypto.randomBytes(4).toString('hex')}`;
  }

  async getRun(runId: string): Promise<TenantProvisioningRun> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException(`provisioning run '${runId}' not found`);
    }
    return run;
  }

  async getRunSteps(runId: string): Promise<TenantProvisioningStep[]> {
    return this.stepRepo.find({ where: { runId }, order: { stepNumber: 'ASC' } });
  }

  /**
   * Cloud Tenant Onboarding (see CLOUD_TENANT_ONBOARDING_DESIGN.md,
   * Section 6) -- a minimal, caller-friendly summary built from the same
   * `run` row `provision()`/`resume()` already return, so Vendor Portal
   * doesn't have to parse the full step-audit-trail array to find the
   * three or four fields it actually needs. Purely a read/derive; does not
   * change `provision()`'s own persisted behavior at all.
   *
   * Deliberately does NOT include `adminPassword` or any other secret --
   * per explicit review requirement, no password value ever crosses the
   * wire from ZoeConnect back to a caller. The caller (Vendor Portal, per the
   * approved design) already generated and supplied that password in the
   * request; ZoeConnect has no reason to ever echo it.
   */
  async buildProvisioningSummary(run: TenantProvisioningRun): Promise<{
    tenantId: string | null;
    subdomain: string | null;
    adminUsername: string;
    loginUrl: string | null;
    status: ProvisioningRunStatus;
    instanceSecret: string | null;
    instanceToken: string | null;
  }> {
    const deploymentMode = this.config.get<string>('deployment.mode', 'self_hosted');

    // ZoeConnect Identity Architecture Migration, Phase 6: login URLs are no
    // longer derived from a tenant's subdomain -- every cloud-provisioned
    // organization is handed the same shared login URL
    // (`app.publicLoginUrl`, default https://zoeconnect.in/login). Self-
    // hosted installs have no public login URL to report here at all (their
    // login is served at whatever address the hospital's own network
    // resolves, entirely outside this platform's knowledge) -- unchanged
    // from before, still `null` for that case.
    const loginUrl = deploymentMode === 'cloud' ? this.config.get<string>('app.publicLoginUrl', 'https://zoeconnect.in/sign-in') : null;

    // Cloud Licensing API (2026-07-29): the instanceSecret
    // stepIssueTrialLicense() generated for this tenant's VendorRegistration
    // row, surfaced here (once, in this same provisioning response) so
    // Vendor Portal can store it and use it to HMAC-authenticate its future
    // PUT .../subscription entitlement pushes -- mirrors how `adminUserId`
    // is pulled from `create_super_admin_user`'s own resultData just above
    // in stepEmitTenantProvisionedEvent(). null for self-hosted (that
    // step no-ops there) or if the step never ran/failed.
    const licenseStep = deploymentMode === 'cloud'
      ? await this.stepRepo.findOne({ where: { runId: run.id, stepName: 'issue_trial_license' } })
      : null;
    const instanceSecret = (licenseStep?.resultData?.instanceSecret as string | undefined) ?? null;
    // Allow Cloud Tenants to Submit License Requests -- same step,
    // same resultData object (stepIssueTrialLicense() already returns
    // both instanceToken and instanceSecret side by side), surfaced here
    // for the same reason instanceSecret is: Vendor Portal needs its own
    // copy of this tenant's instanceToken to later authenticate itself
    // to ZoeConnect (X-Instance-Token header) when forwarding this cloud
    // tenant's own license requests -- see VendorSyncService.submitRequest()
    // and HospitalsService.createRequest()'s CloudTenant-lookup fallback.
    const instanceToken = (licenseStep?.resultData?.instanceToken as string | undefined) ?? null;

    return {
      tenantId: run.tenantId,
      // Historical/backward-compatibility field only as of Phase 6 -- may
      // be null (the common case going forward) and is never used to build
      // `loginUrl` above.
      subdomain: deploymentMode === 'cloud' ? (run.requestedSubdomain ?? null) : null,
      adminUsername: run.requestedAdminUsername,
      loginUrl,
      status: run.status,
      instanceSecret,
      instanceToken,
    };
  }

  async listRuns(): Promise<TenantProvisioningRun[]> {
    return this.runRepo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * De-provisioning rollback path (Phase 10, Task 10.8 -- the roadmap's own
   * "rollback strategy" requirement for a pilot rollout).
   *
   * DELIBERATELY NARROW, not full tenant lifecycle management: this is a
   * safety valve for undoing a pilot tenant that was provisioned in error
   * or needs to be pulled back, not a general suspend/reactivate/rename/
   * delete surface -- that broader capability is explicitly deferred (see
   * PHASE_10_DEFERRED_BACKLOG.md, "Full tenant lifecycle"). Concretely this:
   *   1. Flips the Tenant row to `status: 'inactive'` (SubdomainTenantMiddleware
   *      / TenantContextService, Phase 8, already treat inactive tenants as
   *      unresolvable -- confirm before relying on this: it blocks new
   *      logins/subdomain resolution, it does NOT delete any data).
   *   2. Revokes any `pending`/`active` connector pairing for that tenant.
   *   3. Does NOT delete the Tenant row, its Users, its business data, or
   *      its SubscriptionLicense -- irreversible deletion is out of scope
   *      for a pilot rollback tool and is exactly the kind of destructive
   *      lifecycle operation Option 3 deferred.
   * Reversible by an operator manually setting `status` back to `active`
   * (no dedicated "reactivate" endpoint in this phase, by the same
   * narrow-scope reasoning).
   */
  async deprovision(tenantId: string): Promise<{ tenantId: string; status: string; pairingsRevoked: number }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`tenant '${tenantId}' not found`);
    }
    if (tenant.isSystem) {
      throw new BadRequestException('cannot de-provision a platform-owned system tenant');
    }

    tenant.status = 'inactive';
    await this.tenantRepo.save(tenant);

    const pairings = await this.pairingRepo.find({ where: { tenantId } });
    const toRevoke = pairings.filter((p) => p.status !== 'revoked');
    for (const pairing of toRevoke) {
      pairing.status = 'revoked';
      pairing.revokedAt = new Date();
    }
    if (toRevoke.length > 0) {
      await this.pairingRepo.save(toRevoke);
    }

    this.logger.warn(`Tenant ${tenantId} de-provisioned (pilot rollback) -- status set to inactive, ${toRevoke.length} connector pairing(s) revoked. No data deleted.`);

    return { tenantId, status: tenant.status, pairingsRevoked: toRevoke.length };
  }

  /**
   * Subdomain Release Lifecycle -- the deliberate, separate, explicit
   * action that actually frees up a deprovisioned tenant's subdomain for
   * reuse by a different tenant. See
   * 1785100000000-TenantSubdomainReleaseLifecycle.ts's doc comment for why
   * this is not automatic on deprovision().
   *
   * Requires the tenant to already be deprovisioned (`status: 'inactive'`)
   * -- releasing an active tenant's subdomain out from under it would be a
   * real outage, not a namespace-cleanup action, so that's rejected
   * outright rather than silently allowed. Idempotency: calling this twice
   * on an already-released tenant is rejected with a clear message rather
   * than silently succeeding, since a second call is almost certainly an
   * operator mistake (there's nothing left to do) worth surfacing rather
   * than swallowing.
   *
   * Deliberately irreversible -- no `unreleaseSubdomain()` -- matching the
   * "deprovision is terminal" posture this whole feature is built around:
   * once released, the OLD tenant row keeps every bit of its history
   * (nothing here touches any other column, table, or foreign-key
   * reference), but it permanently gives up its claim on that subdomain
   * string. A NEW tenant provisioned afterward under the same subdomain is
   * a genuinely different `Tenant` row (new UUID) -- see
   * `stepCreateTenantRow()`'s code-collision handling for how that new
   * row's `code` is kept distinct from this one's.
   */
  async releaseSubdomain(tenantId: string): Promise<{ tenantId: string; subdomain: string | null; releasedAt: Date }> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`tenant '${tenantId}' not found`);
    }
    if (tenant.status !== 'inactive') {
      throw new BadRequestException(
        `tenant '${tenantId}' is not deprovisioned (status: '${tenant.status}') -- deprovision it before releasing its subdomain`,
      );
    }
    if (!tenant.subdomain) {
      throw new BadRequestException(`tenant '${tenantId}' has no subdomain to release (self-hosted tenant?)`);
    }
    if (tenant.subdomainReleasedAt) {
      throw new ConflictException(
        `tenant '${tenantId}'s subdomain '${tenant.subdomain}' was already released at ${tenant.subdomainReleasedAt.toISOString()}`,
      );
    }

    tenant.subdomainReleasedAt = new Date();
    await this.tenantRepo.save(tenant);

    this.logger.warn(
      `Tenant ${tenantId}'s subdomain '${tenant.subdomain}' released -- now available for a different tenant to claim. Historical data for this tenant is untouched.`,
    );

    return { tenantId, subdomain: tenant.subdomain, releasedAt: tenant.subdomainReleasedAt };
  }
}
