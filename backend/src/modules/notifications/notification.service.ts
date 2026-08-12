import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, ILike } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NotificationLog }      from './entities/notification-log.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import type { NotificationPayload, NotificationEventType, NotificationChannel } from './notification.types';
import { QUEUE_NAMES }          from '../../config/redis.config';
import type { CreateTemplateDto, UpdateTemplateDto } from './dto/notification.dto';
import { getTenantScopedRepositoryToken } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';

export interface PaginatedLogs {
  data: NotificationLog[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationLog)
    private readonly logRepo: Repository<NotificationLog>,
    @InjectRepository(NotificationTemplate)
    private readonly templateRepo: Repository<NotificationTemplate>,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly notifQueue: Queue,
    /**
     * Stage B (Checkpoint B3.1) — scoped repositories for the four
     * GET-backing read methods only (`findLogs`, `findLogById`,
     * `findTemplates`, `findTemplate`). `logRepo`/`templateRepo` above stay
     * exactly as they were and remain the only repositories used by every
     * write path (`send`, `resend`, `createTemplate`, `updateTemplate`,
     * `markSent`, `markFailed`, `incrementAttempts`) and by the internal
     * `findTemplateForEvent` read (not one of the controller's GET routes,
     * so out of this checkpoint's scope per the B3.1 boundary). Started in
     * `mode: 'dry-run'` via `notification.module.ts`.
     */
    @Inject(getTenantScopedRepositoryToken(NotificationLog))
    private readonly scopedLogRepo: TenantScopedRepository<NotificationLog>,
    @Inject(getTenantScopedRepositoryToken(NotificationTemplate))
    private readonly scopedTemplateRepo: TenantScopedRepository<NotificationTemplate>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // ── Send (enqueue) ────────────────────────────────────────────────────────

  /**
   * Create a PENDING log entry then enqueue for async delivery.
   * Returns immediately — delivery is fire-and-forget via BullMQ.
   */
  async send(payload: NotificationPayload): Promise<NotificationLog> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const log = this.logRepo.create({
      phone:             payload.phone,
      channel:           payload.channel,
      eventType:         payload.eventType,
      templateName:      payload.templateName,
      languageCode:      payload.languageCode ?? 'en_US',
      templateParams:    payload.templateParams,
      loyaltyAccountId:  payload.loyaltyAccountId ?? null,
      mrn:               payload.mrn ?? null,
      metadata:          payload.metadata ?? null,
      status:            'PENDING',
      attempts:          0,
      tenantId,
    });

    const saved = await this.logRepo.save(log);

    await this.notifQueue.add(
      'send-notification',
      { logId: saved.id, payload },
      {
        attempts:        3,
        backoff:         { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail:    50,
      },
    );

    this.logger.log(`Notification enqueued: ${payload.eventType} → ${payload.phone} [logId=${saved.id}]`);
    return saved;
  }

  /**
   * Resend a failed notification by re-enqueuing with a fresh attempt.
   */
  async resend(logId: string): Promise<NotificationLog> {
    const log = await this.logRepo.findOne({ where: { id: logId } });
    if (!log) throw new NotFoundException(`Notification log ${logId} not found`);

    await this.logRepo.update(logId, { status: 'PENDING', errorMessage: null });

    const payload: NotificationPayload = {
      phone:            log.phone,
      channel:          log.channel,
      eventType:        log.eventType,
      templateName:     log.templateName,
      languageCode:     log.languageCode,
      templateParams:   log.templateParams,
      loyaltyAccountId: log.loyaltyAccountId ?? undefined,
      mrn:              log.mrn ?? undefined,
      metadata:         log.metadata ?? undefined,
    };

    await this.notifQueue.add('send-notification', { logId, payload }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`Notification re-enqueued: logId=${logId}`);
    return this.logRepo.findOne({ where: { id: logId } }) as Promise<NotificationLog>;
  }

  // ── Log queries ───────────────────────────────────────────────────────────

  async findLogs(opts: {
    page?: number;
    limit?: number;
    phone?: string;
    eventType?: NotificationEventType;
    channel?: NotificationChannel;
    status?: string;
    loyaltyAccountId?: string;
  }): Promise<PaginatedLogs> {
    const page  = opts.page  ?? 1;
    const limit = Math.min(opts.limit ?? 20, 100);
    const skip  = (page - 1) * limit;

    const where: FindOptionsWhere<NotificationLog> = {};
    if (opts.phone)            where.phone = opts.phone;
    if (opts.eventType)        where.eventType = opts.eventType;
    if (opts.channel)          where.channel = opts.channel;
    if (opts.status)           where.status = opts.status as NotificationLog['status'];
    if (opts.loyaltyAccountId) where.loyaltyAccountId = opts.loyaltyAccountId;

    const [data, total] = await this.scopedLogRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    return { data, total, page, limit };
  }

  async findLogById(id: string): Promise<NotificationLog> {
    const log = await this.scopedLogRepo.findOne({ where: { id } });
    if (!log) throw new NotFoundException(`Notification log ${id} not found`);
    return log;
  }

  // ── Template CRUD ─────────────────────────────────────────────────────────

  async findTemplates(activeOnly = false): Promise<NotificationTemplate[]> {
    const templates = await this.scopedTemplateRepo.find({
      where: activeOnly ? { isActive: true } : {},
      order: { eventType: 'ASC', channel: 'ASC' },
    });
    // A5.5 API Contract Audit: unfiltered find() leaks tenantId into the GET
    // response; PATCH /notifications/templates/:id uses the strict-whitelist
    // UpdateTemplateDto, so a client that round-trips this object gets
    // rejected with "property tenantId should not exist" -- same failure
    // class found live on feedback_settings. Strip post-fetch.
    for (const t of templates) delete (t as { tenantId?: string | null }).tenantId;
    return templates;
  }

  async findTemplate(id: string): Promise<NotificationTemplate> {
    const t = await this.scopedTemplateRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    delete (t as { tenantId?: string | null }).tenantId;
    return t;
  }

  async findTemplateForEvent(
    eventType: NotificationEventType,
    channel: NotificationChannel,
  ): Promise<NotificationTemplate | null> {
    return this.templateRepo.findOne({ where: { eventType, channel, isActive: true } });
  }

  async createTemplate(dto: CreateTemplateDto): Promise<NotificationTemplate> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const t = this.templateRepo.create({
      name:              dto.name,
      eventType:         dto.eventType,
      channel:           dto.channel,
      templateName:      dto.templateName,
      languageCode:      dto.languageCode ?? 'en_US',
      paramDescriptions: dto.paramDescriptions ?? [],
      bodyPreview:       dto.bodyPreview ?? null,
      isActive:          dto.isActive ?? true,
      tenantId,
    });
    return this.templateRepo.save(t);
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto): Promise<NotificationTemplate> {
    await this.findTemplate(id);
    await this.templateRepo.update(id, {
      ...(dto.name              !== undefined && { name: dto.name }),
      ...(dto.templateName      !== undefined && { templateName: dto.templateName }),
      ...(dto.languageCode      !== undefined && { languageCode: dto.languageCode }),
      ...(dto.paramDescriptions !== undefined && { paramDescriptions: dto.paramDescriptions }),
      ...(dto.bodyPreview       !== undefined && { bodyPreview: dto.bodyPreview }),
      ...(dto.isActive          !== undefined && { isActive: dto.isActive }),
    });
    return this.findTemplate(id);
  }

  // ── Internal: update log after send attempt ───────────────────────────────

  async markSent(logId: string, providerMessageId: string): Promise<void> {
    await this.logRepo.update(logId, {
      status: 'SENT',
      providerMessageId,
      errorMessage: null,
    });
  }

  async markFailed(logId: string, errorMessage: string, attempts: number): Promise<void> {
    await this.logRepo.update(logId, {
      status: 'FAILED',
      errorMessage,
      attempts,
    });
  }

  async incrementAttempts(logId: string): Promise<void> {
    await this.logRepo.increment({ id: logId }, 'attempts', 1);
  }
}
