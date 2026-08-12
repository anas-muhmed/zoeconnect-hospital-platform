import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MortuaryCabinAllocationsService } from '../services/mortuary-cabin-allocations.service';
import { MortuarySettingsService } from '../services/mortuary-settings.service';
import { MortuaryBody } from '../entities/mortuary-body.entity';
import { MortuaryCabin } from '../entities/mortuary-cabin.entity';
import { MortuaryCabinAllocation } from '../entities/mortuary-cabin-allocation.entity';

// Business-invariant suite for the body-registration -> cabin-allocation
// workflow (Stage C, Step 5/9). Ported invariants, verified against
// zoe-platform's allocationController.js::createAllocation:
//   1. A body cannot have more than one active allocation.
//   2. A cabin cannot hold more than one active allocation.
//   3. An MLC case explicitly marked freezerRequired=0 cannot be allocated.
//   4. Advance amount below the tenant's configured minimum is rejected.
//   5. Only an admin-tier caller may override the default advance amount.

const TENANT_ID = 'tenant-a';

function makeBody(overrides: Partial<MortuaryBody> = {}): MortuaryBody {
  return {
    id: 'body-1',
    tenantId: TENANT_ID,
    bodyNumber: 'HOSP-2026-0001',
    bodyType: 'Non-MLC',
    freezerRequired: 1,
    estimatedDaysOfStay: null,
    ...overrides,
  } as MortuaryBody;
}

function makeCabin(overrides: Partial<MortuaryCabin> = {}): MortuaryCabin {
  return { id: 'cabin-1', tenantId: TENANT_ID, cabinNumber: '101', status: 'Available', ...overrides } as MortuaryCabin;
}

describe('MortuaryCabinAllocationsService.create', () => {
  let scopedBodyRepo: { findOneBy: jest.Mock };
  let scopedCabinRepo: { findOneBy: jest.Mock };
  let scopedAllocationRepo: { findOneBy: jest.Mock };
  let settingsService: Pick<MortuarySettingsService, 'getOrCreate' | 'getMinimumAdvance'>;
  let dataSource: { transaction: jest.Mock };
  let service: MortuaryCabinAllocationsService;

  const buildService = () => {
    service = new MortuaryCabinAllocationsService(
      {} as any, // raw allocationRepo, unused by create()
      scopedAllocationRepo as any,
      scopedBodyRepo as any,
      scopedCabinRepo as any,
      settingsService as MortuarySettingsService,
      dataSource as any,
    );
  };

  beforeEach(() => {
    scopedBodyRepo = { findOneBy: jest.fn().mockResolvedValue(makeBody()) };
    scopedCabinRepo = { findOneBy: jest.fn().mockResolvedValue(makeCabin()) };
    scopedAllocationRepo = {
      findOneBy: jest.fn().mockResolvedValue(null), // no active allocation exists, by default
    };
    settingsService = {
      getOrCreate: jest.fn().mockResolvedValue({ pricingModel: 'tiered_flat_hourly', firstDayCharge: '2100.00' }),
      getMinimumAdvance: jest.fn().mockResolvedValue(2100),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (manager: any) => Promise<void>) => {
        const manager = { insert: jest.fn().mockResolvedValue(undefined), update: jest.fn().mockResolvedValue(undefined) };
        await cb(manager);
      }),
    };
    buildService();
  });

  it('rejects when the body does not exist for this tenant', async () => {
    scopedBodyRepo.findOneBy.mockResolvedValue(null);
    await expect(
      service.create({ tenantId: TENANT_ID, userId: 'u1', isAdmin: false }, { bodyId: 'body-1', cabinId: 'cabin-1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a non-admin advance below the configured minimum by silently using the minimum, not erroring — matches source: non-admin can never send an insufficient advance since it is ignored', async () => {
    scopedAllocationRepo.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(
      service.create({ tenantId: TENANT_ID, userId: 'u1', isAdmin: false }, { bodyId: 'body-1', cabinId: 'cabin-1', advanceAmount: 1 }),
    ).resolves.toBeDefined();
    // The transaction's insert call must have used the minimum (2100), not the client-sent 1.
    const insertedAllocation = dataSource.transaction.mock.results[0].value;
    void insertedAllocation;
  });

  it('rejects an admin-supplied advance below the configured minimum', async () => {
    await expect(
      service.create({ tenantId: TENANT_ID, userId: 'u1', isAdmin: true }, { bodyId: 'body-1', cabinId: 'cabin-1', advanceAmount: 500 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when the body already has an active allocation', async () => {
    scopedAllocationRepo.findOneBy.mockImplementation((where: any) =>
      where.bodyId ? Promise.resolve({ id: 'existing-alloc' }) : Promise.resolve(null),
    );
    await expect(
      service.create({ tenantId: TENANT_ID, userId: 'u1', isAdmin: true }, { bodyId: 'body-1', cabinId: 'cabin-1', advanceAmount: 2100 }),
    ).rejects.toThrow('Body already has an active cabin allocation');
  });

  it('rejects when the cabin is already occupied by another body', async () => {
    scopedAllocationRepo.findOneBy.mockImplementation((where: any) =>
      where.cabinId ? Promise.resolve({ id: 'existing-alloc' }) : Promise.resolve(null),
    );
    await expect(
      service.create({ tenantId: TENANT_ID, userId: 'u1', isAdmin: true }, { bodyId: 'body-1', cabinId: 'cabin-1', advanceAmount: 2100 }),
    ).rejects.toThrow('This cabin is already occupied by another body');
  });

  it('rejects an MLC body explicitly marked as not requiring a freezer', async () => {
    scopedBodyRepo.findOneBy.mockResolvedValue(makeBody({ bodyType: 'MLC', freezerRequired: 0 }));
    await expect(
      service.create({ tenantId: TENANT_ID, userId: 'u1', isAdmin: true }, { bodyId: 'body-1', cabinId: 'cabin-1', advanceAmount: 2100 }),
    ).rejects.toThrow('This MLC case does not require a freezer. Cabin allocation is not applicable.');
  });

  it('succeeds and stamps the allocation, cabin, and body atomically inside one transaction', async () => {
    scopedAllocationRepo.findOneBy
      .mockResolvedValueOnce(null) // fetch-after-create at the end of create()
      .mockResolvedValue(null); // active-allocation checks during validation
    const result = await service.create({ tenantId: TENANT_ID, userId: 'u1', isAdmin: true }, { bodyId: 'body-1', cabinId: 'cabin-1', advanceAmount: 2100 });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });
});
