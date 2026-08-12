import { NotFoundException } from '@nestjs/common';
import { MortuaryHousekeepingService } from '../services/mortuary-housekeeping.service';
import { MortuaryHousekeepingTask } from '../entities/mortuary-housekeeping-task.entity';
import { MortuaryCabin } from '../entities/mortuary-cabin.entity';

// Stage C.1 — Step 5 rule #14 (previously ported, not unit-tested).
// Source: housekeepingController.js::verifyTask — verifying a task marks
// it VERIFIED *and* frees the cabin (Available) together. Asserted here
// via the transactional manager's update() calls, since that's the only
// observable trace of "together" in this service's public surface.

const TENANT_ID = 'tenant-a';

describe('MortuaryHousekeepingService.verify', () => {
  let scopedTaskRepo: { findOneBy: jest.Mock };
  let scopedCabinRepo: object;
  let dataSource: { transaction: jest.Mock };
  let service: MortuaryHousekeepingService;
  let updateCalls: Array<{ entity: unknown; criteria: unknown; patch: unknown }>;

  beforeEach(() => {
    updateCalls = [];
    scopedTaskRepo = { findOneBy: jest.fn().mockResolvedValue({ id: 'task-1', tenantId: TENANT_ID, cabinId: 'cabin-1', status: 'PENDING' }) };
    scopedCabinRepo = {};
    dataSource = {
      transaction: jest.fn(async (cb: (manager: any) => Promise<void>) => {
        const manager = {
          update: jest.fn((entity: unknown, criteria: unknown, patch: unknown) => {
            updateCalls.push({ entity, criteria, patch });
            return Promise.resolve(undefined);
          }),
        };
        await cb(manager);
      }),
    };
    service = new MortuaryHousekeepingService(scopedTaskRepo as any, scopedCabinRepo as any, dataSource as any);
  });

  it('throws NotFoundException for a task that does not belong to this tenant', async () => {
    scopedTaskRepo.findOneBy.mockResolvedValue(null);
    await expect(service.verify(TENANT_ID, 'not-mine')).rejects.toThrow(NotFoundException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('marks the task VERIFIED and the cabin Available inside a single transaction', async () => {
    await service.verify(TENANT_ID, 'task-1');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    const taskUpdate = updateCalls.find((c) => c.entity === MortuaryHousekeepingTask);
    const cabinUpdate = updateCalls.find((c) => c.entity === MortuaryCabin);
    expect(taskUpdate?.patch).toEqual({ status: 'VERIFIED' });
    expect(taskUpdate?.criteria).toEqual({ id: 'task-1', tenantId: TENANT_ID });
    expect(cabinUpdate?.patch).toEqual({ status: 'Available' });
    expect(cabinUpdate?.criteria).toEqual({ id: 'cabin-1', tenantId: TENANT_ID });
  });
});
