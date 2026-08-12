import {
  Inject, Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EicTherapySession } from '../entities/eic-therapy-session.entity';
import { EicSessionEntry } from '../entities/eic-session-entry.entity';
import { EicGoalService } from '../goal/eic-goal.service';
import { AuditService } from '../../audit/audit.service';
import { EicSessionStatus } from '../common/enums/assessment-status.enum';
import { EicDiscipline } from '../common/enums/discipline.enum';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface CreateSessionDto {
  discipline: EicDiscipline;
  sessionDate: string;
  therapistId: string;
  therapistName: string;
  durationMinutes?: number;
  attendance?: string;
  sessionRemarks?: string;
}

export interface AddSessionEntryDto {
  goalId?: string;
  goalText: string;
  activity: string;
  childResponse: string;
  remarks?: string;
  displayOrder?: number;
}

const BACKDATE_LIMIT_DAYS = 7;

@Injectable()
export class EicSessionService {
  private readonly logger = new Logger(EicSessionService.name);

  constructor(
    @InjectRepository(EicTherapySession)
    private readonly sessionRepo: Repository<EicTherapySession>,

    @InjectRepository(EicSessionEntry)
    private readonly entryRepo: Repository<EicSessionEntry>,

    private readonly goalService: EicGoalService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,

    /**
     * Stage B (Checkpoint B3.5) — scoped repository for `findByDate()`/
     * `findByEnrollment()`/`findById()` only. Every write path (`create`,
     * `addEntry`, `updateEntry`, `deleteEntry`, `submit`) stays on
     * `sessionRepo`/`entryRepo` above.
     */
    @Inject(getTenantScopedRepositoryToken(EicTherapySession))
    private readonly scopedSessionRepo: TenantScopedRepository<EicTherapySession>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async create(enrollmentId: string, dto: CreateSessionDto, actorId: string): Promise<EicTherapySession> {
    // Enforce back-date limit
    const sessionDate = new Date(dto.sessionDate);
    const limitDate   = new Date();
    limitDate.setDate(limitDate.getDate() - BACKDATE_LIMIT_DAYS);

    if (sessionDate < limitDate) {
      throw new BadRequestException(`Sessions cannot be back-dated more than ${BACKDATE_LIMIT_DAYS} days`);
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const session = this.sessionRepo.create({
      enrollmentId,
      discipline:     dto.discipline,
      sessionDate:    dto.sessionDate,
      therapistId:    dto.therapistId,
      therapistName:  dto.therapistName,
      durationMinutes: dto.durationMinutes ?? null,
      attendance:     dto.attendance ?? 'PRESENT',
      sessionRemarks: dto.sessionRemarks ?? null,
      status:         EicSessionStatus.DRAFT,
      tenantId,
    });

    return this.sessionRepo.save(session);
  }

  /** Cross-enrollment daily view — all sessions on a given date */
  async findByDate(date: string, discipline?: EicDiscipline): Promise<EicTherapySession[]> {
    const where: any = { sessionDate: date };
    if (discipline) where.discipline = discipline;
    const sessions = await this.scopedSessionRepo.find({
      where,
      relations: ['entries'],
      order: { createdAt: 'DESC' },
    });
    // A5.5 API Contract Audit: backs GET /eic/sessions -- eager `entries`
    // relation (also carrying its own tenantId) makes an explicit
    // .select() column list impractical, so strip tenantId post-fetch.
    this.stripTenantId(sessions);
    return sessions;
  }

  async findByEnrollment(
    enrollmentId: string,
    discipline?: EicDiscipline,
    date?: string,
  ): Promise<EicTherapySession[]> {
    const where: any = { enrollmentId };
    if (discipline) where.discipline = discipline;
    if (date)       where.sessionDate = date;

    const sessions = await this.scopedSessionRepo.find({
      where,
      relations: ['entries'],
      order: { sessionDate: 'DESC', createdAt: 'DESC' },
    });
    // A5.5 API Contract Audit: backs GET /eic/enrollments/:enrollmentId/sessions.
    this.stripTenantId(sessions);
    return sessions;
  }

  async findById(id: string): Promise<EicTherapySession> {
    const session = await this.scopedSessionRepo.findOne({
      where: { id },
      relations: ['entries'],
    });
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    // A5.5 API Contract Audit: backs GET /eic/sessions/:id.
    this.stripTenantId(session);
    return session;
  }

  // ── Strip tenant_id from session(s) (+ eager entries) before it reaches a
  // GET response -- see A5.5 API Contract Audit notes above. ────────────────
  private stripTenantId(session: EicTherapySession): void;
  private stripTenantId(sessions: EicTherapySession[]): void;
  private stripTenantId(target: EicTherapySession | EicTherapySession[]): void {
    const list = Array.isArray(target) ? target : [target];
    for (const s of list) {
      delete (s as { tenantId?: string | null }).tenantId;
      for (const e of s.entries ?? []) delete (e as { tenantId?: string | null }).tenantId;
    }
  }

  async addEntry(sessionId: string, dto: AddSessionEntryDto): Promise<EicSessionEntry> {
    const session = await this.findById(sessionId);

    if (session.status !== EicSessionStatus.DRAFT) {
      throw new BadRequestException('Cannot add entries to a submitted session');
    }

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const entry = this.entryRepo.create({
      sessionId,
      goalId:       dto.goalId ?? null,
      goalText:     dto.goalText,
      activity:     dto.activity,
      childResponse: dto.childResponse,
      remarks:      dto.remarks ?? null,
      displayOrder: dto.displayOrder ?? 0,
      tenantId,
    });

    return this.entryRepo.save(entry);
  }

  async updateEntry(
    sessionId: string,
    entryId: string,
    dto: Partial<AddSessionEntryDto>,
  ): Promise<EicSessionEntry> {
    const session = await this.findById(sessionId);
    if (session.status !== EicSessionStatus.DRAFT) {
      throw new BadRequestException('Cannot edit entries in a submitted session');
    }

    const entry = await this.entryRepo.findOne({ where: { id: entryId, sessionId } });
    if (!entry) throw new NotFoundException(`Entry ${entryId} not found`);

    await this.entryRepo.update(entryId, dto as any);
    return this.entryRepo.findOneOrFail({ where: { id: entryId } });
  }

  async deleteEntry(sessionId: string, entryId: string): Promise<void> {
    const session = await this.findById(sessionId);
    if (session.status !== EicSessionStatus.DRAFT) {
      throw new BadRequestException('Cannot delete entries from a submitted session');
    }
    await this.entryRepo.delete({ id: entryId, sessionId });
  }

  async submit(sessionId: string, actorId: string): Promise<EicTherapySession> {
    const session = await this.findById(sessionId);

    if (session.status !== EicSessionStatus.DRAFT) {
      throw new BadRequestException(`Session is in ${session.status} state`);
    }

    await this.sessionRepo.update(sessionId, {
      status:      EicSessionStatus.SUBMITTED,
      submittedAt: new Date(),
    });

    // Increment goal session counters for all linked entries
    const uniqueGoalIds = [
      ...new Set(session.entries.filter((e) => e.goalId).map((e) => e.goalId!)),
    ];
    await Promise.all(uniqueGoalIds.map((id) => this.goalService.incrementSessionCount(id)));

    await this.auditService.log({
      module:     'EIC',
      action:     'EIC_SESSION_SUBMITTED',
      entityType: 'eic_therapy_sessions',
      entityId:   sessionId,
      userId: actorId,
      metadata:   { discipline: session.discipline, sessionDate: session.sessionDate },
    });

    return this.findById(sessionId);
  }
}
