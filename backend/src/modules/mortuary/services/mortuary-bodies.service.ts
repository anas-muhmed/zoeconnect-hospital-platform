import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MortuaryBody } from '../entities/mortuary-body.entity';
import { MortuaryHospitalProfile } from '../entities/mortuary-hospital-profile.entity';
import { MortuaryCabinAllocation } from '../entities/mortuary-cabin-allocation.entity';
import { MortuaryBilling } from '../entities/mortuary-billing.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { CreateMortuaryBodyDto, UpdateMortuaryBodyDto } from '../dto/create-mortuary-body.dto';
import { coerceFreezerRequired } from '../utils/billing-math.util';

export interface FindBodiesQuery {
  status?: string;
  bodyType?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Mortuary integration (Phase 2, Stage C). Ports `bodyController.js`'s body
 * (not concession-authority/body-type) endpoints. Tenant-scoped.
 *
 * Explicitly not ported here: the LEFT JOIN LATERAL "latest allocation"
 * join `getBodies`/`getBodyById` used for a single combined response —
 * Stage C returns the body and its latest allocation via two queries
 * instead (see `findAllWithLatestAllocation`/`findByIdWithDetails`); same
 * data, same business meaning (each body's most recent allocation), just
 * expressed as ordinary TypeORM queries rather than a hand-written lateral
 * join, which `TenantScopedRepository`'s query builder wiring doesn't need
 * to special-case. `nocCertificateUrl` handling is deferred to Stage E.
 */
@Injectable()
export class MortuaryBodiesService {
  constructor(
    @InjectRepository(MortuaryBody)
    private readonly bodyRepo: Repository<MortuaryBody>,
    @Inject(getTenantScopedRepositoryToken(MortuaryBody))
    private readonly scopedBodyRepo: TenantScopedRepository<MortuaryBody>,
    @InjectRepository(MortuaryHospitalProfile)
    private readonly hospitalProfileRepo: Repository<MortuaryHospitalProfile>,
    @Inject(getTenantScopedRepositoryToken(MortuaryCabinAllocation))
    private readonly scopedAllocationRepo: TenantScopedRepository<MortuaryCabinAllocation>,
    @Inject(getTenantScopedRepositoryToken(MortuaryBilling))
    private readonly scopedBillingRepo: TenantScopedRepository<MortuaryBilling>,
  ) {}

  /**
   * Source: `generateBodyNumber()` in `config/db.js`. Prefixed with the
   * tenant's own client_id (e.g. "SUNH8261-2026-0001"), sequence scoped
   * per tenant so every tenant starts its own count at 0001 — this is the
   * exact business rule D2 (Stage B) was approved to support.
   */
  private async generateBodyNumber(tenantId: string): Promise<string> {
    const profile = await this.hospitalProfileRepo.findOneBy({ tenantId });
    const clientId = profile?.clientId || 'HOSP';
    const year = new Date().getFullYear();
    const prefix = `${clientId}-${year}-`;

    const existing = await this.scopedBodyRepo.find({ where: { tenantId } });
    let maxNum = 0;
    for (const body of existing) {
      if (!body.bodyNumber.startsWith(prefix)) continue;
      const num = parseInt(body.bodyNumber.replace(prefix, ''), 10);
      if (!Number.isNaN(num) && num > maxNum) maxNum = num;
    }
    return `${prefix}${(maxNum + 1).toString().padStart(4, '0')}`;
  }

  async findAll(tenantId: string, query: FindBodiesQuery): Promise<{ data: MortuaryBody[]; total?: number; page?: number; limit?: number }> {
    const qb = (await this.scopedBodyRepo.createQueryBuilder('b')).andWhere('b.tenant_id = :tenantId', { tenantId });
    if (query.status) qb.andWhere('b.status = :status', { status: query.status });
    if (query.bodyType) qb.andWhere('b.bodyType = :bodyType', { bodyType: query.bodyType });
    if (query.search) {
      qb.andWhere('(b.patientName ILIKE :search OR b.bodyNumber ILIKE :search OR b.hospitalNumber ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    qb.orderBy('b.createdAt', 'DESC');

    if (query.page && query.limit) {
      const limit = Math.max(1, query.limit);
      const page = Math.max(1, query.page);
      qb.skip((page - 1) * limit).take(limit);
      const [data, total] = await qb.getManyAndCount();
      return { data, total, page, limit };
    }

    return { data: await qb.getMany() };
  }

  async findById(tenantId: string, id: string): Promise<MortuaryBody> {
    const body = await this.scopedBodyRepo.findOneBy({ id, tenantId });
    if (!body) throw new NotFoundException('Body not found');
    return body;
  }

  async findLatestAllocation(tenantId: string, bodyId: string): Promise<MortuaryCabinAllocation | null> {
    const allocations = await this.scopedAllocationRepo.find({
      where: { tenantId, bodyId },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return allocations[0] ?? null;
  }

  async findBilling(tenantId: string, bodyId: string): Promise<MortuaryBilling | null> {
    return this.scopedBillingRepo.findOneBy({ tenantId, bodyId });
  }

  /** Business rule: MLC cases require police-report fields. Source: `createBody`. */
  async create(tenantId: string, dto: CreateMortuaryBodyDto): Promise<MortuaryBody> {
    if (dto.bodyType === 'MLC') {
      if (!dto.policeStationName || !dto.stationSiName || !dto.presentPoliceOfficerName) {
        throw new BadRequestException('Police Station Name, SI Name, and Officer Name are mandatory for MLC cases.');
      }
    }

    const bodyNumber = await this.generateBodyNumber(tenantId);
    const freezerRequired = dto.bodyType === 'MLC' ? coerceFreezerRequired(dto.freezerRequired) : null;

    const created = this.bodyRepo.create({
      tenantId,
      bodyNumber,
      bodyType: dto.bodyType,
      hospitalNumber: dto.hospitalNumber ?? null,
      patientName: dto.patientName ?? null,
      gender: dto.gender ?? null,
      age: dto.age ?? null,
      locality: dto.locality ?? null,
      dateOfDeath: dto.dateOfDeath ?? null,
      timeOfDeath: dto.timeOfDeath ?? null,
      declaredBy: dto.declaredBy ?? null,
      reasonOfDeath: dto.reasonOfDeath ?? null,
      deathIntimationNo: dto.deathIntimationNo ?? null,
      mlcNo: dto.mlcNo ?? null,
      estimatedDaysOfStay: dto.estimatedDaysOfStay ?? null,
      witness1Name: dto.witness1Name ?? null,
      witness1Address: dto.witness1Address ?? null,
      witness1Contact: dto.witness1Contact ?? null,
      witness2Name: dto.witness2Name ?? null,
      witness2Address: dto.witness2Address ?? null,
      witness2Contact: dto.witness2Contact ?? null,
      policeStationName: dto.policeStationName ?? null,
      stationSiName: dto.stationSiName ?? null,
      presentPoliceOfficerName: dto.presentPoliceOfficerName ?? null,
      freezerRequired,
    });
    return this.bodyRepo.save(created);
  }

  /**
   * Source: `updateBody`'s generic field-forwarding loop is replaced by an
   * explicit, validated DTO (the OLD IMPLEMENTATION DETAIL being replaced);
   * the BUSINESS RULE it preserves is "staff can edit any of the body's own
   * fields," plus the one real bug fix already present in the source
   * (`coerceFreezerRequired` applied here too, not just on create).
   * `id`/`tenantId` are never client-settable, matching the source's own
   * explicit exclusion (moving a body to a different tenant would defeat
   * tenant isolation).
   */
  async update(tenantId: string, id: string, dto: UpdateMortuaryBodyDto): Promise<MortuaryBody> {
    const existing = await this.scopedBodyRepo.findOneBy({ id, tenantId });
    if (!existing) throw new NotFoundException('Body not found');

    const patch: Partial<MortuaryBody> = { ...dto } as Partial<MortuaryBody>;
    if (dto.freezerRequired !== undefined) {
      patch.freezerRequired = coerceFreezerRequired(dto.freezerRequired);
    }

    await this.scopedBodyRepo.update({ id, tenantId }, patch);
    return this.scopedBodyRepo.findOneBy({ id, tenantId }) as Promise<MortuaryBody>;
  }

  /** Business rule: cannot delete a body with an active cabin allocation. Source: `deleteBody`. */
  async remove(tenantId: string, id: string): Promise<void> {
    const existing = await this.scopedBodyRepo.findOneBy({ id, tenantId });
    if (!existing) throw new NotFoundException('Body not found');

    const activeAllocation = await this.scopedAllocationRepo.findOneBy({ tenantId, bodyId: id });
    if (activeAllocation) {
      throw new ConflictException('Cannot delete body with active allocations. Please release the cabin first.');
    }

    await this.scopedBodyRepo.delete({ id, tenantId });
  }

  /** Source: `getMlcRegistration`. */
  async getMlcRegistration(tenantId: string, bodyId: string): Promise<MortuaryBody> {
    const body = await this.findById(tenantId, bodyId);
    if (body.bodyType !== 'MLC') {
      throw new BadRequestException('This body is not an MLC case.');
    }
    return body;
  }
}
