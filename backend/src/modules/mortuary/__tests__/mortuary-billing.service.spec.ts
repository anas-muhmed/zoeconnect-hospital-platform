import { MortuaryBillingService } from '../services/mortuary-billing.service';
import { MortuaryBilling } from '../entities/mortuary-billing.entity';
import { MortuaryBody } from '../entities/mortuary-body.entity';
import { MortuaryServiceBilling } from '../entities/mortuary-service-billing.entity';
import { MortuaryRequestContext } from '../mortuary-request-context';

// Stage C.1 — Step 5 rules #11/#12 (previously ported, not unit-tested).
// Source: billingController.js::generateBilling (staff discount is a
// per-tenant PERCENTAGE, not a hardcoded 100% waiver) and
// ::settleBilling/::settleServiceBilling (settling one bill only marks
// the body's overall billing_status SETTLED once the *other* bill is
// also settled or doesn't exist — checked from both directions).

const TENANT_ID = 'tenant-a';

function buildManagerMock(overrides: { findOneByResult?: any } = {}) {
  const calls: Array<{ method: string; entity: unknown; args: unknown[] }> = [];
  return {
    calls,
    manager: {
      insert: jest.fn((entity: unknown, values: unknown) => {
        calls.push({ method: 'insert', entity, args: [values] });
        return Promise.resolve(undefined);
      }),
      update: jest.fn((entity: unknown, criteria: unknown, patch: unknown) => {
        calls.push({ method: 'update', entity, args: [criteria, patch] });
        return Promise.resolve(undefined);
      }),
      findOneBy: jest.fn(() => Promise.resolve(overrides.findOneByResult ?? null)),
    },
  };
}

describe('MortuaryBillingService.generate — staff welfare discount', () => {
  let scopedBodyRepo: { findOneBy: jest.Mock };
  let settingsService: { getStaffDiscountPercent: jest.Mock };
  let serviceMasterRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let managerMock: ReturnType<typeof buildManagerMock>;
  let service: MortuaryBillingService;

  beforeEach(() => {
    scopedBodyRepo = { findOneBy: jest.fn().mockResolvedValue({ id: 'body-1', tenantId: TENANT_ID }) };
    settingsService = { getStaffDiscountPercent: jest.fn().mockResolvedValue(40) }; // non-default, proves it's read from settings not hardcoded
    serviceMasterRepo = { findOne: jest.fn().mockResolvedValue(null) };
    managerMock = buildManagerMock();
    dataSource = { transaction: jest.fn(async (cb: any) => cb(managerMock.manager)) };

    service = new MortuaryBillingService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      serviceMasterRepo as any,
      scopedBodyRepo as any,
      settingsService as any,
      dataSource as any,
    );
  });

  it('applies the tenant-configured staff discount percentage, not a hardcoded 100%', async () => {
    const context: MortuaryRequestContext = { tenantId: TENANT_ID, userId: 'u1', isAdmin: true };
    await service.generate(context, { bodyId: 'body-1', totalAmount: 1000, staffConcession: true } as any);

    expect(settingsService.getStaffDiscountPercent).toHaveBeenCalledWith(TENANT_ID);
    const billingInsert = managerMock.calls.find((c) => c.method === 'insert' && c.entity === MortuaryBilling);
    const insertedValues = billingInsert?.args[0] as any;
    expect(insertedValues.discountAmount).toBe(400); // 40% of 1000
    expect(insertedValues.discountReason).toBe('Staff Welfare Scheme - 40% Discount');
  });

  it('does not apply any staff discount when staffConcession is not set', async () => {
    const context: MortuaryRequestContext = { tenantId: TENANT_ID, userId: 'u1', isAdmin: true };
    await service.generate(context, { bodyId: 'body-1', totalAmount: 1000, discountAmount: 50 } as any);

    expect(settingsService.getStaffDiscountPercent).not.toHaveBeenCalled();
    const billingInsert = managerMock.calls.find((c) => c.method === 'insert' && c.entity === MortuaryBilling);
    expect((billingInsert?.args[0] as any).discountAmount).toBe(50);
  });
});

describe('MortuaryBillingService.settle — cross-bill settlement dependency', () => {
  let scopedBillingRepo: { findOneBy: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let managerMock: ReturnType<typeof buildManagerMock>;
  let service: MortuaryBillingService;

  const buildService = () => {
    service = new MortuaryBillingService(
      {} as any,
      scopedBillingRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
    );
  };

  beforeEach(() => {
    scopedBillingRepo = { findOneBy: jest.fn().mockResolvedValue({ id: 'bill-1', tenantId: TENANT_ID, bodyId: 'body-1', status: 'Pending' }) };
  });

  it('marks the body SETTLED when there is no associated service (dressing) bill at all', async () => {
    managerMock = buildManagerMock({ findOneByResult: null });
    dataSource = { transaction: jest.fn(async (cb: any) => cb(managerMock.manager)) };
    buildService();

    await service.settle(TENANT_ID, 'bill-1');
    const bodyUpdate = managerMock.calls.find((c) => c.method === 'update' && c.entity === MortuaryBody);
    expect(bodyUpdate?.args[1]).toEqual({ billingStatus: 'SETTLED' });
  });

  it('marks the body SETTLED when the associated service bill is already settled', async () => {
    managerMock = buildManagerMock({ findOneByResult: { status: 'Settled' } });
    dataSource = { transaction: jest.fn(async (cb: any) => cb(managerMock.manager)) };
    buildService();

    await service.settle(TENANT_ID, 'bill-1');
    const bodyUpdate = managerMock.calls.find((c) => c.method === 'update' && c.entity === MortuaryBody);
    expect(bodyUpdate?.args[1]).toEqual({ billingStatus: 'SETTLED' });
  });

  it('does NOT mark the body SETTLED while the associated service bill is still Pending', async () => {
    managerMock = buildManagerMock({ findOneByResult: { status: 'Pending' } });
    dataSource = { transaction: jest.fn(async (cb: any) => cb(managerMock.manager)) };
    buildService();

    await service.settle(TENANT_ID, 'bill-1');
    const bodyUpdate = managerMock.calls.find((c) => c.method === 'update' && c.entity === MortuaryBody);
    expect(bodyUpdate).toBeUndefined();
    // The stay bill itself is always marked settled regardless.
    const billUpdate = managerMock.calls.find((c) => c.method === 'update' && c.entity === MortuaryBilling);
    expect(billUpdate?.args[1]).toMatchObject({ status: 'Settled' });
  });
});

describe('MortuaryBillingService.settleServiceBilling — reverse direction of the same dependency', () => {
  let scopedServiceBillingRepo: { findOneBy: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let managerMock: ReturnType<typeof buildManagerMock>;
  let service: MortuaryBillingService;

  const buildService = () => {
    service = new MortuaryBillingService(
      {} as any,
      {} as any,
      {} as any,
      scopedServiceBillingRepo as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
    );
  };

  beforeEach(() => {
    scopedServiceBillingRepo = { findOneBy: jest.fn().mockResolvedValue({ id: 'svc-1', tenantId: TENANT_ID, bodyId: 'body-1', status: 'Pending' }) };
  });

  it('marks the body SETTLED once the service bill settles and the main stay bill is already Settled', async () => {
    managerMock = buildManagerMock({ findOneByResult: { status: 'Settled' } }); // MortuaryBilling lookup
    dataSource = { transaction: jest.fn(async (cb: any) => cb(managerMock.manager)) };
    buildService();

    await service.settleServiceBilling(TENANT_ID, 'svc-1');
    const bodyUpdate = managerMock.calls.find((c) => c.method === 'update' && c.entity === MortuaryBody);
    expect(bodyUpdate?.args[1]).toEqual({ billingStatus: 'SETTLED' });
  });

  it('does NOT mark the body SETTLED while the main stay bill is still Pending', async () => {
    managerMock = buildManagerMock({ findOneByResult: { status: 'Pending' } });
    dataSource = { transaction: jest.fn(async (cb: any) => cb(managerMock.manager)) };
    buildService();

    await service.settleServiceBilling(TENANT_ID, 'svc-1');
    const bodyUpdate = managerMock.calls.find((c) => c.method === 'update' && c.entity === MortuaryBody);
    expect(bodyUpdate).toBeUndefined();
    const svcUpdate = managerMock.calls.find((c) => c.method === 'update' && c.entity === MortuaryServiceBilling);
    expect(svcUpdate?.args[1]).toEqual({ status: 'Settled' });
  });
});
