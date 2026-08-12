import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CMSPlaylistSchedule } from '../entities/cms-playlist-schedule.entity';
import { CmsAuditService } from '../audit/cms-audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface ScheduleInput {
  name: string;
  playlistId: string;
  startTime?: string | null;
  endTime?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  priority?: number;
  isActive?: boolean;
}

export interface ResolvedPlaylist {
  playlistId: string | null;
  scheduleId: string | null;
}

@Injectable()
export class CmsScheduleService {
  constructor(
    @InjectRepository(CMSPlaylistSchedule)
    private readonly scheduleRepo: Repository<CMSPlaylistSchedule>,
    private readonly auditService: CmsAuditService,

    /**
     * Stage B (Checkpoint B3.6) — scoped repository for `findOne()` only.
     * `listForDisplay()` stays raw — shared with the anonymous
     * `resolveActivePlaylist()` chain (chain-resolved, deferred to B5), so
     * the whole method is disqualified from B3 even though it's also called
     * from a session-resolved route. Every write path stays raw too.
     */
    @Inject(getTenantScopedRepositoryToken(CMSPlaylistSchedule))
    private readonly scopedScheduleRepo: TenantScopedRepository<CMSPlaylistSchedule>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // A5.5 API Contract Audit: backs both the admin GET
  // displays/:displayId/schedules route and the anonymous
  // resolveActivePlaylist() chain (only playlistId/id are read off the
  // result there, so excluding tenantId doesn't affect that path). Explicit
  // select excludes tenantId either way.
  async listForDisplay(displayAssignmentId: string): Promise<CMSPlaylistSchedule[]> {
    return this.scheduleRepo.find({
      where: { displayAssignmentId },
      order: { priority: 'DESC', createdAt: 'ASC' },
      select: [
        'id', 'displayAssignmentId', 'playlistId', 'name', 'startTime', 'endTime',
        'startDate', 'endDate', 'priority', 'isActive', 'createdBy', 'createdAt', 'updatedAt',
      ],
    });
  }

  async findOne(id: string): Promise<CMSPlaylistSchedule> {
    const schedule = await this.scopedScheduleRepo.findOne({ where: { id } });
    if (!schedule) throw new NotFoundException(`Schedule "${id}" not found`);
    return schedule;
  }

  private validate(data: ScheduleInput): void {
    if (data.startTime && data.endTime === undefined) return;
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
      throw new BadRequestException('Start date must be on or before end date');
    }
  }

  async create(displayAssignmentId: string, data: ScheduleInput, createdBy: string): Promise<CMSPlaylistSchedule> {
    this.validate(data);
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const schedule = this.scheduleRepo.create({
      displayAssignmentId,
      playlistId: data.playlistId,
      name: data.name,
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      priority: data.priority ?? 0,
      isActive: data.isActive ?? true,
      createdBy,
      tenantId,
    });
    const saved = await this.scheduleRepo.save(schedule);
    await this.auditService.log({
      entityType: 'CMSPlaylistSchedule', entityId: saved.id, action: 'CREATE',
      changedBy: createdBy, summary: `Created schedule "${saved.name}" for display ${displayAssignmentId}`,
    });
    return saved;
  }

  async update(id: string, data: Partial<ScheduleInput>, changedBy = 'unknown'): Promise<CMSPlaylistSchedule> {
    const schedule = await this.findOne(id);
    this.validate({ ...schedule, ...data } as ScheduleInput);

    if (data.name !== undefined) schedule.name = data.name;
    if (data.playlistId !== undefined) schedule.playlistId = data.playlistId;
    if (data.startTime !== undefined) schedule.startTime = data.startTime;
    if (data.endTime !== undefined) schedule.endTime = data.endTime;
    if (data.startDate !== undefined) schedule.startDate = data.startDate;
    if (data.endDate !== undefined) schedule.endDate = data.endDate;
    if (data.priority !== undefined) schedule.priority = data.priority;
    if (data.isActive !== undefined) schedule.isActive = data.isActive;

    const saved = await this.scheduleRepo.save(schedule);
    await this.auditService.log({
      entityType: 'CMSPlaylistSchedule', entityId: id, action: 'UPDATE',
      changedBy, summary: `Updated schedule "${saved.name}"`,
    });
    return saved;
  }

  async remove(id: string, changedBy = 'unknown'): Promise<void> {
    const schedule = await this.findOne(id);
    await this.scheduleRepo.remove(schedule);
    await this.auditService.log({
      entityType: 'CMSPlaylistSchedule', entityId: id, action: 'DELETE',
      changedBy, summary: `Deleted schedule "${schedule.name}"`,
    });
  }

  /**
   * Returns whether `schedule` is active at instant `now`, evaluating the
   * date range (inclusive, date-only) and the time-of-day window (inclusive,
   * with support for windows that wrap past midnight, e.g. 22:00-06:00).
   */
  isActiveNow(schedule: CMSPlaylistSchedule, now: Date): boolean {
    if (!schedule.isActive) return false;

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD (local time)
    if (schedule.startDate && dateStr < schedule.startDate) return false;
    if (schedule.endDate && dateStr > schedule.endDate) return false;

    if (!schedule.startTime && !schedule.endTime) return true;

    const timeStr = now.toTimeString().slice(0, 8); // HH:MM:SS
    const start = schedule.startTime ?? '00:00:00';
    const end = schedule.endTime ?? '23:59:59';

    if (start <= end) {
      return timeStr >= start && timeStr <= end;
    }
    // Overnight window (e.g. 22:00 -> 06:00)
    return timeStr >= start || timeStr <= end;
  }

  /**
   * Resolves which playlist should currently play for a display, given its
   * schedules. Among schedules active right now, the highest `priority`
   * wins (ties broken by earliest created). Returns { playlistId: null,
   * scheduleId: null } if no schedule is active -- the caller (CmsDisplayService)
   * falls back to the display's plain assignment.playlistId in that case.
   */
  async resolveActivePlaylist(displayAssignmentId: string, now: Date = new Date()): Promise<ResolvedPlaylist> {
    const schedules = await this.listForDisplay(displayAssignmentId);
    const active = schedules.filter(s => this.isActiveNow(s, now));
    if (active.length === 0) return { playlistId: null, scheduleId: null };

    const winner = active[0]; // already sorted priority DESC, createdAt ASC
    return { playlistId: winner.playlistId, scheduleId: winner.id };
  }
}
