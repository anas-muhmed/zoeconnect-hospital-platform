import { BadRequestException, ConflictException } from '@nestjs/common';
import { MortuaryBodiesService } from '../services/mortuary-bodies.service';

// Business-invariant suite (Stage C, Step 5/9). Ported from
// zoe-platform's bodyController.js: createBody's MLC-required-fields
// check, deleteBody's active-allocation guard, and coerceFreezerRequired
// being applied on BOTH create and update (the exact bug bodyController.js
// itself once had — see typeCoercion.test.js in the source, and
// billing-math.util.spec.ts here for the coercion function's own unit
// tests).

const TENANT_ID = 'tenant-a';

describe('MortuaryBodiesService', () => {
  let bodyRepo: { create: jest.Mock; save: jest.Mock };
  let scopedBodyRepo: { findOneBy: jest.Mock; find: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let hospitalProfileRepo: { findOneBy: jest.Mock };
  let scopedAllocationRepo: { find: jest.Mock; findOneBy: jest.Mock };
  let scopedBillingRepo: { findOneBy: jest.Mock };
  let service: MortuaryBodiesService;

  beforeEach(() => {
    bodyRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'body-1', ...x })),
    };
    scopedBodyRepo = {
      findOneBy: jest.fn().mockResolvedValue({ id: 'body-1', tenantId: TENANT_ID }),
      find: jest.fn().mockResolvedValue([]), // no existing bodies -> body-number sequence starts at 0001
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    hospitalProfileRepo = { findOneBy: jest.fn().mockResolvedValue({ clientId: 'SUNH8261' }) };
    scopedAllocationRepo = { find: jest.fn().mockResolvedValue([]), findOneBy: jest.fn().mockResolvedValue(null) };
    scopedBillingRepo = { findOneBy: jest.fn().mockResolvedValue(null) };

    service = new MortuaryBodiesService(
      bodyRepo as any,
      scopedBodyRepo as any,
      hospitalProfileRepo as any,
      scopedAllocationRepo as any,
      scopedBillingRepo as any,
    );
  });

  describe('create', () => {
    it('rejects an MLC body missing the required police-report fields', async () => {
      await expect(service.create(TENANT_ID, { bodyType: 'MLC' } as any)).rejects.toThrow(BadRequestException);
    });

    it('accepts an MLC body with all required police-report fields, coercing freezerRequired', async () => {
      const body = await service.create(TENANT_ID, {
        bodyType: 'MLC',
        policeStationName: 'Central', stationSiName: 'SI Rao', presentPoliceOfficerName: 'PC Nair',
        freezerRequired: false,
      } as any);
      expect(bodyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ freezerRequired: 0 }));
      expect(body).toBeDefined();
    });

    it('does not require police fields for a Non-MLC body, and leaves freezerRequired null (not applicable)', async () => {
      await service.create(TENANT_ID, { bodyType: 'Non-MLC' } as any);
      expect(bodyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ freezerRequired: null }));
    });

    it('generates a body number prefixed with the tenant hospital profile client_id and current year', async () => {
      const year = new Date().getFullYear();
      await service.create(TENANT_ID, { bodyType: 'Non-MLC' } as any);
      expect(bodyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ bodyNumber: `SUNH8261-${year}-0001` }));
    });
  });

  describe('update', () => {
    it('applies coerceFreezerRequired on update too (the exact bug the source once had on this path)', async () => {
      await service.update(TENANT_ID, 'body-1', { freezerRequired: true } as any);
      expect(scopedBodyRepo.update).toHaveBeenCalledWith({ id: 'body-1', tenantId: TENANT_ID }, expect.objectContaining({ freezerRequired: 1 }));
    });
  });

  describe('remove', () => {
    it('blocks deletion when the body has an active cabin allocation', async () => {
      scopedAllocationRepo.findOneBy.mockResolvedValue({ id: 'alloc-1' });
      await expect(service.remove(TENANT_ID, 'body-1')).rejects.toThrow(ConflictException);
      expect(scopedBodyRepo.delete).not.toHaveBeenCalled();
    });

    it('allows deletion when there is no active allocation', async () => {
      scopedAllocationRepo.findOneBy.mockResolvedValue(null);
      await service.remove(TENANT_ID, 'body-1');
      expect(scopedBodyRepo.delete).toHaveBeenCalledWith({ id: 'body-1', tenantId: TENANT_ID });
    });
  });
});
