import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MortuaryServiceMaster } from '../entities/mortuary-service-master.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { CreateMortuaryServiceMasterDto } from '../dto/create-mortuary-service-master.dto';

/** Mortuary integration (Phase 2, Stage C). Ports `serviceController.js`. Tenant-scoped. */
@Injectable()
export class MortuaryServiceMasterService {
  constructor(
    @InjectRepository(MortuaryServiceMaster)
    private readonly serviceRepo: Repository<MortuaryServiceMaster>,
    @Inject(getTenantScopedRepositoryToken(MortuaryServiceMaster))
    private readonly scopedServiceRepo: TenantScopedRepository<MortuaryServiceMaster>,
  ) {}

  findAll(tenantId: string): Promise<MortuaryServiceMaster[]> {
    return this.scopedServiceRepo.find({ where: { tenantId }, order: { serviceName: 'ASC' } });
  }

  async create(tenantId: string, dto: CreateMortuaryServiceMasterDto): Promise<MortuaryServiceMaster> {
    const created = this.serviceRepo.create({
      tenantId,
      serviceName: dto.serviceName.trim(),
      tariff: dto.tariff.toFixed(2),
    });
    return this.serviceRepo.save(created);
  }

  async update(tenantId: string, id: string, dto: CreateMortuaryServiceMasterDto): Promise<MortuaryServiceMaster> {
    const existing = await this.scopedServiceRepo.findOneBy({ id, tenantId });
    if (!existing) throw new NotFoundException('Service not found');
    await this.scopedServiceRepo.update({ id, tenantId }, { serviceName: dto.serviceName.trim(), tariff: dto.tariff.toFixed(2) });
    return this.scopedServiceRepo.findOneBy({ id, tenantId }) as Promise<MortuaryServiceMaster>;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.scopedServiceRepo.delete({ id, tenantId });
  }
}
