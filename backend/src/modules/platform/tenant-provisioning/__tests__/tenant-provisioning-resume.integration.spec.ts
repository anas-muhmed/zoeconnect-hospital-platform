import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../../../../app.module';
import { TenantProvisioningService } from '../tenant-provisioning.service';
import { AuthService } from '../../../auth/auth.service';
import { ProvisionTenantDto } from '../dto/provision-tenant.dto';
import { TenantProvisioningStep } from '../entities/tenant-provisioning-step.entity';
import { TenantProvisioningRun } from '../entities/tenant-provisioning-run.entity';

/**
 * ZoeConnect Identity Architecture Migration -- end-to-end workflow tests for
 * the provisioning resume pipeline, added at the user's explicit request
 * before merging this branch, covering the exact regression a real
 * production incident surfaced (2026-07-30): a resumed provisioning run
 * could report success while displaying a temporary password that was
 * never actually written to the admin account.
 *
 * Deliberately an INTEGRATION test (boots the real `AppModule`, talks to a
 * real database), not a mocked unit test -- following this codebase's own
 * `incident-lifecycle.integration.spec.ts` convention. Runs through
 * `npm test` like every other `*.spec.ts` file; requires the same reachable
 * dev/test Postgres instance every other integration spec in this repo
 * already assumes.
 *
 * Every test uses a per-run random suffix for hospitalName/adminUsername/
 * adminEmail so repeated `npm test` runs against a long-lived, non-reset dev
 * database never collide with a previous run's data under Phase 4's global
 * (not per-tenant) username/email uniqueness.
 */
describe('TenantProvisioningService -- resume workflow (Integration)', () => {
  let app: TestingModule;
  let provisioningService: TenantProvisioningService;
  let authService: AuthService;
  let stepRepo: Repository<TenantProvisioningStep>;
  let runRepo: Repository<TenantProvisioningRun>;

  const suffix = () => `${Date.now()}${Math.floor(Math.random() * 100000)}`;

  function makeDto(overrides: Partial<ProvisionTenantDto> = {}): ProvisionTenantDto {
    const s = suffix();
    return {
      hospitalName: `Integration Test Hospital ${s}`,
      adminUsername: `it_admin_${s}`,
      adminEmail: `it_admin_${s}@integration.test`,
      adminPassword: `Sup3rSecret!${s}`,
      adminFullName: 'Integration Test Admin',
      triggeredBy: 'integration-spec',
      ...overrides,
    } as ProvisionTenantDto;
  }

  async function loginShouldSucceed(identifier: string, password: string) {
    const result = await authService.login(
      { identifier, password } as any,
      '127.0.0.1',
      'jest-integration-test',
    );
    expect(result).toHaveProperty('accessToken');
    expect(result.user.username).toBe(identifier);
    return result;
  }

  async function loginShouldFail(identifier: string, password: string) {
    await expect(
      authService.login({ identifier, password } as any, '127.0.0.1', 'jest-integration-test'),
    ).rejects.toThrow(UnauthorizedException);
  }

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    provisioningService = app.get<TenantProvisioningService>(TenantProvisioningService);
    authService = app.get<AuthService>(AuthService);
    stepRepo = app.get<Repository<TenantProvisioningStep>>(getRepositoryToken(TenantProvisioningStep));
    runRepo = app.get<Repository<TenantProvisioningRun>>(getRepositoryToken(TenantProvisioningRun));
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ── Scenario 1: fresh provisioning ────────────────────────────────────
  it('fresh provisioning: creates the organization, creates the admin, and the displayed password logs in', async () => {
    const dto = makeDto();

    const run = await provisioningService.provision(dto);

    expect(run.status).toBe('completed');
    expect(run.tenantId).toBeTruthy();

    const steps = await provisioningService.getRunSteps(run.id);
    const adminStep = steps.find((s) => s.stepName === 'create_super_admin_user');
    expect(adminStep?.status).toBe('succeeded');
    expect(adminStep?.resultData?.username).toBe(dto.adminUsername);

    await loginShouldSucceed(dto.adminUsername, dto.adminPassword);
  });

  // ── Scenario 2: resume after a failure BEFORE the admin was created ───
  it('resume after failure before admin creation: resume succeeds and the displayed password logs in', async () => {
    // create_super_admin_user deliberately throws when adminPassword is
    // empty (see stepCreateSuperAdminUser's own guard) -- a real,
    // deterministic way to fail exactly at step 9 on the very first
    // attempt, before any admin account exists. Every step before it
    // (tenant row, role/permission verification, storage, connector key,
    // trial license) still succeeds for real.
    const dto = makeDto({ adminPassword: '' as any });

    const failedRun = await provisioningService.provision(dto);
    expect(failedRun.status).toBe('failed');

    const failedSteps = await provisioningService.getRunSteps(failedRun.id);
    const adminStepBefore = failedSteps.find((s) => s.stepName === 'create_super_admin_user');
    expect(adminStepBefore?.status).toBe('failed');
    // Confirms admin creation genuinely never happened -- nothing to refresh.
    expect(adminStepBefore?.resultData).toBeFalsy();

    const freshPassword = `Resumed!${suffix()}`;
    const resumedRun = await provisioningService.resume(failedRun.id, { adminPassword: freshPassword });

    expect(resumedRun.status).toBe('completed');

    const resumedSteps = await provisioningService.getRunSteps(resumedRun.id);
    const adminStepAfter = resumedSteps.find((s) => s.stepName === 'create_super_admin_user');
    expect(adminStepAfter?.status).toBe('succeeded');
    expect(adminStepAfter?.resultData?.username).toBe(dto.adminUsername);

    await loginShouldSucceed(dto.adminUsername, freshPassword);
  });

  // ── Scenario 3: resume after a failure AFTER the admin was created ────
  // (the exact real-world regression, 2026-07-30)
  it('resume after failure after admin creation: refreshes the existing admin, new password logs in, old password no longer works', async () => {
    const originalPassword = `Original!${suffix()}`;
    const dto = makeDto({ adminPassword: originalPassword });

    // 1. A genuinely complete, successful run -- every step (including
    //    create_super_admin_user) really succeeded, using the REAL
    //    pipeline. This gives us a real admin account with a real,
    //    working `originalPassword`.
    const completedRun = await provisioningService.provision(dto);
    expect(completedRun.status).toBe('completed');
    await loginShouldSucceed(dto.adminUsername, originalPassword);

    // 2. Simulate "a later step failed after step 9 already succeeded."
    //    There is no externally-triggerable, deterministic way to make a
    //    downstream step (create_default_org_branch /
    //    emit_tenant_provisioned_event) genuinely fail without corrupting
    //    unrelated global platform state (role/permission catalog) that
    //    other tests and this dev database depend on. Instead, this
    //    directly edits the REAL persisted run/step rows this REAL
    //    successful attempt just produced, to represent exactly the
    //    historical state the regression needs: create_super_admin_user
    //    already 'succeeded', but the run itself ended in 'failed' because
    //    something after it didn't. This is test *arrangement* via real
    //    repositories, not a mock of the code under test -- the assertions
    //    below all run through the real, unmocked resume()/execute()/
    //    stepCreateSuperAdminUser() pipeline.
    const lastStep = await stepRepo.findOne({
      where: { runId: completedRun.id, stepName: 'emit_tenant_provisioned_event' },
    });
    expect(lastStep).toBeTruthy();
    lastStep!.status = 'failed';
    lastStep!.lastError = '(integration test) simulated downstream failure after admin creation';
    await stepRepo.save(lastStep!);

    const run = await runRepo.findOne({ where: { id: completedRun.id } });
    run!.status = 'failed';
    run!.error = '(integration test) simulated downstream failure after admin creation';
    await runRepo.save(run!);

    // 3. Resume with a freshly generated password -- exactly what Vendor
    //    Portal's provision()/resumeHdspProvisioning() always sends.
    const newPassword = `Refreshed!${suffix()}`;
    const resumedRun = await provisioningService.resume(completedRun.id, { adminPassword: newPassword });

    expect(resumedRun.status).toBe('completed');

    const resumedSteps = await provisioningService.getRunSteps(resumedRun.id);
    const adminStep = resumedSteps.find((s) => s.stepName === 'create_super_admin_user');
    // `refreshed: true` is the marker stepCreateSuperAdminUser() sets when
    // it updates an existing account in place instead of creating a new
    // one -- proves the refresh path (not a duplicate-create attempt) ran.
    expect(adminStep?.resultData?.refreshed).toBe(true);
    expect(adminStep?.resultData?.username).toBe(dto.adminUsername);

    // 4. The invariant the user specified: the newly displayed password
    //    must work, and the old one must not.
    await loginShouldSucceed(dto.adminUsername, newPassword);
    await loginShouldFail(dto.adminUsername, originalPassword);
  });
});
