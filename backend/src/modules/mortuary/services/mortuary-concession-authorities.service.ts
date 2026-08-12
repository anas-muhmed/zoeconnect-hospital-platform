import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MortuaryConcessionAuthority } from '../entities/mortuary-concession-authority.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { CreateMortuaryConcessionAuthorityDto } from '../dto/create-mortuary-concession-authority.dto';

/** Mortuary integration (Phase 2, Stage C). Ports `getConcessionAuthorities`/`createConcessionAuthority`/`deleteConcessionAuthority`. Tenant-scoped. */
@Injectable()
export class MortuaryConcessionAuthoritiesService {
  constructor(
    @InjectRepository(MortuaryConcessionAuthority)
    private readonly authorityRepo: Repository<MortuaryConcessionAuthority>,
    @Inject(getTenantScopedRepositoryToken(MortuaryConcessionAuthority))
    private readonly scopedAuthorityRepo: TenantScopedRepository<MortuaryConcessionAuthority>,
  ) {}

  /** Source only ever lists active ("isActive = 1") authorities. */
  findAllActive(tenantId: string): Promise<MortuaryConcessionAuthority[]> {
    return this.scopedAuthorityRepo.find({ where: { tenantId, isActive: true } });
  }

  async create(tenantId: string, dto: CreateMortuaryConcessionAuthorityDto): Promise<MortuaryConcessionAuthority> {
    const created = this.authorityRepo.create({
      tenantId,
      name: dto.name,
      designation: dto.designation ?? null,
      department: dto.department ?? null,
      maxDiscountPercent: dto.maxDiscountPercent ?? 100,
    });
    return this.authorityRepo.save(created);
  }

  /** Source: `deleteConcessionAuthority` is a soft delete (isActive = 0), not a real DELETE. */
  async deactivate(tenantId: string, id: string): Promise<void> {
    await this.scopedAuthorityRepo.update({ id, tenantId }, { isActive: false });
  }
}
