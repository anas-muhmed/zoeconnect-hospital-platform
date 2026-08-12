import {
  Inject, Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TokenRecord, TokenStatus, RecordReferenceType, TokenType,
} from '../entities/token-record.entity';
import { TokenKiosk } from '../entities/token-kiosk.entity';
import { TokenSequenceService } from './token-sequence.service';
import { TokenAuditService } from '../audit/token-audit.service';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { ChainTenantResolver } from '../../platform/tenant/resolvers/chain-tenant.resolver';

const PRIORITY_MAP: Record<TokenType, number> = {
  EMERGENCY:   10,
  APPOINTMENT: 30,
  VIP:         50,
  ONLINE:      70,
  WALK_IN:     100,
};

@Injectable()
export class TokenQueueService {
  constructor(
    @InjectRepository(TokenRecord)
    private readonly recordRepo: Repository<TokenRecord>,

    @InjectRepository(TokenKiosk)
    private readonly kioskRepo: Repository<TokenKiosk>,

    private readonly sequenceService: TokenSequenceService,
    private readonly auditService: TokenAuditService,

    /**
     * Stage B (Checkpoint B3.8) — scoped repository for `findActive()` only,
     * a private write-adjacent helper shared by every state-transition write
     * (`callToken`/`serveToken`/`completeToken`/`holdToken`/`skipToken`/
     * `missToken`/`cancelToken`/`transferToken`/`recallToken`/`reissueToken`),
     * all reached exclusively via `TokenQueueController`'s session-resolved
     * operator routes. `issueToken()`/`issueFromKiosk()`/`getWaitingQueue()`/
     * `getWaitingCount()`/`getRecentCalled()`/`callTokenRecord()` stay raw —
     * the first three are chain-resolved (public kiosk routes), the read
     * methods are chain-resolved-only (public queue-state route), and
     * `callTokenRecord()` is a best-effort gateway bridge with no repository
     * read of its own worth scoping.
     */
    @Inject(getTenantScopedRepositoryToken(TokenRecord))
    private readonly scopedRecordRepo: TenantScopedRepository<TokenRecord>,

    // Stage B (Checkpoint B5) — issueToken()/issueFromKiosk() are reachable
    // from both an authenticated internal-issue route and the fully public
    // kiosk walk-up flow (no session in the latter case). Both already carry
    // a server-resolved branchId by the time they reach issueToken() (never
    // trusted from raw client input), so tenant is stamped here directly via
    // the chain-derived resolver rather than relying on ambient session
    // context, which the public path doesn't have anyway.
    private readonly chainResolver: ChainTenantResolver,
  ) {}

  // -- Issue ----------------------------------------------------------------

  /**
   * Issue a new token for a location or service center.
   * Creates a persistent TokenRecord and increments the daily sequence.
   * Returns the record plus rollover metadata (GAP-20).
   */
  async issueToken(opts: {
    branchId:      string;
    referenceType: RecordReferenceType;
    referenceId:   string;
    tokenType?:    TokenType;
    kioskId?:      string | null;
    appointmentId?: string | null;
  }): Promise<{ record: TokenRecord; rolledOver: boolean; maxNumber: number; startNumber: number }> {
    const tokenType = opts.tokenType ?? 'WALK_IN';
    const priority  = PRIORITY_MAP[tokenType] ?? 100;

    const { tokenNumber, tokenPrefix, fullToken, rolledOver, maxNumber, startNumber } =
      await this.sequenceService.getNextToken(
        opts.branchId,
        opts.referenceType,
        opts.referenceId,
      );

    const tenantId = await this.chainResolver.resolveDefaultTenantIgnoringBranch(opts.branchId);

    const record = await this.recordRepo.save(
      this.recordRepo.create({
        branchId:      opts.branchId,
        referenceType: opts.referenceType,
        referenceId:   opts.referenceId,
        tokenNumber,
        tokenPrefix,
        fullToken,
        tokenType,
        priority,
        status:        'WAITING',
        kioskId:       opts.kioskId      ?? null,
        appointmentId: opts.appointmentId ?? null,
        issuedAt:      new Date(),
        tenantId,
      }),
    );

    return { record, rolledOver, maxNumber, startNumber };
  }

  // -- Queue state ----------------------------------------------------------

  /** Get waiting tokens for a location/SC, ordered by priority then issued_at */
  async getWaitingQueue(
    referenceType: RecordReferenceType,
    referenceId: string,
  ): Promise<TokenRecord[]> {
    return this.recordRepo.find({
      where: { referenceType, referenceId, status: 'WAITING' },
      order: { priority: 'ASC', issuedAt: 'ASC' },
    });
  }

  /** Count of waiting tokens for a given reference */
  async getWaitingCount(referenceType: RecordReferenceType, referenceId: string): Promise<number> {
    return this.recordRepo.count({
      where: { referenceType, referenceId, status: 'WAITING' },
    });
  }

  /** Recently called tokens for display boards */
  async getRecentCalled(
    referenceType: RecordReferenceType,
    referenceId: string,
    limit = 5,
  ): Promise<TokenRecord[]> {
    return this.recordRepo.find({
      where: { referenceType, referenceId, status: 'CALLED' },
      order: { calledAt: 'DESC' },
      take: limit,
    });
  }

  // -- Operations -----------------------------------------------------------

  private async findActive(id: string): Promise<TokenRecord> {
    const record = await this.scopedRecordRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Token record not found');
    return record;
  }

  /** Operator calls the next WAITING token */
  async callToken(opts: {
    recordId:      string;
    counterId:     string;
    calledBy:      string;
    branchId:      string;
  }): Promise<TokenRecord> {
    const record = await this.findActive(opts.recordId);
    if (!['WAITING', 'ON_HOLD'].includes(record.status)) {
      throw new BadRequestException(`Token is ${record.status}, cannot call`);
    }

    record.status    = 'CALLED';
    record.counterId = opts.counterId;
    record.calledBy  = opts.calledBy;
    record.calledAt  = new Date();

    return this.recordRepo.save(record);
  }

  /** Mark token as currently being served */
  async serveToken(recordId: string): Promise<TokenRecord> {
    const record = await this.findActive(recordId);
    if (record.status !== 'CALLED') {
      throw new BadRequestException(`Token is ${record.status}, cannot serve`);
    }
    record.status  = 'SERVING';
    record.servedAt = new Date();
    return this.recordRepo.save(record);
  }

  /** Mark token as completed */
  async completeToken(recordId: string, operatorId: string): Promise<TokenRecord> {
    const record = await this.findActive(recordId);
    if (!['CALLED', 'SERVING'].includes(record.status)) {
      throw new BadRequestException(`Token is ${record.status}, cannot complete`);
    }
    record.status      = 'COMPLETED';
    record.completedAt = new Date();
    return this.recordRepo.save(record);
  }

  /** Put token on hold -- returns to queue with lower priority */
  async holdToken(recordId: string): Promise<TokenRecord> {
    const record = await this.findActive(recordId);
    if (!['CALLED', 'SERVING'].includes(record.status)) {
      throw new BadRequestException(`Token is ${record.status}, cannot hold`);
    }
    record.status   = 'ON_HOLD';
    record.priority = record.priority + 50; // Deprioritize
    return this.recordRepo.save(record);
  }

  /** Skip token -- stays SKIPPED, operator moves to next */
  async skipToken(recordId: string): Promise<TokenRecord> {
    const record = await this.findActive(recordId);
    if (!['WAITING', 'CALLED'].includes(record.status)) {
      throw new BadRequestException(`Token is ${record.status}, cannot skip`);
    }
    record.status = 'SKIPPED';
    return this.recordRepo.save(record);
  }

  /** Mark token as missed (no-show after call) */
  async missToken(recordId: string): Promise<TokenRecord> {
    const record = await this.findActive(recordId);
    if (record.status !== 'CALLED') {
      throw new BadRequestException(`Token is ${record.status}, cannot miss`);
    }
    record.status = 'MISSED';
    return this.recordRepo.save(record);
  }

  /** Cancel token (admin action) */
  async cancelToken(recordId: string, cancelledBy: string): Promise<TokenRecord> {
    const record = await this.findActive(recordId);
    if (['COMPLETED', 'REISSUED', 'CANCELLED'].includes(record.status)) {
      throw new BadRequestException(`Token is already ${record.status}`);
    }
    record.status = 'CANCELLED';
    return this.recordRepo.save(record);
  }

  /** Transfer token to another counter */
  async transferToken(
    recordId: string,
    toCounterId: string,
    operatorId: string,
  ): Promise<TokenRecord> {
    const record = await this.findActive(recordId);
    if (!['CALLED', 'WAITING'].includes(record.status)) {
      throw new BadRequestException(`Token is ${record.status}, cannot transfer`);
    }
    record.status    = 'WAITING'; // Re-queue at target counter
    record.counterId = toCounterId;
    return this.recordRepo.save(record);
  }

  /**
   * Reissue a token -- creates a new TokenRecord, marks original as REISSUED.
   * Useful when patient loses slip or is sent to wrong location.
   */
  async reissueToken(
    originalRecordId: string,
    operatorId: string,
  ): Promise<TokenRecord> {
    const original = await this.findActive(originalRecordId);
    if (['REISSUED'].includes(original.status)) {
      throw new ConflictException('Token has already been reissued');
    }

    // Issue a new token for the same reference
    const { tokenNumber, tokenPrefix, fullToken } = await this.sequenceService.getNextToken(
      original.branchId,
      original.referenceType,
      original.referenceId,
    );
    // Note: rolledOver is not surfaced on reissue (edge case; rollover notification
    // is only broadcast on primary issue path)

    const newRecord = await this.recordRepo.save(
      this.recordRepo.create({
        branchId:        original.branchId,
        referenceType:   original.referenceType,
        referenceId:     original.referenceId,
        tokenNumber,
        tokenPrefix,
        fullToken,
        tokenType:       original.tokenType,
        priority:        original.priority,
        status:          'WAITING',
        kioskId:         original.kioskId,
        reissuedFromId:  original.id,
        issuedAt:        new Date(),
        // Stage B (Checkpoint B6) — carried forward from the original
        // record rather than re-resolved; reissue is same branch/reference,
        // same tenant, by construction.
        tenantId:        original.tenantId,
      }),
    );

    // Mark original as reissued
    original.status       = 'REISSUED';
    original.reissuedToId = newRecord.id;
    await this.recordRepo.save(original);

    return newRecord;
  }

  // -- Gateway helper -------------------------------------------------------

  /**
   * Best-effort update of token_records when an operator calls a token via the
   * legacy WebSocket path (which uses Redis + token_calls as its primary store).
   *
   * Looks up WAITING record by referenceId + tokenNumber and transitions it to
   * CALLED. If no record exists (e.g., issued before GAP-1 fix was deployed),
   * the method is a no-op -- it must never throw and never block the call flow.
   */
  async callTokenRecord(opts: {
    referenceId: string;
    tokenNumber: number;
    counterId:   string;
    calledBy:    string;
    branchId:    string;
  }): Promise<void> {
    const record = await this.recordRepo.findOne({
      where: {
        referenceId:  opts.referenceId,
        tokenNumber:  opts.tokenNumber,
        status:       'WAITING' as const,
      },
    });
    if (!record) return; // not yet persisted or already transitioned -- safe no-op

    record.status    = 'CALLED';
    record.counterId = opts.counterId;
    record.calledBy  = opts.calledBy;
    record.calledAt  = new Date();
    await this.recordRepo.save(record);
  }

  // -- Kiosk-based issuance -------------------------------------------------

  /**
   * Issue a token from a kiosk assignment.
   * The kiosk slug is looked up to find branch_id and reference details.
   */
  async issueFromKiosk(opts: {
    kioskSlug:       string;
    assignmentIndex: number; // which assignment in a SINGLE kiosk
    tokenType?:      TokenType;
    kiosk:           TokenKiosk;
  }): Promise<{ record: TokenRecord; rolledOver: boolean; maxNumber: number; startNumber: number }> {
    const assignments = (opts.kiosk.assignments ?? []).filter((a) => a.isActive);
    const assignment  = assignments[opts.assignmentIndex ?? 0];
    if (!assignment) throw new BadRequestException('Invalid kiosk assignment');

    const referenceType: RecordReferenceType =
      assignment.assignmentType === 'SERVICE_CENTER' ? 'SERVICE_CENTER' : 'LOCATION';
    const referenceId =
      assignment.assignmentType === 'SERVICE_CENTER'
        ? (assignment.serviceCenterId ?? '')
        : (assignment.locationId ?? '');

    if (!referenceId) throw new BadRequestException('Assignment has no reference ID');

    return this.issueToken({
      branchId:      opts.kiosk.branchId,
      referenceType,
      referenceId,
      tokenType:     opts.tokenType ?? 'WALK_IN',
      kioskId:       opts.kiosk.id,
    });
  }

  /** Recall a missed token -- re-announces patient at counter (MISSED -> RECALLED) */
  async recallToken(recordId: string): Promise<TokenRecord> {
    const record = await this.findActive(recordId);
    if (record.status !== 'MISSED') {
      throw new BadRequestException(`Token is ${record.status}, cannot recall (must be MISSED)`);
    }
    record.status = 'RECALLED';
    return this.recordRepo.save(record);
  }

}
