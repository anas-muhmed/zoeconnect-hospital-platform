import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MortuaryHousekeepingTask } from '../entities/mortuary-housekeeping-task.entity';
import { MortuaryCabin } from '../entities/mortuary-cabin.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';

/** Mortuary integration (Phase 2, Stage C). Ports `housekeepingController.js`. Tenant-scoped. */
@Injectable()
export class MortuaryHousekeepingService {
  constructor(
    @Inject(getTenantScopedRepositoryToken(MortuaryHousekeepingTask))
    private readonly scopedTaskRepo: TenantScopedRepository<MortuaryHousekeepingTask>,
    @Inject(getTenantScopedRepositoryToken(MortuaryCabin))
    private readonly scopedCabinRepo: TenantScopedRepository<MortuaryCabin>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: string): Promise<MortuaryHousekeepingTask[]> {
    return this.scopedTaskRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async assign(tenantId: string, taskId: string, staffName: string): Promise<void> {
    const task = await this.scopedTaskRepo.findOneBy({ id: taskId, tenantId });
    if (!task) throw new NotFoundException('Task not found');
    await this.scopedTaskRepo.update({ id: taskId, tenantId }, { assignedTo: staffName, status: 'IN_PROGRESS' });
  }

  async complete(tenantId: string, taskId: string): Promise<void> {
    const task = await this.scopedTaskRepo.findOneBy({ id: taskId, tenantId });
    if (!task) throw new NotFoundException('Task not found');
    await this.scopedTaskRepo.update({ id: taskId, tenantId }, { status: 'COMPLETED' });
  }

  /**
   * What becomes inconsistent if this isn't atomic: the task could be
   * marked VERIFIED while the cabin stays stuck in NEEDS_CLEANING forever
   * (or the cabin freed up while its verification task never completes),
   * either of which desyncs the two states this single business action is
   * meant to keep in lockstep.
   */
  async verify(tenantId: string, taskId: string): Promise<void> {
    const task = await this.scopedTaskRepo.findOneBy({ id: taskId, tenantId });
    if (!task) throw new NotFoundException('Task not found');

    await this.dataSource.transaction(async (manager) => {
      await manager.update(MortuaryHousekeepingTask, { id: taskId, tenantId }, { status: 'VERIFIED' });
      await manager.update(MortuaryCabin, { id: task.cabinId, tenantId }, { status: 'Available' });
    });
  }
}
