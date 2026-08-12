import { BadRequestException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MortuaryBodyRelease } from '../entities/mortuary-body-release.entity';
import { MortuaryBody } from '../entities/mortuary-body.entity';
import { MortuaryCabin } from '../entities/mortuary-cabin.entity';
import { MortuaryCabinAllocation } from '../entities/mortuary-cabin-allocation.entity';
import { MortuaryHousekeepingTask } from '../entities/mortuary-housekeeping-task.entity';
import { MortuaryBilling } from '../entities/mortuary-billing.entity';
import { MortuaryServiceBilling } from '../entities/mortuary-service-billing.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { CreateMortuaryBodyReleaseDto } from '../dto/create-mortuary-body-release.dto';

/**
 * Mortuary integration (Phase 2, Stage C). Ports `releaseController.js`.
 * Tenant-scoped.
 *
 * Business invariants preserved from source (`createBodyRelease`):
 *  1. Blocked unless the stay bill is Settled.
 *  2. Blocked unless any associated body-dressing service bill is also
 *     Settled (checked independently — a body can have no service bill at
 *     all, which is fine).
 *  3. Blocked if the body is already released.
 *  4. NON_MLC releases require bodyTakenBy/relationship/address/
 *     contactNumber; MLC releases require bodyTakenBy/contactNumber/
 *     policeStationName/siName — exact field sets from source, not
 *     invented.
 */
@Injectable()
export class MortuaryBodyReleasesService {
  constructor(
    @Inject(getTenantScopedRepositoryToken(MortuaryBodyRelease))
    private readonly scopedReleaseRepo: TenantScopedRepository<MortuaryBodyRelease>,
    @Inject(getTenantScopedRepositoryToken(MortuaryBody))
    private readonly scopedBodyRepo: TenantScopedRepository<MortuaryBody>,
    @Inject(getTenantScopedRepositoryToken(MortuaryBilling))
    private readonly scopedBillingRepo: TenantScopedRepository<MortuaryBilling>,
    @Inject(getTenantScopedRepositoryToken(MortuaryServiceBilling))
    private readonly scopedServiceBillingRepo: TenantScopedRepository<MortuaryServiceBilling>,
    @Inject(getTenantScopedRepositoryToken(MortuaryCabinAllocation))
    private readonly scopedAllocationRepo: TenantScopedRepository<MortuaryCabinAllocation>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * What becomes inconsistent if this isn't atomic: the release record
   * could be inserted while the body is left "Registered", or the cabin
   * freed for cleaning without its housekeeping task ever created, or the
   * allocation's own release timestamp left unset — any of which leaves
   * the body/cabin/allocation state permanently out of sync with the fact
   * a release actually happened.
   */
  async create(tenantId: string, dto: CreateMortuaryBodyReleaseDto): Promise<{ releaseId: string }> {
    const body = await this.scopedBodyRepo.findOneBy({ id: dto.bodyId, tenantId });
    if (!body) throw new NotFoundException('Body not found');

    const invoice = await this.scopedBillingRepo.findOneBy({ tenantId, bodyId: dto.bodyId });
    if (!invoice || invoice.status !== 'Settled') {
      throw new BadRequestException('Mortuary Stay Bill must be settled before release');
    }

    const svcBill = await this.scopedServiceBillingRepo.findOneBy({ tenantId, bodyId: dto.bodyId });
    if (svcBill && svcBill.status !== 'Settled') {
      throw new BadRequestException('Body Dressing Service Bill must be settled before release');
    }

    if (body.status === 'RELEASED') {
      throw new BadRequestException('Body already released');
    }

    if (dto.caseType === 'NON_MLC') {
      const missing = !dto.bodyTakenBy ? 'bodyTakenBy' : !dto.relationship ? 'relationship' : !dto.address ? 'address' : !dto.contactNumber ? 'contactNumber' : null;
      if (missing) throw new UnprocessableEntityException(`Field ${missing} is required`);
    }
    if (dto.caseType === 'MLC') {
      const missing = !dto.bodyTakenBy ? 'bodyTakenBy' : !dto.contactNumber ? 'contactNumber' : !dto.policeStationName ? 'policeStationName' : !dto.siName ? 'siName' : null;
      if (missing) throw new UnprocessableEntityException(`Field ${missing} is required`);
    }

    const releaseId = uuidv4();
    const releaseDateTime = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.insert(MortuaryBodyRelease, {
        id: releaseId,
        tenantId,
        bodyId: dto.bodyId,
        releaseType: dto.caseType,
        takenBy: dto.bodyTakenBy ?? null,
        relationship: dto.relationship ?? null,
        address: dto.address ?? null,
        contactNumber: dto.contactNumber ?? null,
        policeStation: dto.policeStationName ?? null,
        siName: dto.siName ?? null,
        nocDocumentObjectKey: dto.nocDocumentObjectKey ?? null,
        legalDocumentsObjectKey: dto.legalDocumentsObjectKey ?? null,
        releaseDateTime,
      });

      await manager.update(MortuaryBody, { id: dto.bodyId, tenantId }, { status: 'RELEASED' });

      const allocation = await manager.findOne(MortuaryCabinAllocation, {
        where: { tenantId, bodyId: dto.bodyId },
        order: { createdAt: 'DESC' },
      });
      if (allocation) {
        await manager.update(MortuaryCabin, { id: allocation.cabinId, tenantId }, { status: 'NEEDS_CLEANING' });
        await manager.insert(MortuaryHousekeepingTask, {
          id: uuidv4(),
          tenantId,
          cabinId: allocation.cabinId,
          status: 'PENDING',
        });
        await manager.update(
          MortuaryCabinAllocation,
          { tenantId, bodyId: dto.bodyId, status: 'Allocated' },
          { releaseDateTime },
        );
      }
    });

    return { releaseId };
  }

  async findByBodyId(tenantId: string, bodyId: string): Promise<MortuaryBodyRelease | null> {
    const releases = await this.scopedReleaseRepo.find({ where: { tenantId, bodyId }, order: { createdAt: 'DESC' }, take: 1 });
    return releases[0] ?? null;
  }

  findHistory(tenantId: string): Promise<MortuaryBodyRelease[]> {
    return this.scopedReleaseRepo.find({ where: { tenantId }, order: { releaseDateTime: 'DESC' } });
  }
}
