import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CMSTickerMessage, CmsTickerSourceType } from '../entities/cms-ticker-message.entity';
import { CMSDisplayAssignment } from '../entities/cms-display-assignment.entity';
import { CmsAuditService } from '../audit/cms-audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';

export interface TickerMessageInput {
  text: string;
  sourceType?: CmsTickerSourceType;
  sourceRef?: string | null;
  priority?: number;
  startTime?: string | null;
  endTime?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
}

export interface ResolvedTicker {
  enabled: boolean;
  position: 'top' | 'bottom';
  speed: number;
  backgroundColor: string | null;
  textColor: string | null;
  fontSize: number;
  separator: string;
  messages: { id: string; text: string; sourceType: CmsTickerSourceType }[];
}

@Injectable()
export class CmsTickerService {
  constructor(
    @InjectRepository(CMSTickerMessage)
    private readonly messageRepo: Repository<CMSTickerMessage>,
    @InjectRepository(CMSDisplayAssignment)
    private readonly assignmentRepo: Repository<CMSDisplayAssignment>,
    private readonly auditService: CmsAuditService,

    /**
     * Stage B (Checkpoint B3.6) — scoped repository for `findOne()` only,
     * used as a write-adjacent read inside `update()`/`remove()` (both
     * session-resolved routes). `listForDisplay()` stays raw — shared with
     * the anonymous `resolveActiveMessages()` chain (chain-resolved,
     * deferred to B5). `getForPlayer()`'s own `assignmentRepo.findOne()`
     * call stays on the raw repo too — different call site, chain-resolved.
     */
    @Inject(getTenantScopedRepositoryToken(CMSTickerMessage))
    private readonly scopedMessageRepo: TenantScopedRepository<CMSTickerMessage>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring the
    // pattern proven in AuditService.log().
    private readonly tenantContext: TenantContextStorage,
  ) {}

  // -- Admin: message CRUD --------------------------------------------------------

  // A5.5 API Contract Audit: backs both the admin GET
  // displays/:displayId/ticker-messages route and the anonymous
  // resolveActiveMessages()/getForPlayer() chain (only id/text/sourceType
  // are read off the result there, so excluding tenantId doesn't affect that
  // path). Explicit select excludes tenantId either way.
  async listForDisplay(displayAssignmentId: string): Promise<CMSTickerMessage[]> {
    return this.messageRepo.find({
      where: { displayAssignmentId },
      order: { priority: 'DESC', createdAt: 'ASC' },
      select: [
        'id', 'displayAssignmentId', 'text', 'sourceType', 'sourceRef', 'priority',
        'startTime', 'endTime', 'startDate', 'endDate', 'isActive', 'createdBy',
        'createdAt', 'updatedAt',
      ],
    });
  }

  async findOne(id: string): Promise<CMSTickerMessage> {
    const message = await this.scopedMessageRepo.findOne({ where: { id } });
    if (!message) throw new NotFoundException(`Ticker message "${id}" not found`);
    return message;
  }

  private validate(data: Pick<TickerMessageInput, 'startDate' | 'endDate'>): void {
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
      throw new BadRequestException('Start date must be on or before end date');
    }
  }

  async create(displayAssignmentId: string, data: TickerMessageInput, createdBy: string): Promise<CMSTickerMessage> {
    this.validate(data);
    if (!data.text || !data.text.trim()) throw new BadRequestException('Ticker message text is required');

    // Fail-fast, not currentTenantIdOrNull() — see requireTenantContext()'s
    // doc comment; same tenant-owned-write incident as CMS Displays.
    const tenantId = await this.tenantContext.requireTenantContext();
    const message = this.messageRepo.create({
      displayAssignmentId,
      text: data.text,
      sourceType: data.sourceType ?? 'MANUAL',
      sourceRef: data.sourceRef ?? null,
      priority: data.priority ?? 0,
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      isActive: data.isActive ?? true,
      createdBy,
      tenantId,
    });
    const saved = await this.messageRepo.save(message);
    await this.auditService.log({
      entityType: 'CMSTickerMessage', entityId: saved.id, action: 'CREATE',
      changedBy: createdBy, summary: `Added ticker message to display ${displayAssignmentId}: "${saved.text.slice(0, 60)}"`,
    });
    return saved;
  }

  async update(id: string, data: Partial<TickerMessageInput>, changedBy = 'unknown'): Promise<CMSTickerMessage> {
    const message = await this.findOne(id);
    this.validate({ startDate: data.startDate ?? message.startDate, endDate: data.endDate ?? message.endDate });

    if (data.text !== undefined) message.text = data.text;
    if (data.sourceType !== undefined) message.sourceType = data.sourceType;
    if (data.sourceRef !== undefined) message.sourceRef = data.sourceRef;
    if (data.priority !== undefined) message.priority = data.priority;
    if (data.startTime !== undefined) message.startTime = data.startTime;
    if (data.endTime !== undefined) message.endTime = data.endTime;
    if (data.startDate !== undefined) message.startDate = data.startDate;
    if (data.endDate !== undefined) message.endDate = data.endDate;
    if (data.isActive !== undefined) message.isActive = data.isActive;

    const saved = await this.messageRepo.save(message);
    await this.auditService.log({
      entityType: 'CMSTickerMessage', entityId: id, action: 'UPDATE',
      changedBy, summary: `Updated ticker message "${saved.text.slice(0, 60)}"`,
    });
    return saved;
  }

  async remove(id: string, changedBy = 'unknown'): Promise<void> {
    const message = await this.findOne(id);
    await this.messageRepo.remove(message);
    await this.auditService.log({
      entityType: 'CMSTickerMessage', entityId: id, action: 'DELETE',
      changedBy, summary: `Deleted ticker message "${message.text.slice(0, 60)}"`,
    });
  }

  // -- Resolution (shared logic, reused by both admin preview and the player) ----

  /**
   * Whether `message` is active at instant `now` -- identical window
   * semantics to CmsScheduleService.isActiveNow (inclusive date range,
   * inclusive time-of-day window with support for windows that wrap past
   * midnight), kept as its own copy here rather than a shared util so the
   * two schedule concepts (playlist schedule vs. ticker message) can evolve
   * independently without coupling their entities.
   */
  isActiveNow(message: CMSTickerMessage, now: Date): boolean {
    if (!message.isActive) return false;

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    if (message.startDate && dateStr < message.startDate) return false;
    if (message.endDate && dateStr > message.endDate) return false;

    if (!message.startTime && !message.endTime) return true;

    const timeStr = now.toTimeString().slice(0, 8);
    const start = message.startTime ?? '00:00:00';
    const end = message.endTime ?? '23:59:59';

    if (start <= end) return timeStr >= start && timeStr <= end;
    return timeStr >= start || timeStr <= end; // overnight window
  }

  /** All currently-active messages for a display, highest priority first. */
  async resolveActiveMessages(displayAssignmentId: string, now: Date = new Date()): Promise<CMSTickerMessage[]> {
    const messages = await this.listForDisplay(displayAssignmentId);
    return messages.filter(m => this.isActiveNow(m, now));
  }

  // -- Player-facing (public, unauthenticated) ------------------------------------

  /**
   * Production incident fix (2026-08 — "CMS Player is global instead of
   * tenant-scoped"): found during the follow-up audit of that incident as a
   * sibling gap to `CmsDisplayService.findBySlug()` -- this method is reached
   * from the same public, unauthenticated `player/:slug/*` route family, but
   * was missed in the original fix. Before that fix, `slug` was globally
   * unique, so an unscoped `findOne({ slug })` always resolved the one
   * correct row; now that `(tenant_id, slug)` is the real constraint (two
   * tenants can both register "main"), leaving this unscoped would let a
   * player on Tenant A's hostname receive Tenant B's ticker style/messages
   * whenever both happened to share a slug. `tenantId` is sourced from
   * `req.tenantId`, already resolved on every request by
   * `SubdomainTenantMiddleware` -- see `CmsDisplayController._tenantId()`
   * for the full rationale, mirrored here.
   */
  async getForPlayer(slug: string, tenantId: string): Promise<ResolvedTicker> {
    const assignment = await this.assignmentRepo.findOne({ where: { slug, tenantId } });
    if (!assignment || !assignment.tickerEnabled) {
      return {
        enabled: false, position: 'bottom', speed: 3, backgroundColor: null, textColor: null,
        fontSize: 1.4, separator: '     •     ', messages: [],
      };
    }

    const active = await this.resolveActiveMessages(assignment.id);
    return {
      enabled: true,
      position: assignment.tickerPosition,
      speed: Number(assignment.tickerSpeed),
      backgroundColor: assignment.tickerBackgroundColor,
      textColor: assignment.tickerTextColor,
      fontSize: Number(assignment.tickerFontSize),
      separator: assignment.tickerSeparator,
      messages: active.map(m => ({ id: m.id, text: m.text, sourceType: m.sourceType })),
    };
  }
}
