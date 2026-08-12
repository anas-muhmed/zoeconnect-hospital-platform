/**
 * Cloud Licensing API hardening (2026-07-29 follow-up review) --
 * CloudLicensingController.updateSubscription()'s state-machine validation,
 * idempotent-retry short-circuit, and atomic partial-update-by-id logic
 * (replacing the original read-modify-write full-entity `.save()`, which was
 * vulnerable to a lost-update race between two concurrent callers touching
 * different fields).
 */
import { ConflictException } from '@nestjs/common';
import { CloudLicensingController } from '../cloud-licensing.controller';
import { SubscriptionLicense } from '../entities/subscription-license.entity';

function makeRepo(existing: Partial<SubscriptionLicense> | null) {
  const record = existing ? { id: 'sub-1', tenantId: 'tenant-1', ...existing } as SubscriptionLicense : null;
  let lastUpdatePatch: Record<string, unknown> | undefined;

  return {
    findOne: jest.fn().mockResolvedValue(record),
    findOneOrFail: jest.fn().mockImplementation(async () => ({ ...record, ...(lastUpdatePatch || {}) })),
    update: jest.fn().mockImplementation(async (_id: string, patch: Record<string, unknown>) => {
      lastUpdatePatch = patch;
    }),
    create: jest.fn().mockImplementation((v: Partial<SubscriptionLicense>) => v as SubscriptionLicense),
    save: jest.fn().mockImplementation(async (v: SubscriptionLicense) => ({ id: 'sub-new', ...v })),
  };
}

function makeAuditService() {
  return { log: jest.fn().mockResolvedValue(undefined) } as any;
}

describe('CloudLicensingController.updateSubscription', () => {
  it('accepts a valid transition (trialing -> active) and performs a partial update, not a full-entity save', async () => {
    const repo = makeRepo({ subscriptionStatus: 'trialing', licensedModules: ['PLATFORM'], planId: null, maxUsers: 5, currentPeriodEnd: null });
    const audit = makeAuditService();
    const controller = new CloudLicensingController(repo as any, audit);

    const result = await controller.updateSubscription('tenant-1', {
      subscriptionStatus: 'active',
      licensedModules: ['PLATFORM', 'LOYALTY'],
      changedBy: 'admin-1',
      reason: 'upgrade',
    } as any);

    expect(result.ok).toBe(true);
    expect(repo.update).toHaveBeenCalledWith('sub-1', expect.objectContaining({ subscriptionStatus: 'active', licensedModules: ['PLATFORM', 'LOYALTY'] }));
    // Partial update must NOT include fields the caller never sent (e.g. planId/maxUsers/currentPeriodEnd) --
    // this is the concurrency-safety property: an unrelated concurrent writer's fields must survive.
    const patchArg = repo.update.mock.calls[0][1];
    expect(patchArg).not.toHaveProperty('planId');
    expect(patchArg).not.toHaveProperty('maxUsers');
    expect(patchArg).not.toHaveProperty('currentPeriodEnd');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SUBSCRIPTION_LICENSE_UPDATED',
      metadata: expect.objectContaining({ changedBy: 'admin-1', reason: 'upgrade' }),
    }));
  });

  it('rejects an invalid transition (canceled -> trialing) with 409 and audits the rejection', async () => {
    const repo = makeRepo({ subscriptionStatus: 'canceled', licensedModules: [], planId: null, maxUsers: 5, currentPeriodEnd: null });
    const audit = makeAuditService();
    const controller = new CloudLicensingController(repo as any, audit);

    await expect(controller.updateSubscription('tenant-1', {
      subscriptionStatus: 'trialing',
      licensedModules: ['PLATFORM'],
    } as any)).rejects.toBeInstanceOf(ConflictException);

    expect(repo.update).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUBSCRIPTION_LICENSE_TRANSITION_REJECTED' }));
  });

  it('allows a same-status "transition" (idempotent retry) and short-circuits with no write when nothing actually changed', async () => {
    const repo = makeRepo({
      subscriptionStatus: 'active',
      licensedModules: ['PLATFORM', 'LOYALTY'],
      planId: 'pro',
      maxUsers: 10,
      currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z'),
    });
    const audit = makeAuditService();
    const controller = new CloudLicensingController(repo as any, audit);

    const result = await controller.updateSubscription('tenant-1', {
      subscriptionStatus: 'active',
      licensedModules: ['PLATFORM', 'LOYALTY'],
      planId: 'pro',
      maxUsers: 10,
      currentPeriodEnd: '2027-01-01T00:00:00.000Z',
    } as any);

    expect(result.noop).toBe(true);
    expect(repo.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('creates a new row (any initial status allowed) when none exists yet, still auditing the change', async () => {
    const repo = makeRepo(null);
    const audit = makeAuditService();
    const controller = new CloudLicensingController(repo as any, audit);

    const result = await controller.updateSubscription('tenant-2', {
      subscriptionStatus: 'trialing',
      licensedModules: ['PLATFORM'],
      changedBy: 'system',
      reason: 'trial_start',
    } as any);

    expect(result.ok).toBe(true);
    expect(repo.save).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SUBSCRIPTION_LICENSE_UPDATED' }));
  });
});
