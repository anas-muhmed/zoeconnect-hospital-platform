import {
  Inject, Injectable, Logger, NotFoundException,
  ConflictException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, LessThan, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';

import { TokenRecord, TokenStatus } from '../entities/token-record.entity';
import { TokenLocation } from '../entities/token-location.entity';
import { TokenReservation } from './entities/token-reservation.entity';
import { TokenPatientMapping } from './entities/token-patient-mapping.entity';
import { MappingAuditLog } from './entities/mapping-audit-log.entity';
import { getTenantScopedRepositoryToken } from '../../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../../platform/tenant/repositories/tenant-scoped.repository';
import { ChainTenantResolver } from '../../platform/tenant/resolvers/chain-tenant.resolver';

import { ReserveTokenDto, HeartbeatDto, ReleaseTokenDto, SupervisorResetDto } from './dto/reserve-token.dto';
import { MapPatientDto, MapVisitDto } from './dto/map-patient.dto';

/** Reservation lifetime in seconds -- extended by each heartbeat */
const RESERVATION_TTL_SECONDS = 30;

/**
 * Lifetime of the reservation-capability token minted alongside every
 * reservation (see mintCapabilityToken below). Generous relative to the
 * 30s reservation TTL itself because, in the popup-window integration
 * architecture, this token is what the HIS page uses to keep the
 * reservation alive (via heartbeat) for as long as the receptionist takes
 * to fill out and submit the actual registration form -- realistically a
 * few minutes, not seconds.
 */
const CAPABILITY_TOKEN_TTL = '15m';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,

    @InjectRepository(TokenRecord)
    private readonly tokenRepo: Repository<TokenRecord>,

    @InjectRepository(TokenReservation)
    private readonly reservationRepo: Repository<TokenReservation>,

    @InjectRepository(TokenPatientMapping)
    private readonly mappingRepo: Repository<TokenPatientMapping>,

    @InjectRepository(MappingAuditLog)
    private readonly auditRepo: Repository<MappingAuditLog>,

    @InjectRepository(TokenLocation)
    private readonly locationRepo: Repository<TokenLocation>,

    private readonly jwtService: JwtService,

    /**
     * Stage B (Checkpoint B3.8) — scoped repositories for `getTokenState()`
     * and `getMappingByMrn()` only. Both are reached exclusively from
     * session-resolved routes with no `ReservationScopeGuard`/workstation-
     * token branching. `getQueue()` and `findActiveReservation()` stay raw —
     * each is reached from more than one calling context at runtime
     * (`getQueue()` branches on `user.isWorkstationToken`;
     * `findActiveReservation()` backs both `heartbeat()`/`releaseReservation()`,
     * reachable via a real session or a `ReservationScopeGuard`-passed
     * capability token), and the derived-JWT verification (this checkpoint's
     * review) confirmed `SessionTenantResolver` cannot resolve a tenant from
     * either token type today — so neither method can be scoped until every
     * one of its call sites resolves correctly. `reserveToken()`/`mapVisit()`/
     * `supervisorReset()`'s inline reads stay raw too, per this checkpoint's
     * narrower cut (one-off inline reads, not separately-named shared helpers).
     */
    @Inject(getTenantScopedRepositoryToken(TokenRecord))
    private readonly scopedTokenRepo: TenantScopedRepository<TokenRecord>,
    @Inject(getTenantScopedRepositoryToken(TokenPatientMapping))
    private readonly scopedMappingRepo: TenantScopedRepository<TokenPatientMapping>,
    @Inject(getTenantScopedRepositoryToken(TokenReservation))
    private readonly scopedReservationRepo: TenantScopedRepository<TokenReservation>,

    // Stage B (Checkpoint B5) — the derived-JWT gap noted above (getQueue()/
    // findActiveReservation() unresolvable for workstation/capability
    // principals) is now fixed at the single choke point
    // (TenantContextInterceptor), not here — see its B5 doc comment. This
    // resolver is for reserveToken()'s direct write, which has no ambient
    // interceptor context to rely on today (RegistrationController's
    // `reserve` route isn't wrapped in @UseInterceptors(TenantContextInterceptor)),
    // so it's stamped explicitly from the reserved TokenRecord's own
    // branchId — the same chain every other B5 write in this module uses.
    private readonly chainResolver: ChainTenantResolver,
  ) {}

  // ── Queue ─────────────────────────────────────────────────────────────────

  /**
   * Returns tokens visible to the widget queue list.
   * Excludes: REGISTERED, CANCELLED, tokens with an active reservation
   * held by another user.
   *
   * The caller passes their own userId so their reserved token remains
   * visible in their own widget (locked state).
   */
  /**
   * `locationId`, when given, scopes the queue to one TokenLocation --
   * used by the workstation-based popup integration, where a workstation
   * is configured against exactly one location (which itself represents a
   * department + service center pair; see TokenLocation). Matches tokens
   * issued directly against that location (`referenceType='LOCATION'`) as
   * well as tokens issued at the service-center level that location
   * belongs to (`referenceType='SERVICE_CENTER'`), so a counter sees the
   * full set of tokens relevant to it regardless of which kiosk flow
   * issued them. Omitting `locationId` preserves the original
   * branch-wide behavior (used by any caller that isn't location-scoped).
   */
  async getQueue(branchId: string, currentUserId?: string, locationId?: string): Promise<TokenRecord[]> {
    // Subquery: token_record_ids currently locked by someone else
    const reservedByOthers = await this.reservationRepo
      .createQueryBuilder('r')
      .select('r.token_record_id')
      .where('r.released_at IS NULL')
      .andWhere('r.expires_at > NOW()')
      .andWhere(currentUserId ? 'r.reserved_by_user != :userId' : '1=1', { userId: currentUserId })
      .getRawMany<{ r_token_record_id: string }>();

    const excludedIds = reservedByOthers.map((r) => r.r_token_record_id);

    const qb = this.tokenRepo
      .createQueryBuilder('t')
      .where('t.branch_id = :branchId', { branchId })
      .andWhere('t.status IN (:...statuses)', { statuses: ['WAITING', 'CALLED'] });

    if (excludedIds.length > 0) {
      qb.andWhere('t.id NOT IN (:...excludedIds)', { excludedIds });
    }

    if (locationId) {
      const location = await this.locationRepo.findOne({ where: { id: locationId } });
      if (location) {
        qb.andWhere(
          `(
            (t.reference_type = 'LOCATION' AND t.reference_id = :locationId)
            OR (t.reference_type = 'SERVICE_CENTER' AND t.reference_id = :serviceCenterId)
          )`,
          { locationId, serviceCenterId: location.serviceCenterId ?? '__none__' },
        );
      } else {
        // Unknown location -- fail closed to "nothing", not "everything".
        qb.andWhere('1=0');
      }
    }

    // A5.5 API Contract Audit: admin GET token/registration/queue -- explicit select excludes tenantId.
    qb.select([
      't.id', 't.branchId', 't.referenceType', 't.referenceId', 't.tokenNumber', 't.tokenPrefix',
      't.fullToken', 't.tokenType', 't.priority', 't.status', 't.counterId', 't.kioskId',
      't.appointmentId', 't.calledBy', 't.calledAt', 't.servedAt', 't.completedAt',
      't.estimatedWaitSeconds', 't.issuedAt', 't.createdAt', 't.reissuedFromId', 't.reissuedToId',
      't.registeredAt', 't.registrationUser', 't.supervisorResetAt', 't.supervisorResetBy',
      't.supervisorResetNote',
    ]);
    return qb.orderBy('t.priority', 'ASC').addOrderBy('t.issued_at', 'ASC').getMany();
  }

  // ── Reservation ───────────────────────────────────────────────────────────

  /**
   * Atomically reserves a token for a user.
   *
   * Fails with:
   *   409 TOKEN_ALREADY_RESERVED  -- another user holds this token
   *   409 USER_ALREADY_HAS_RESERVATION -- this user has another token reserved
   *   404                         -- token not found or not in WAITING/CALLED
   */
  async reserveToken(
    tokenNumber: string,
    dto: ReserveTokenDto,
    userId: string,
    ipAddress?: string,
  ): Promise<TokenReservation & { capabilityToken: string }> {
    // Check for existing user reservation first (gives better error message)
    const existingUserReservation = await this.reservationRepo.findOne({
      where: { reservedByUser: userId, releasedAt: IsNull() },
      relations: ['tokenRecord'],
    });

    if (existingUserReservation && existingUserReservation.expiresAt > new Date()) {
      throw new ConflictException({
        error: 'USER_ALREADY_HAS_RESERVATION',
        message: `You already have an active reservation for token ${existingUserReservation.tokenNumber}. Complete or release it before selecting another.`,
        currentToken: existingUserReservation.tokenNumber,
      });
    }

    // Resolve the token record
    const tokenRecord = await this.tokenRepo.findOne({
      where: { fullToken: tokenNumber },
    });

    if (!tokenRecord || !['WAITING', 'CALLED'].includes(tokenRecord.status)) {
      throw new NotFoundException(`Token ${tokenNumber} not found or not available for reservation`);
    }

    // Check if another user already holds this token
    const existingTokenReservation = await this.reservationRepo.findOne({
      where: { tokenRecordId: tokenRecord.id, releasedAt: IsNull() },
    });

    if (existingTokenReservation && existingTokenReservation.expiresAt > new Date()) {
      throw new ConflictException({
        error: 'TOKEN_ALREADY_RESERVED',
        message: `Token ${tokenNumber} is being registered by another counter. Please select a different token.`,
      });
    }

    const expiresAt = new Date(Date.now() + RESERVATION_TTL_SECONDS * 1000);
    const tenantId = await this.chainResolver.resolveDefaultTenantIgnoringBranch(tokenRecord.branchId);

    const reservation = await this.reservationRepo.save(
      this.reservationRepo.create({
        tokenRecordId:  tokenRecord.id,
        tokenNumber:    tokenRecord.fullToken,
        reservationId:  dto.reservationId,
        reservedByUser: userId,
        expiresAt,
        lastHeartbeatAt: new Date(),
        tenantId,
      }),
    );

    await this.writeAudit({
      tokenRecordId: tokenRecord.id,
      eventType:     'RESERVATION_CREATED',
      actor:         userId,
      ipAddress,
      payload:       { reservationId: dto.reservationId, expiresAt },
      tenantId,
    });

    const capabilityToken = this.mintCapabilityToken(
      userId,
      tokenRecord.fullToken,
      dto.reservationId,
      tokenRecord.branchId,
    );

    return { ...reservation, capabilityToken };
  }

  /**
   * Mints a short-lived, narrowly-scoped JWT for the popup-window
   * integration architecture: it authorizes exactly one thing -- acting on
   * this specific reservation (heartbeat / release / map) -- and nothing
   * else. It carries no permissions, cannot list queues, cannot touch any
   * other reservation, and self-expires in CAPABILITY_TOKEN_TTL regardless
   * of use. `sub` is deliberately the same userId that made the
   * reservation, so JwtStrategy's synthetic capability principal satisfies
   * the exact same `reservedByUser` ownership check that a normal
   * receptionist session already goes through in findActiveReservation --
   * no separate authorization code path was needed there.
   *
   * See: strategies/jwt.strategy.ts (validates `type: 'reservation-capability'`)
   *      common/guards/reservation-scope.guard.ts (enforces tokenNumber/reservationId match)
   */
  private mintCapabilityToken(
    userId: string,
    tokenNumber: string,
    reservationId: string,
    branchId: string,
  ): string {
    return this.jwtService.sign(
      {
        sub:           userId,
        type:          'reservation-capability',
        tokenNumber,
        reservationId,
        branchId,
        jti:           randomUUID(),
      },
      { expiresIn: CAPABILITY_TOKEN_TTL },
    );
  }

  /**
   * Extends the reservation expiry by RESERVATION_TTL_SECONDS.
   * Validates both reservationId and userId to prevent tab-switching attacks.
   */
  async heartbeat(
    tokenNumber: string,
    dto: HeartbeatDto,
    userId: string,
  ): Promise<{ expiresAt: Date }> {
    const reservation = await this.findActiveReservation(tokenNumber, dto.reservationId, userId);
    const newExpiry   = new Date(Date.now() + RESERVATION_TTL_SECONDS * 1000);

    await this.reservationRepo.update(reservation.id, {
      expiresAt:       newExpiry,
      lastHeartbeatAt: new Date(),
    });

    return { expiresAt: newExpiry };
  }

  /**
   * Explicitly releases a reservation (user changes token selection).
   */
  async releaseReservation(
    tokenNumber: string,
    dto: ReleaseTokenDto,
    userId: string,
    ipAddress?: string,
  ): Promise<void> {
    const reservation = await this.findActiveReservation(tokenNumber, dto.reservationId, userId);

    await this.reservationRepo.update(reservation.id, {
      releasedAt:    new Date(),
      releaseReason: 'MANUAL_RELEASE',
    });

    await this.writeAudit({
      tokenRecordId: reservation.tokenRecordId,
      eventType:     'RESERVATION_RELEASED',
      actor:         userId,
      ipAddress,
      payload:       { reservationId: dto.reservationId },
      tenantId:      reservation.tenantId,
    });
  }

  // ── Patient mapping ───────────────────────────────────────────────────────

  /**
   * Stage 1 -- atomically:
   *   1. Inserts token_patient_mapping
   *   2. Updates token_records.status = REGISTERED + timestamps
   *   3. Releases the reservation
   *   4. Writes audit log entry
   *
   * All four steps succeed or all roll back.
   */
  async mapPatient(
    dto: MapPatientDto,
    userId: string,
    ipAddress?: string,
  ): Promise<TokenPatientMapping> {
    return this.dataSource.transaction(async (em) => {
      const tokenRecord = await em.findOne(TokenRecord, {
        where: { fullToken: dto.tokenNumber },
      });

      if (!tokenRecord) {
        throw new NotFoundException(`Token ${dto.tokenNumber} not found`);
      }

      if (tokenRecord.status === 'REGISTERED') {
        throw new ConflictException({
          error: 'TOKEN_ALREADY_MAPPED',
          message: `Token ${dto.tokenNumber} has already been registered to a patient`,
        });
      }

      // Check no existing mapping
      const existing = await em.findOne(TokenPatientMapping, {
        where: { tokenRecordId: tokenRecord.id },
      });
      if (existing) {
        throw new ConflictException({
          error: 'DUPLICATE_PATIENT_MAPPING',
          message: `Token ${dto.tokenNumber} already has a patient mapping`,
        });
      }

      const now = new Date();

      // Audit attribution: prefer the real HIS registrar's identity
      // (dto.registeredByHisUser, read off the HIS page's own DOM) over the
      // technical caller's identity (userId -- a workstation session or
      // service account has no human behind it). For a normal,
      // fully-authenticated receptionist session, registeredByHisUser is
      // never sent and userId (the real logged-in user) is used exactly as
      // before. The technical caller is still preserved in the audit
      // payload/mapping metadata either way, so "who authenticated this
      // call" is never lost even when it differs from "who registered the
      // patient".
      const actor = dto.registeredByHisUser?.trim() || userId;

      // Stage B (Checkpoint B5) — this transaction runs on the raw
      // EntityManager, not the injected scoped repos, so ambient
      // TenantContextStorage context (even if the interceptor is later
      // added to this route) wouldn't reach these writes automatically.
      // Stamped explicitly from the tokenRecord already fetched above,
      // same chain-derived pattern as reserveToken()/issueToken().
      const tenantId = await this.chainResolver.resolveDefaultTenantIgnoringBranch(tokenRecord.branchId);

      // 1. Insert mapping
      const mapping = await em.save(
        em.create(TokenPatientMapping, {
          tokenRecordId:           tokenRecord.id,
          tokenNumber:             dto.tokenNumber,
          hisPatientId:            dto.hisPatientId,
          mrn:                     dto.mrn,
          patientName:             dto.patientName ?? null,
          visitId:                 dto.visitId     ?? null,
          mappedBy:                actor,
          mappedAt:                now,
          registrationCompletedAt: now,
          visitMappedAt:           dto.visitId ? now : null,
          metadata:                dto.registeredByHisUser ? { authenticatedAs: userId } : {},
          tenantId,
        }),
      );

      // 2. Update token status
      await em.update(TokenRecord, { id: tokenRecord.id }, {
        status:           'REGISTERED' as TokenStatus,
        registeredAt:     now,
        registrationUser: actor,
      });

      // 3. Release any active reservation
      await em.update(
        TokenReservation,
        { tokenRecordId: tokenRecord.id, releasedAt: IsNull() },
        { releasedAt: now, releaseReason: 'MAPPED' },
      );

      // 4. Audit
      await em.save(
        em.create(MappingAuditLog, {
          tokenRecordId: tokenRecord.id,
          mappingId:     mapping.id,
          eventType:     'PATIENT_MAPPED',
          oldStatus:     tokenRecord.status,
          newStatus:     'REGISTERED',
          actor,
          ipAddress,
          payload:       {
            hisPatientId:    dto.hisPatientId,
            mrn:             dto.mrn,
            patientName:     dto.patientName,
            visitId:         dto.visitId,
            authenticatedAs: dto.registeredByHisUser ? userId : undefined,
          },
          tenantId,
        }),
      );

      return mapping;
    });
  }

  /**
   * Stage 2 -- update visit_id on an existing mapping.
   * Token must already be REGISTERED (Stage 1 must have completed).
   */
  async mapVisit(
    dto: MapVisitDto,
    userId: string,
    ipAddress?: string,
  ): Promise<TokenPatientMapping> {
    const tokenRecord = await this.tokenRepo.findOne({
      where: { fullToken: dto.tokenNumber },
    });

    if (!tokenRecord) {
      throw new NotFoundException(`Token ${dto.tokenNumber} not found`);
    }

    const mapping = await this.mappingRepo.findOne({
      where: { tokenRecordId: tokenRecord.id },
    });

    if (!mapping) {
      throw new BadRequestException({
        error: 'PATIENT_NOT_MAPPED_YET',
        message: `Token ${dto.tokenNumber} does not have a patient mapping. Complete Stage 1 first.`,
      });
    }

    const now = new Date();
    await this.mappingRepo.update(mapping.id, {
      visitId:      dto.visitId,
      visitMappedAt: now,
      updatedAt:    now,
    });

    // Stage B (Checkpoint B6) — same chain-derived pattern as
    // reserveToken()/mapPatient()/supervisorReset() in this file: no
    // ambient TenantContextInterceptor context on this route, so resolve
    // explicitly from the already-fetched tokenRecord's branchId.
    const tenantId = await this.chainResolver.resolveDefaultTenantIgnoringBranch(tokenRecord.branchId);

    await this.writeAudit({
      tokenRecordId: tokenRecord.id,
      mappingId:     mapping.id,
      eventType:     'VISIT_MAPPED',
      actor:         userId,
      ipAddress,
      payload:       { visitId: dto.visitId },
      tenantId,
    });

    return this.mappingRepo.findOneOrFail({ where: { id: mapping.id } });
  }

  // ── Downstream lookup (Pharmacy, Loyalty, Feedback, Forms, ...) ─────────────

  /**
   * Resolves the current visit's token mapping for a given MRN. Used by
   * downstream ZoeConnect modules that only know a patient's MRN (e.g. Pharmacy
   * scanning a token to dispense) and need to find the token/registration
   * context without re-deriving it themselves. Returns the most recently
   * mapped row for that MRN -- a patient may accumulate multiple mappings
   * across visits/days, and callers care about the current one.
   */
  private static readonly MAPPING_SELECT = [
    'id', 'tokenRecordId', 'tokenNumber', 'hisPatientId', 'mrn', 'patientName', 'visitId',
    'mappedBy', 'mappedAt', 'visitMappedAt', 'registrationCompletedAt', 'metadata',
    'createdAt', 'updatedAt',
  ] as const;

  // A5.5 API Contract Audit: admin GET token/registration/mapping/by-mrn/:mrn -- explicit select excludes tenantId.
  async getMappingByMrn(mrn: string): Promise<TokenPatientMapping> {
    const mapping = await this.scopedMappingRepo.findOne({
      where: { mrn },
      order: { mappedAt: 'DESC' },
      select: [...RegistrationService.MAPPING_SELECT],
    });

    if (!mapping) {
      throw new NotFoundException(`No token mapping found for MRN ${mrn}`);
    }

    return mapping;
  }

  // ── Token state ───────────────────────────────────────────────────────────

  // A5.5 API Contract Audit: admin GET token/registration/:tokenNumber/state
  // -- explicit select excludes tenantId on all three returned entities.
  async getTokenState(tokenNumber: string): Promise<{
    tokenRecord: TokenRecord;
    mapping:     TokenPatientMapping | null;
    reservation: TokenReservation    | null;
  }> {
    const tokenRecord = await this.scopedTokenRepo.findOne({
      where: { fullToken: tokenNumber },
      select: [
        'id', 'branchId', 'referenceType', 'referenceId', 'tokenNumber', 'tokenPrefix',
        'fullToken', 'tokenType', 'priority', 'status', 'counterId', 'kioskId',
        'appointmentId', 'calledBy', 'calledAt', 'servedAt', 'completedAt',
        'estimatedWaitSeconds', 'issuedAt', 'createdAt', 'reissuedFromId', 'reissuedToId',
        'registeredAt', 'registrationUser', 'supervisorResetAt', 'supervisorResetBy',
        'supervisorResetNote',
      ],
    });

    if (!tokenRecord) throw new NotFoundException(`Token ${tokenNumber} not found`);

    const [mapping, reservation] = await Promise.all([
      this.scopedMappingRepo.findOne({
        where: { tokenRecordId: tokenRecord.id },
        select: [...RegistrationService.MAPPING_SELECT],
      }),
      this.scopedReservationRepo.findOne({
        where: { tokenRecordId: tokenRecord.id, releasedAt: IsNull() },
        select: [
          'id', 'tokenRecordId', 'tokenNumber', 'reservationId', 'reservedByUser',
          'reservedAt', 'expiresAt', 'lastHeartbeatAt', 'releasedAt', 'releaseReason',
        ],
      }),
    ]);

    return { tokenRecord, mapping, reservation };
  }

  // ── Supervisor reset ──────────────────────────────────────────────────────

  /**
   * Resets a REGISTERED token back to CALLED or WAITING.
   * Requires TOKEN:REGISTRATION:SUPERVISOR_RESET permission (enforced in controller).
   * Preserves the patient mapping -- adds supervisorReset flag to metadata.
   */
  async supervisorReset(
    tokenNumber: string,
    dto: SupervisorResetDto,
    supervisorId: string,
    ipAddress?: string,
  ): Promise<TokenRecord> {
    return this.dataSource.transaction(async (em) => {
      const tokenRecord = await em.findOne(TokenRecord, {
        where: { fullToken: tokenNumber },
      });

      if (!tokenRecord) throw new NotFoundException(`Token ${tokenNumber} not found`);

      if (tokenRecord.status !== 'REGISTERED') {
        throw new BadRequestException(
          `Token ${tokenNumber} is not in REGISTERED state (current: ${tokenRecord.status})`,
        );
      }

      if (!['CALLED', 'WAITING'].includes(dto.targetStatus)) {
        throw new BadRequestException('targetStatus must be CALLED or WAITING');
      }

      const now = new Date();

      await em.update(TokenRecord, { id: tokenRecord.id }, {
        status:                 dto.targetStatus as TokenStatus,
        supervisorResetAt:      now,
        supervisorResetBy:      supervisorId,
        supervisorResetNote:    dto.reason,
      });

      // Preserve mapping but flag it as supervisor-reset
      const mapping = await em.findOne(TokenPatientMapping, {
        where: { tokenRecordId: tokenRecord.id },
      });

      if (mapping) {
        await em.update(TokenPatientMapping, { id: mapping.id }, {
          metadata:  { ...mapping.metadata, supervisorReset: true, resetBy: supervisorId, resetAt: now },
          updatedAt: now,
        });
      }

      const tenantId = await this.chainResolver.resolveDefaultTenantIgnoringBranch(tokenRecord.branchId);
      await em.save(
        em.create(MappingAuditLog, {
          tokenRecordId: tokenRecord.id,
          mappingId:     mapping?.id ?? null,
          eventType:     'SUPERVISOR_RESET',
          oldStatus:     'REGISTERED',
          newStatus:     dto.targetStatus,
          actor:         supervisorId,
          ipAddress,
          payload:       { reason: dto.reason, targetStatus: dto.targetStatus },
          tenantId,
        }),
      );

      return em.findOneOrFail(TokenRecord, { where: { id: tokenRecord.id } });
    });
  }

  // ── Background job ────────────────────────────────────────────────────────

  /**
   * Sweeps expired reservations every 15 seconds.
   * Releases any reservation where expires_at < NOW() and released_at IS NULL.
   */
  @Cron('*/15 * * * * *')
  async sweepExpiredReservations(): Promise<void> {
    const expired = await this.reservationRepo.find({
      where: { releasedAt: IsNull(), expiresAt: LessThan(new Date()) },
    });

    if (expired.length === 0) return;

    const now = new Date();

    await this.reservationRepo.update(
      { releasedAt: IsNull(), expiresAt: LessThan(now) },
      { releasedAt: now, releaseReason: 'EXPIRED' },
    );

    // Audit each expiry. tenantId is copied from the reservation row itself
    // (already stamped at reserveToken() write time, B5) rather than
    // re-resolved — this is a @Cron job (B6's territory) with no live
    // branchId of its own in scope, but the source row already carries it.
    const auditEntries = expired.map((r) =>
      this.auditRepo.create({
        tokenRecordId: r.tokenRecordId,
        eventType:     'RESERVATION_EXPIRED',
        actor:         'system',
        payload:       {
          reservationId:  r.reservationId,
          reservedByUser: r.reservedByUser,
          expiredAt:      r.expiresAt,
        },
        tenantId: r.tenantId,
      }),
    );

    await this.auditRepo.save(auditEntries);

    this.logger.debug(`Swept ${expired.length} expired reservation(s)`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async findActiveReservation(
    tokenNumber: string,
    reservationId: string,
    userId: string,
  ): Promise<TokenReservation> {
    const tokenRecord = await this.tokenRepo.findOne({
      where: { fullToken: tokenNumber },
    });

    if (!tokenRecord) throw new NotFoundException(`Token ${tokenNumber} not found`);

    const reservation = await this.reservationRepo.findOne({
      where: { tokenRecordId: tokenRecord.id, releasedAt: IsNull() },
    });

    if (!reservation) {
      throw new NotFoundException(`No active reservation found for token ${tokenNumber}`);
    }

    if (reservation.reservationId !== reservationId) {
      throw new ForbiddenException('reservation_id does not match the active reservation');
    }

    if (reservation.reservedByUser !== userId) {
      throw new ForbiddenException('This reservation belongs to a different user');
    }

    return reservation;
  }

  private async writeAudit(opts: {
    tokenRecordId: string;
    mappingId?:    string;
    eventType:     MappingAuditLog['eventType'];
    oldStatus?:    string;
    newStatus?:    string;
    actor:         string;
    ipAddress?:    string;
    payload?:      Record<string, unknown>;
    // Stage B (Checkpoint B5) — optional, passed by callers that already
    // have a resolved tenantId in scope (reserveToken's tokenRecord,
    // releaseReservation's reservation row) rather than re-resolved here.
    tenantId?:     string | null;
  }): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
        tokenRecordId: opts.tokenRecordId,
        mappingId:     opts.mappingId     ?? null,
        tenantId:      opts.tenantId      ?? null,
        eventType:     opts.eventType,
        oldStatus:     opts.oldStatus     ?? null,
        newStatus:     opts.newStatus     ?? null,
        actor:         opts.actor,
        ipAddress:     opts.ipAddress     ?? null,
        payload:       opts.payload       ?? {},
      }),
    );
  }
}
