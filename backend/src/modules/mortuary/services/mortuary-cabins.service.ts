import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MortuaryCabin } from '../entities/mortuary-cabin.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { CreateMortuaryCabinDto } from '../dto/create-mortuary-cabin.dto';
import { UpdateMortuaryCabinDto } from '../dto/update-mortuary-cabin.dto';

/** Mortuary integration (Phase 2, Stage C). Ports `cabinController.js`. Tenant-scoped. */
@Injectable()
export class MortuaryCabinsService {
  constructor(
    @InjectRepository(MortuaryCabin)
    private readonly cabinRepo: Repository<MortuaryCabin>,
    @Inject(getTenantScopedRepositoryToken(MortuaryCabin))
    private readonly scopedCabinRepo: TenantScopedRepository<MortuaryCabin>,
  ) {}

  findAll(tenantId: string): Promise<MortuaryCabin[]> {
    return this.scopedCabinRepo.find({ where: { tenantId }, order: { cabinNumber: 'ASC' } });
  }

  async create(tenantId: string, dto: CreateMortuaryCabinDto): Promise<MortuaryCabin> {
    const resolvedType = dto.cabinType === 'FREEZER' ? 'FREEZER' : 'NORMAL_CABIN';
    const resolvedDailyRate = dto.dailyRate ?? dto.tariff ?? 500;
    const created = this.cabinRepo.create({
      tenantId,
      cabinNumber: dto.cabinNumber,
      tariff: dto.tariff ?? 500,
      dailyRate: String(resolvedDailyRate),
      floor: dto.floor ?? 1,
      cabinType: resolvedType,
    });
    return this.cabinRepo.save(created);
  }

  async update(tenantId: string, id: string, dto: UpdateMortuaryCabinDto): Promise<MortuaryCabin> {
    const existing = await this.scopedCabinRepo.findOneBy({ id, tenantId });
    if (!existing) throw new NotFoundException('Cabin not found');

    const resolvedType = dto.cabinType === 'FREEZER' ? 'FREEZER' : 'NORMAL_CABIN';
    const resolvedDailyRate = dto.dailyRate ?? dto.tariff ?? Number(existing.dailyRate ?? 500);

    await this.scopedCabinRepo.update(
      { id, tenantId },
      {
        cabinNumber: dto.cabinNumber ?? existing.cabinNumber,
        status: dto.status ?? existing.status,
        tariff: dto.tariff ?? existing.tariff,
        dailyRate: String(resolvedDailyRate),
        floor: dto.floor ?? existing.floor,
        cabinType: dto.cabinType ? resolvedType : existing.cabinType,
      },
    );
    return this.scopedCabinRepo.findOneBy({ id, tenantId }) as Promise<MortuaryCabin>;
  }

  /** Source: `deleteCabin` — soft delete only; blocked while Occupied. */
  async deactivate(tenantId: string, id: string): Promise<void> {
    const existing = await this.scopedCabinRepo.findOneBy({ id, tenantId });
    if (!existing) throw new NotFoundException('Cabin not found');
    if (existing.status === 'Occupied') {
      throw new ConflictException('This cabin is currently occupied and cannot be deleted. Release the body first.');
    }
    await this.scopedCabinRepo.update({ id, tenantId }, { status: 'Deactivated' });
  }
}
