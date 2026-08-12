/**
 * Phase 4 ("Licensing Providers", Task 4.4) — ILicenseProvider conformance
 * suite, run against both bound implementations (FileLicenseProvider,
 * SubscriptionLicenseProvider) in CI's normal "Unit tests" step (no
 * external service dependency, unlike Phase 3's MinIO-backed S3
 * conformance suite -- both providers here only need a mocked repository/
 * service, not a live Postgres instance).
 *
 * A single `assertConformsToInterface` helper runs the same structural
 * assertions against whatever `ILicenseProvider` it's handed, so a future
 * third provider only needs to add one more `describe` block, not
 * duplicate the assertion list.
 */
import { Repository, IsNull } from 'typeorm';
import { FileLicenseProvider } from '../providers/file-license.provider';
import { SubscriptionLicenseProvider } from '../providers/subscription-license.provider';
import { ILicenseProvider, LicenseProviderStatus } from '../../platform/infrastructure/licensing/license-provider.interface';
import { SubscriptionLicense } from '../entities/subscription-license.entity';
import { LicenseService, LicenseStatus } from '../license.service';

const REQUIRED_KEYS: Array<keyof LicenseProviderStatus> = [
  'isValid', 'isTrial', 'hospitalName', 'hospitalCode', 'licensedModules',
  'maxUsers', 'expiresAt', 'daysRemaining', 'isExpiringSoon',
  'machineFingerprint', 'moduleExpiries', 'isInGracePeriod',
  'gracePeriodEndsAt', 'gracePeriodModules',
];

async function assertConformsToInterface(provider: ILicenseProvider, tenantId?: string): Promise<LicenseProviderStatus> {
  const status = await provider.getStatus(tenantId);
  for (const key of REQUIRED_KEYS) {
    expect(status).toHaveProperty(key);
  }
  expect(typeof status.isValid).toBe('boolean');
  expect(typeof status.isTrial).toBe('boolean');
  expect(Array.isArray(status.licensedModules)).toBe(true);
  expect(typeof status.moduleExpiries).toBe('object');
  return status;
}

describe('ILicenseProvider conformance', () => {
  describe('FileLicenseProvider', () => {
    const fakeStatus: LicenseStatus = {
      isValid: true,
      isTrial: false,
      hospitalName: 'Test Hospital',
      hospitalCode: 'TEST',
      licensedModules: ['PLATFORM', 'LOYALTY'],
      maxUsers: 50,
      expiresAt: new Date('2027-01-01'),
      daysRemaining: 300,
      isExpiringSoon: false,
      machineFingerprint: 'abc123',
      moduleExpiries: { PLATFORM: null, LOYALTY: new Date('2027-01-01') },
      isInGracePeriod: false,
      gracePeriodEndsAt: null,
      gracePeriodModules: [],
      deploymentMode: 'self_hosted',
      vendorRegistrationRequired: false,
    };

    it('conforms to ILicenseProvider and delegates to LicenseService.getStatus()', async () => {
      const licenseService = { getStatus: jest.fn().mockResolvedValue(fakeStatus) } as unknown as LicenseService;
      const provider = new FileLicenseProvider(licenseService);
      const status = await assertConformsToInterface(provider);
      expect(status).toEqual(fakeStatus);
      expect(licenseService.getStatus).toHaveBeenCalledTimes(1);
    });

    // Self-review fix (Redis-key audit): tenantId is now actually passed
    // through to LicenseService.getStatus() (previously silently
    // discarded) so it can select the correct tenant-scoped LICENSE cache
    // key. This replaces the old "unused today" framing.
    it('passes tenantId through to LicenseService.getStatus() instead of discarding it', async () => {
      const licenseService = { getStatus: jest.fn().mockResolvedValue(fakeStatus) } as unknown as LicenseService;
      const provider = new FileLicenseProvider(licenseService);
      await expect(provider.getStatus('some-tenant-id')).resolves.toEqual(fakeStatus);
      expect(licenseService.getStatus).toHaveBeenCalledWith('some-tenant-id');
    });
  });

  describe('SubscriptionLicenseProvider', () => {
    function makeRepo(record: Partial<SubscriptionLicense> | null): Repository<SubscriptionLicense> {
      return { findOne: jest.fn().mockResolvedValue(record) } as unknown as Repository<SubscriptionLicense>;
    }

    it('conforms to ILicenseProvider and maps an active subscription record to isValid=true', async () => {
      const repo = makeRepo({
        tenantId: 'tenant-a',
        hospitalName: 'Sub Hospital',
        hospitalCode: 'SUB',
        subscriptionStatus: 'active',
        licensedModules: ['PLATFORM'],
        maxUsers: 20,
        currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
        machineFingerprint: null,
      });
      const provider = new SubscriptionLicenseProvider(repo);
      const status = await assertConformsToInterface(provider, 'tenant-a');
      expect(status.isValid).toBe(true);
      expect(status.hospitalCode).toBe('SUB');
      expect(repo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-a' } }));
    });

    it('maps a past_due subscription to isValid=false', async () => {
      const repo = makeRepo({
        tenantId: 'tenant-a',
        hospitalName: 'Sub Hospital',
        hospitalCode: 'SUB',
        subscriptionStatus: 'past_due',
        licensedModules: [],
        maxUsers: 5,
        currentPeriodEnd: null,
        machineFingerprint: null,
      });
      const provider = new SubscriptionLicenseProvider(repo);
      const status = await assertConformsToInterface(provider, 'tenant-a');
      expect(status.isValid).toBe(false);
    });

    it('falls back to the untenanted row (IsNull) when tenantId is omitted', async () => {
      const repo = makeRepo(null);
      const provider = new SubscriptionLicenseProvider(repo);
      await assertConformsToInterface(provider);
      expect(repo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: IsNull() } }));
    });

    it('returns a valid-shaped but isValid=false status when no record exists at all', async () => {
      const repo = makeRepo(null);
      const provider = new SubscriptionLicenseProvider(repo);
      const status = await assertConformsToInterface(provider, 'unknown-tenant');
      expect(status.isValid).toBe(false);
      expect(status.licensedModules).toEqual([]);
    });

    // Cloud Licensing API grace-period hardening (2026-07-29).
    describe('grace period (past_due vs. canceled/incomplete)', () => {
      function makeConfig(graceDays: number) {
        return { get: jest.fn().mockReturnValue(graceDays) } as any;
      }

      it('past_due WITH a currentPeriodEnd still inside the grace window -> isValid=true, isInGracePeriod=true', async () => {
        const periodEnd = new Date(Date.now() - 1 * 86_400_000); // expired 1 day ago
        const repo = makeRepo({
          tenantId: 'tenant-a',
          hospitalName: 'Sub Hospital',
          hospitalCode: 'SUB',
          subscriptionStatus: 'past_due',
          licensedModules: ['PLATFORM'],
          maxUsers: 5,
          currentPeriodEnd: periodEnd,
          machineFingerprint: null,
        });
        const provider = new SubscriptionLicenseProvider(repo, makeConfig(3));
        const status = await assertConformsToInterface(provider, 'tenant-a');
        expect(status.isValid).toBe(true);
        expect(status.isInGracePeriod).toBe(true);
        expect(status.gracePeriodEndsAt).not.toBeNull();
        expect(status.gracePeriodModules).toEqual(['PLATFORM']);
      });

      it('past_due with a currentPeriodEnd PAST the grace window -> isValid=false, isInGracePeriod=false', async () => {
        const periodEnd = new Date(Date.now() - 10 * 86_400_000); // expired 10 days ago
        const repo = makeRepo({
          tenantId: 'tenant-a',
          hospitalName: 'Sub Hospital',
          hospitalCode: 'SUB',
          subscriptionStatus: 'past_due',
          licensedModules: ['PLATFORM'],
          maxUsers: 5,
          currentPeriodEnd: periodEnd,
          machineFingerprint: null,
        });
        const provider = new SubscriptionLicenseProvider(repo, makeConfig(3));
        const status = await assertConformsToInterface(provider, 'tenant-a');
        expect(status.isValid).toBe(false);
        expect(status.isInGracePeriod).toBe(false);
        expect(status.gracePeriodEndsAt).toBeNull();
      });

      it('past_due with no currentPeriodEnd at all -> isValid=false (nothing to anchor a grace window to)', async () => {
        const repo = makeRepo({
          tenantId: 'tenant-a',
          hospitalName: 'Sub Hospital',
          hospitalCode: 'SUB',
          subscriptionStatus: 'past_due',
          licensedModules: [],
          maxUsers: 5,
          currentPeriodEnd: null,
          machineFingerprint: null,
        });
        const provider = new SubscriptionLicenseProvider(repo, makeConfig(3));
        const status = await assertConformsToInterface(provider, 'tenant-a');
        expect(status.isValid).toBe(false);
        expect(status.isInGracePeriod).toBe(false);
      });

      it('canceled -> isValid=false outright, no grace, even with a future currentPeriodEnd', async () => {
        const repo = makeRepo({
          tenantId: 'tenant-a',
          hospitalName: 'Sub Hospital',
          hospitalCode: 'SUB',
          subscriptionStatus: 'canceled',
          licensedModules: ['PLATFORM'],
          maxUsers: 5,
          currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
          machineFingerprint: null,
        });
        const provider = new SubscriptionLicenseProvider(repo, makeConfig(3));
        const status = await assertConformsToInterface(provider, 'tenant-a');
        expect(status.isValid).toBe(false);
        expect(status.isInGracePeriod).toBe(false);
      });

      it('incomplete -> isValid=false outright, no grace', async () => {
        const repo = makeRepo({
          tenantId: 'tenant-a',
          hospitalName: 'Sub Hospital',
          hospitalCode: 'SUB',
          subscriptionStatus: 'incomplete',
          licensedModules: [],
          maxUsers: 5,
          currentPeriodEnd: null,
          machineFingerprint: null,
        });
        const provider = new SubscriptionLicenseProvider(repo, makeConfig(3));
        const status = await assertConformsToInterface(provider, 'tenant-a');
        expect(status.isValid).toBe(false);
        expect(status.isInGracePeriod).toBe(false);
      });

      it('falls back to the default grace period (3 days) when no ConfigService is supplied', async () => {
        const periodEnd = new Date(Date.now() - 1 * 86_400_000);
        const repo = makeRepo({
          tenantId: 'tenant-a',
          hospitalName: 'Sub Hospital',
          hospitalCode: 'SUB',
          subscriptionStatus: 'past_due',
          licensedModules: [],
          maxUsers: 5,
          currentPeriodEnd: periodEnd,
          machineFingerprint: null,
        });
        const provider = new SubscriptionLicenseProvider(repo); // no config arg
        const status = await assertConformsToInterface(provider, 'tenant-a');
        expect(status.isValid).toBe(true);
        expect(status.isInGracePeriod).toBe(true);
      });
    });
  });
});
