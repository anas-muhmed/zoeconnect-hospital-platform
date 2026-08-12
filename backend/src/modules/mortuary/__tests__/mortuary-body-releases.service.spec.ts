import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { MortuaryBodyReleasesService } from '../services/mortuary-body-releases.service';

// Stage C.1 — Step 5 rules #9/#13 (previously ported, not unit-tested).
// Source: releaseController.js::createBodyRelease —
//   1. Blocked unless the stay bill is Settled.
//   2. Blocked unless any associated body-dressing service bill is also
//      Settled (a body can have no service bill at all — that's fine).
//   3. NON_MLC requires bodyTakenBy/relationship/address/contactNumber;
//      MLC requires bodyTakenBy/contactNumber/policeStationName/siName —
//      exact field sets from source, not invented.

const TENANT_ID = 'tenant-a';

describe('MortuaryBodyReleasesService.create', () => {
  let scopedBodyRepo: { findOneBy: jest.Mock };
  let scopedBillingRepo: { findOneBy: jest.Mock };
  let scopedServiceBillingRepo: { findOneBy: jest.Mock };
  let scopedAllocationRepo: { findOneBy: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: MortuaryBodyReleasesService;

  const validNonMlcDto = {
    bodyId: 'body-1',
    caseType: 'NON_MLC' as const,
    bodyTakenBy: 'John Doe',
    relationship: 'Brother',
    address: '123 Street',
    contactNumber: '9999999999',
  };

  const validMlcDto = {
    bodyId: 'body-1',
    caseType: 'MLC' as const,
    bodyTakenBy: 'John Doe',
    contactNumber: '9999999999',
    policeStationName: 'Central',
    siName: 'SI Rao',
  };

  beforeEach(() => {
    scopedBodyRepo = { findOneBy: jest.fn().mockResolvedValue({ id: 'body-1', tenantId: TENANT_ID, status: 'Allocated' }) };
    scopedBillingRepo = { findOneBy: jest.fn().mockResolvedValue({ status: 'Settled' }) };
    scopedServiceBillingRepo = { findOneBy: jest.fn().mockResolvedValue(null) }; // no service bill -> fine
    scopedAllocationRepo = { findOneBy: jest.fn().mockResolvedValue(null) };
    dataSource = {
      transaction: jest.fn(async (cb: (manager: any) => Promise<void>) => {
        const manager = {
          insert: jest.fn().mockResolvedValue(undefined),
          update: jest.fn().mockResolvedValue(undefined),
          findOne: jest.fn().mockResolvedValue(null),
        };
        await cb(manager);
      }),
    };
    service = new MortuaryBodyReleasesService(
      {} as any,
      scopedBodyRepo as any,
      scopedBillingRepo as any,
      scopedServiceBillingRepo as any,
      scopedAllocationRepo as any,
      dataSource as any,
    );
  });

  describe('bill-settlement gate', () => {
    it('rejects when the stay bill does not exist yet', async () => {
      scopedBillingRepo.findOneBy.mockResolvedValue(null);
      await expect(service.create(TENANT_ID, validNonMlcDto)).rejects.toThrow('Mortuary Stay Bill must be settled before release');
    });

    it('rejects when the stay bill exists but is not Settled', async () => {
      scopedBillingRepo.findOneBy.mockResolvedValue({ status: 'Pending' });
      await expect(service.create(TENANT_ID, validNonMlcDto)).rejects.toThrow(BadRequestException);
    });

    it('rejects when a body-dressing service bill exists but is not Settled', async () => {
      scopedServiceBillingRepo.findOneBy.mockResolvedValue({ status: 'Pending' });
      await expect(service.create(TENANT_ID, validNonMlcDto)).rejects.toThrow('Body Dressing Service Bill must be settled before release');
    });

    it('allows release when there is no service bill at all', async () => {
      scopedServiceBillingRepo.findOneBy.mockResolvedValue(null);
      await expect(service.create(TENANT_ID, validNonMlcDto)).resolves.toBeDefined();
    });

    it('allows release when the service bill is also Settled', async () => {
      scopedServiceBillingRepo.findOneBy.mockResolvedValue({ status: 'Settled' });
      await expect(service.create(TENANT_ID, validNonMlcDto)).resolves.toBeDefined();
    });

    it('rejects when the body is already released', async () => {
      scopedBodyRepo.findOneBy.mockResolvedValue({ id: 'body-1', tenantId: TENANT_ID, status: 'RELEASED' });
      await expect(service.create(TENANT_ID, validNonMlcDto)).rejects.toThrow('Body already released');
    });
  });

  describe('NON_MLC field validation', () => {
    it.each(['bodyTakenBy', 'relationship', 'address', 'contactNumber'])('rejects when %s is missing', async (field) => {
      const dto = { ...validNonMlcDto, [field]: undefined };
      await expect(service.create(TENANT_ID, dto as any)).rejects.toThrow(UnprocessableEntityException);
    });

    it('accepts when all required NON_MLC fields are present', async () => {
      await expect(service.create(TENANT_ID, validNonMlcDto)).resolves.toBeDefined();
    });
  });

  describe('MLC field validation', () => {
    it.each(['bodyTakenBy', 'contactNumber', 'policeStationName', 'siName'])('rejects when %s is missing', async (field) => {
      const dto = { ...validMlcDto, [field]: undefined };
      await expect(service.create(TENANT_ID, dto as any)).rejects.toThrow(UnprocessableEntityException);
    });

    it('accepts when all required MLC fields are present (relationship/address not required for MLC)', async () => {
      await expect(service.create(TENANT_ID, validMlcDto)).resolves.toBeDefined();
    });
  });
});
