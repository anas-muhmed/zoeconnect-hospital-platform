import { Inject, Injectable, Logger, Optional, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import { BackupSchedule } from '../entities/backup-schedule.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import { BackupService } from '../backup.service';
import type { CreateScheduleDto, UpdateScheduleDto } from '../dto/create-schedule.dto';

const JOB_NAME = (scheduleId: string) => `backup-schedule-${scheduleId}`;

/**
 * BackupSchedulerService — dynamic, admin-configurable (not fixed-in-code)
 * cron scheduling via `SchedulerRegistry`, per the task brief's explicit
 * guidance for this module (as opposed to a static `@Cron('...')` method).
 *
 * On module init, loads every `isActive` `BackupSchedule` row (across every
 * tenant in cloud mode — this loop itself runs once per worker process, not
 * per tenant request) and registers a `CronJob` per row. `addOrUpdate()`/
 * `remove()` are called by the schedules API so an admin's change takes
 * effect immediately, with no restart needed.
 *
 * `SchedulerRegistry` is `@Optional()` here because `ScheduleModule.forRoot()`
 * is only imported into the app's module graph when `PROCESS_ROLE !== 'api'`
 * (see app.module.ts's doc comment — a horizontally-scaled API pod must
 * never register cron, only the worker does). When it's undefined (running
 * as `PROCESS_ROLE=api`), every method here is a documented, logged no-op —
 * consistent with every other cron-based feature in this codebase, which
 * simply never fires in that role rather than crashing on missing DI.
 */
@Injectable()
export class BackupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(
    @Optional() private readonly schedulerRegistry: SchedulerRegistry | undefined,
    @InjectRepository(BackupSchedule) private readonly rawScheduleRepo: Repository<BackupSchedule>,
    @Inject(getTenantScopedRepositoryToken(BackupSchedule)) private readonly scheduleRepo: TenantScopedRepository<BackupSchedule>,
    private readonly tenantContext: TenantContextStorage,
    private readonly backupService: BackupService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.schedulerRegistry) {
      this.logger.log('SchedulerRegistry unavailable in this process (PROCESS_ROLE=api) — backup schedules will not fire here.');
      return;
    }
    const schedules = await this.rawScheduleRepo.find({ where: { isActive: true } });
    for (const schedule of schedules) {
      this.registerCronJob(schedule);
    }
    this.logger.log(`Registered ${schedules.length} active backup schedule(s).`);
  }

  private registerCronJob(schedule: BackupSchedule): void {
    if (!this.schedulerRegistry) return;
    const name = JOB_NAME(schedule.id);
    if (this.schedulerRegistry.doesExist('cron', name)) {
      this.schedulerRegistry.deleteCronJob(name);
    }
    const timezone = this.configService.get<string>('backup.cronTimezone') || 'UTC';
    const job = new CronJob(
      schedule.cronExpression,
      () => this.runSchedule(schedule.id).catch((err) => this.logger.error(`Scheduled backup ${schedule.id} failed: ${(err as Error).message}`)),
      null,
      false,
      timezone,
    );
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
  }

  private async runSchedule(scheduleId: string): Promise<void> {
    const schedule = await this.rawScheduleRepo.findOne({ where: { id: scheduleId } });
    if (!schedule || !schedule.isActive) return;

    const run = async () => {
      const job = await this.backupService.create({
        type: schedule.backupType === 'full' || schedule.backupType === 'incremental' || schedule.backupType === 'differential'
          ? schedule.backupType : 'scheduled',
        modules: schedule.modules,
        storageConfigId: schedule.storageConfigId ?? undefined,
        storageConfigIds: schedule.storageConfigIds ?? undefined,
        writeMode: schedule.writeMode ?? 'failover',
        purpose: 'scheduled',
        encrypt: schedule.encrypt,
        createdById: schedule.createdById,
      });
      await this.rawScheduleRepo.update(scheduleId, { lastRunAt: new Date(), lastBackupJobId: job.id });
    };

    if (schedule.tenantId) {
      await TenantContextStorage.run(schedule.tenantId, run);
    } else {
      await TenantContextStorage.runAsSystem(run);
    }
  }

  // ── CRUD (called by BackupController) ────────────────────────────────────

  async create(dto: CreateScheduleDto, createdById?: string | null): Promise<BackupSchedule> {
    this.assertValidCron(dto.cronExpression);
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const entity = this.rawScheduleRepo.create({
      tenantId,
      name: dto.name,
      cronExpression: dto.cronExpression,
      backupType: dto.backupType ?? 'full',
      modules: dto.modules ?? ['database', 'files', 'configuration'],
      storageConfigId: dto.storageConfigId ?? null,
      storageConfigIds: dto.storageConfigIds ?? null,
      writeMode: dto.writeMode ?? 'failover',
      retentionCount: dto.retentionCount ?? null,
      retentionDays: dto.retentionDays ?? null,
      encrypt: dto.encrypt ?? false,
      isActive: dto.isActive ?? true,
      createdById: createdById ?? null,
    });
    const saved = await this.rawScheduleRepo.save(entity);
    if (saved.isActive) this.registerCronJob(saved);
    return saved;
  }

  async update(id: string, dto: UpdateScheduleDto): Promise<BackupSchedule> {
    const existing = await this.scheduleRepo.findOne({ where: { id } });
    if (!existing) throw new BadRequestException(`Schedule ${id} not found`);
    if (dto.cronExpression) this.assertValidCron(dto.cronExpression);

    await this.rawScheduleRepo.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.cronExpression !== undefined && { cronExpression: dto.cronExpression }),
      ...(dto.backupType !== undefined && { backupType: dto.backupType }),
      ...(dto.modules !== undefined && { modules: dto.modules }),
      ...(dto.storageConfigId !== undefined && { storageConfigId: dto.storageConfigId }),
      ...(dto.storageConfigIds !== undefined && { storageConfigIds: dto.storageConfigIds }),
      ...(dto.writeMode !== undefined && { writeMode: dto.writeMode }),
      ...(dto.retentionCount !== undefined && { retentionCount: dto.retentionCount }),
      ...(dto.retentionDays !== undefined && { retentionDays: dto.retentionDays }),
      ...(dto.encrypt !== undefined && { encrypt: dto.encrypt }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    const updated = await this.rawScheduleRepo.findOne({ where: { id } });
    if (!updated) throw new BadRequestException(`Schedule ${id} not found after update`);

    if (updated.isActive) {
      this.registerCronJob(updated);
    } else if (this.schedulerRegistry?.doesExist('cron', JOB_NAME(id))) {
      this.schedulerRegistry.deleteCronJob(JOB_NAME(id));
    }
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.scheduleRepo.delete({ id });
    if (this.schedulerRegistry?.doesExist('cron', JOB_NAME(id))) {
      this.schedulerRegistry.deleteCronJob(JOB_NAME(id));
    }
  }

  async findAll(): Promise<BackupSchedule[]> {
    return this.scheduleRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<BackupSchedule | null> {
    return this.scheduleRepo.findOne({ where: { id } });
  }

  /**
   * Health check for BackupHealthCheckService's "Run Health Check" (point 7
   * of the review): confirms the scheduler is actually running, not just
   * that schedule rows exist -- compares the count of `isActive` schedule
   * rows against how many of them actually have a live `CronJob` registered
   * in `SchedulerRegistry`. In the `PROCESS_ROLE=api` deployment (no
   * SchedulerRegistry -- see this class's own doc comment), this correctly
   * reports `running: false` rather than silently claiming health, since
   * schedules genuinely do not fire from that process role.
   */
  async getSchedulerHealth(): Promise<{ running: boolean; activeSchedules: number; registeredCronJobs: number; message: string }> {
    const activeSchedules = await this.rawScheduleRepo.count({ where: { isActive: true } });

    if (!this.schedulerRegistry) {
      return {
        running: false,
        activeSchedules,
        registeredCronJobs: 0,
        message: 'SchedulerRegistry is unavailable in this process (PROCESS_ROLE=api) -- schedules only fire from the worker process.',
      };
    }

    const rows = await this.rawScheduleRepo.find({ where: { isActive: true } });
    const registeredCronJobs = rows.filter((r) => this.schedulerRegistry!.doesExist('cron', JOB_NAME(r.id))).length;
    const running = registeredCronJobs === activeSchedules;

    return {
      running,
      activeSchedules,
      registeredCronJobs,
      message: running
        ? `${registeredCronJobs} of ${activeSchedules} active schedule(s) have a registered cron job.`
        : `Mismatch: ${registeredCronJobs} of ${activeSchedules} active schedule(s) have a registered cron job -- some schedules may not fire until the worker process is restarted or the schedule is re-saved.`,
    };
  }

  private assertValidCron(expression: string): void {
    try {
      // Constructing (without starting) validates the expression via the
      // 'cron' package's own parser -- throws on malformed input.
      // eslint-disable-next-line no-new
      new CronJob(expression, () => undefined);
    } catch (err) {
      throw new BadRequestException(`Invalid cron expression '${expression}': ${(err as Error).message}`);
    }
  }
}
