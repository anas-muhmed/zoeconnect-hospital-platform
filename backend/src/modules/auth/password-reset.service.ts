import {
  Inject, Injectable, Logger, NotFoundException,
  ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PasswordResetRequest } from './entities/password-reset-request.entity';
import { User } from '../users/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { VendorSyncService } from '../licensing/vendor-sync.service';
import { getTenantScopedRepositoryToken } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';

const BCRYPT_ROUNDS         = 12;
const REQUEST_TTL_HOURS     = 24;
const TEMP_PW_TTL_HOURS     = 24;
const MAX_REQUESTS_PER_DAY  = 3;
const TEMP_PW_BYTES         = 18;          // 24-char base64url

// -- DTOs ---------------------------------------------------------------------

// ZoeConnect Identity Architecture Migration, Phase 7 follow-up: Forgot
// Password now accepts the same `identifier` (username OR email) the login
// flow does, resolved globally and case-insensitively -- see
// PasswordResetService.forgotPassword()'s user-lookup below, which mirrors
// AuthService.resolveLoginUserGlobal() exactly. `username` is kept as a
// fallback field (not removed) so the legacy `{ username, reason }` request
// shape from any not-yet-updated caller keeps working unmodified --
// AuthController.forgotPassword() computes `identifier ?? username` before
// calling in here, same convention as LoginDto's `identifier ?? username`.
export interface ForgotPasswordDto {
  identifier: string;
  reason?: string;
  requestedByIp: string;
  requestedUserAgent: string;
}

export interface ReviewRequestDto {
  action: 'APPROVE' | 'REJECT';
  note: string;        // required on both approve and reject
}

export interface ReviewResult {
  requestId: string;
  status: 'APPROVED' | 'REJECTED';
  /** Plaintext temp password — only present on APPROVE. Never stored. */
  temporaryPassword?: string;
}

// -- Service -------------------------------------------------------------------

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetRequest)
    private readonly resetRepo: Repository<PasswordResetRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
    private readonly vendorSyncService: VendorSyncService,
    /**
     * Stage B (Checkpoint B3.3) — scoped repository for `listRequests()`
     * only (the sole method backing `GET /auth/password-reset-requests`,
     * which is the one route on `AuthController` carrying
     * `TenantContextInterceptor`, applied at the method level there — not
     * class level — because this controller mixes many public/login
     * routes with this one sensitive admin route). Every write path here,
     * plus the `@Cron`-driven `expireStaleRequests()` below, stays on the
     * raw `resetRepo` (background job — no request-scoped tenant context;
     * a second B6 candidate alongside Audit).
     */
    @Inject(getTenantScopedRepositoryToken(PasswordResetRequest))
    private readonly scopedResetRepo: TenantScopedRepository<PasswordResetRequest>,
  ) {}

  // -- Forgot Password --------------------------------------------------------

  /**
   * Entry point called by AuthController (Public endpoint).
   * Always returns void unless INSTANCE_NOT_REGISTERED is encountered.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ requestType: string; requestId: string; username: string } | { code: 'INSTANCE_NOT_REGISTERED' } | void> {
    // ZoeConnect Identity Architecture Migration, Phase 7 follow-up: resolves
    // `identifier` globally, case-insensitively, by username OR email --
    // exactly mirrors AuthService.resolveLoginUserGlobal() (query builder,
    // not find(), for the same documented reason: TypeORM's eager
    // `User.roles`/`User.directPermissions` relations only auto-load via
    // find*() repository methods, not createQueryBuilder(), so they need an
    // explicit join here too). `isActive` is checked in code rather than in
    // the query (not `.andWhere('user.isActive = true')`) so an inactive
    // account's forgotPassword call is indistinguishable from an unknown
    // identifier below -- both silently no-op, preserving the existing
    // no-enumeration guarantee.
    const user = await this.userRepo.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles')
      .where('LOWER(user.username) = LOWER(:identifier) OR LOWER(user.email) = LOWER(:identifier)', { identifier: dto.identifier })
      .getOne();

    // Silently succeed if user not found (or inactive) — prevents enumeration
    if (!user || !user.isActive) {
      this.logger.debug(`forgotPassword: unknown or inactive identifier "${dto.identifier}" — silently ignored`);
      return;
    }

    // Rate limit: max 3 requests in the last 24 h
    const since = new Date(Date.now() - REQUEST_TTL_HOURS * 3600_000);
    const recentCount = await this.resetRepo.count({
      where: { userId: user.id, requestedAt: LessThan(new Date()) },
    });

    // Count requests in last 24h more accurately
    const recent24h = await this.resetRepo
      .createQueryBuilder('r')
      .where('r.user_id = :uid', { uid: user.id })
      .andWhere('r.requested_at >= :since', { since })
      .getCount();

    if (recent24h >= MAX_REQUESTS_PER_DAY) {
      // Still silently return — no error exposed to the unauthenticated caller
      this.logger.warn(`forgotPassword: rate limit hit for user ${user.username}`);
      await this.auditService.log({
        action: 'PASSWORD_RESET_RATE_LIMITED',
        module: 'AUTH',
        userId: user.id,
        entityId: user.id,
        entityType: 'user',
        ipAddress: dto.requestedByIp,
        userAgent: dto.requestedUserAgent,
      });
      return;
    }

    // Reject only if a request is still genuinely pending review (partial
    // index enforces this at DB level too -- see
    // 1789000000000-NarrowActiveResetIndexToRequestedOnly.ts). APPROVED no
    // longer counts as "active" here: it means a request has already been
    // resolved (a temp password was issued), not that one is outstanding --
    // treating it the same as REQUESTED used to block a brand-new request
    // for the full 24h reset-TTL window even right after the prior one had
    // already been approved.
    const existingActive = await this.resetRepo.findOne({
      where: { userId: user.id, status: 'REQUESTED' },
    });
    if (existingActive) {
      this.logger.warn(`forgotPassword: duplicate pending request for user ${user.username}`);
      return;
    }

    const isSuperAdmin = user.isSuperAdmin;
    const requestType  = isSuperAdmin ? 'SUPERADMIN_TO_VENDOR' : 'EMPLOYEE_TO_SUPERADMIN';

    if (requestType === 'SUPERADMIN_TO_VENDOR') {
      const vendorReg = await this.vendorSyncService.getRegistration();
      if (!vendorReg) {
        this.logger.warn(`forgotPassword: no vendor registration found for superadmin request`);
        return { code: 'INSTANCE_NOT_REGISTERED' };
      }
    }

    const expiresAt = new Date(Date.now() + REQUEST_TTL_HOURS * 3600_000);
    const request = this.resetRepo.create({
      requestType,
      userId:              user.id,
      username:            user.username,

      requestedByIp:       dto.requestedByIp,
      requestedUserAgent:  dto.requestedUserAgent,
      reason:              dto.reason ?? null,
      status:              'REQUESTED',
      attemptCount:        recent24h + 1,
      expiresAt,
    });

    await this.resetRepo.save(request);

    await this.auditService.log({
      action:    'PASSWORD_RESET_REQUESTED',
      module:    'AUTH',
      userId:    user.id,
      entityId:  request.id,
      entityType: 'password_reset_request',
      ipAddress:  dto.requestedByIp,
      userAgent:  dto.requestedUserAgent,
      metadata:  { requestType, username: user.username },
    });

    this.logger.log(`Password reset requested for ${user.username} (type=${requestType})`);

    // `username` returned alongside requestType/requestId (Phase 7 follow-up)
    // so AuthController can notify the vendor with the account's actual
    // username -- not whatever raw identifier the caller typed (which may
    // now be an email address, and the vendor-side webhook contract expects
    // a username).
    return { requestType, requestId: request.id, username: user.username };
  }

  // -- List Requests (Super Admin view) ---------------------------------------

  async listRequests(type?: 'EMPLOYEE_TO_SUPERADMIN' | 'SUPERADMIN_TO_VENDOR') {
    const qb = (await this.scopedResetRepo.createQueryBuilder('r'))
      .orderBy('r.requested_at', 'DESC')
      .take(200);

    if (type) qb.where('r.request_type = :type', { type });

    return qb.getMany();
  }

  // -- Review (Approve / Reject) ----------------------------------------------

  /**
   * Optimistic lock: only transitions REQUESTED ? APPROVED|REJECTED.
   * Returns a one-time plaintext password on approval.
   */
  async reviewRequest(
    requestId: string,
    reviewerId: string,
    dto: ReviewRequestDto,
  ): Promise<ReviewResult> {
    const request = await this.resetRepo.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Password reset request not found');

    // Optimistic lock — 409 if already processed
    if (request.status !== 'REQUESTED') {
      throw new ConflictException(
        `This request has already been processed (status: ${request.status}).`,
      );
    }

    if (dto.action === 'REJECT') {
      if (!dto.note?.trim()) throw new BadRequestException('Rejection reason is required');

      await this.resetRepo.update(requestId, {
        status:          'REJECTED',
        reviewedBy:      reviewerId,
        reviewedAt:      new Date(),
        rejectionReason: dto.note,
      });

      await this.auditService.log({
        action:    'PASSWORD_RESET_REJECTED',
        module:    'AUTH',
        userId:    reviewerId,
        entityId:  requestId,
        entityType: 'password_reset_request',
        metadata:  { targetUserId: request.userId, rejectionReason: dto.note },
      });

      return { requestId, status: 'REJECTED' };
    }

    // -- APPROVE --------------------------------------------------------------
    if (!dto.note?.trim()) throw new BadRequestException('Approval note is required');

    const plaintext   = this.generateSecurePassword();
    const hash        = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
    const resetAt     = new Date();
    const resetExpiry = new Date(resetAt.getTime() + TEMP_PW_TTL_HOURS * 3600_000);

    // Write directly to users table — reset request remains a pure audit record
    await this.userRepo.update(request.userId, {
      passwordHash:           hash,
      mustChangePassword:     true,
      passwordResetAt:        resetAt,
      passwordResetExpiresAt: resetExpiry,
    });

    await this.resetRepo.update(requestId, {
      status:      'APPROVED',
      reviewedBy:  reviewerId,
      reviewedAt:  resetAt,
      approvalNote: dto.note,
    });

    await this.auditService.log({
      action:    'PASSWORD_RESET_APPROVED',
      module:    'AUTH',
      userId:    reviewerId,
      entityId:  requestId,
      entityType: 'password_reset_request',
      metadata:  { targetUserId: request.userId, tempPasswordExpiry: resetExpiry.toISOString() },
    });

    this.logger.log(`Password reset approved for userId=${request.userId} by reviewer=${reviewerId}`);

    return { requestId, status: 'APPROVED', temporaryPassword: plaintext };
  }

  // -- Mark COMPLETED after user changes password ----------------------------

  /**
   * Called from AuthService.changePassword() when mustChangePassword was true.
   */
  async markCompleted(userId: string): Promise<void> {
    const request = await this.resetRepo.findOne({
      where: { userId, status: 'APPROVED' },
    });
    if (!request) return;

    await this.resetRepo.update(request.id, {
      status:      'COMPLETED',
      completedAt: new Date(),
    });

    // Clear reset expiry on the user record
    await this.userRepo.update(userId, { passwordResetExpiresAt: null as any });

    await this.auditService.log({
      action:    'PASSWORD_RESET_COMPLETED',
      module:    'AUTH',
      userId,
      entityId:  request.id,
      entityType: 'password_reset_request',
    });
  }

  // -- Remote command handler (from Vendor Portal) ----------------------------

  /**
   * Called by CommandDispatcherService when action = 'security:users:reset-password'.
   * Returns the one-time plaintext temporary password.
   */
  async applyRemoteReset(
    userId: string,
    vendorRequestId: string,
    vendorContext: { correlationId: string; instanceId: string },
  ): Promise<{ temporaryPassword: string }> {
    // Tenant-Scoped User Identity, Task 7: previously fell back to an
    // unscoped `username` lookup for any non-UUID input -- ambiguous across
    // tenants and, worse, could reset the wrong tenant's user's password if
    // two tenants share a username. Per the plan's Task 7 decision
    // (restrict any account-mutating vendor command to UUID-only, same
    // rationale/precedent as AccountLockManagementService.unlockUser()/
    // resetAttempts()): the vendor operator must resolve the target user's
    // real UUID first via a support view, not pass a bare username here.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
      throw new BadRequestException(
        `Invalid target user identifier "${userId}" -- vendor commands that mutate an account require the ` +
        `user's UUID (not username). Resolve the target user's id first via a support/admin view before ` +
        `issuing this command.`,
      );
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    // Find pending request or create a synthetic APPROVED one for vendor-initiated resets
    let request = await this.resetRepo.findOne({
      where: { userId: user.id, status: 'REQUESTED', requestType: 'SUPERADMIN_TO_VENDOR' },
    });

    const plaintext  = this.generateSecurePassword();
    const hash       = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
    const resetAt    = new Date();
    const resetExpiry = new Date(resetAt.getTime() + TEMP_PW_TTL_HOURS * 3600_000);

    await this.userRepo.update(user.id, {
      passwordHash:           hash,
      mustChangePassword:     true,
      passwordResetAt:        resetAt,
      passwordResetExpiresAt: resetExpiry,
    });

    if (request) {
      await this.resetRepo.update(request.id, {
        status:          'APPROVED',
        vendorRequestId: vendorRequestId,
        // `reviewedBy` is a `uuid` column referencing a real reviewing admin
        // (see reviewRequest() above, which always writes a real reviewerId
        // here) -- there is no local admin user to attribute a
        // vendor-initiated reset to, so this is left null rather than
        // stuffing a non-UUID sentinel string into a uuid column (the bug
        // that used to live here: 'SYSTEM_VENDOR_GATEWAY' is not a valid
        // uuid, so this update always failed with a Postgres error). The
        // real "who triggered this" provenance is captured properly below,
        // in the VENDOR_REMOTE_PASSWORD_RESET audit log entry instead
        // (vendorContext + vendorRequestId), which doesn't have this column's
        // type constraint.
        reviewedBy:      null,
        reviewedAt:      resetAt,
        completedAt:     resetAt,
      });
    }

    await this.auditService.log({
      action:    'VENDOR_REMOTE_PASSWORD_RESET',
      module:    'SECURITY',
      entityType: 'user',
      entityId: user.id,
      metadata: { vendorContext, vendorRequestId, requestId: request?.id },
    });

    return { temporaryPassword: plaintext };
  }

  // -- Scheduler: expire stale requests -------------------------------------

  @Cron("0 */15 * * * *")
  async expireStaleRequests(): Promise<void> {
    const now = new Date();
    const stale = await this.resetRepo.find({
      where: {
        status: In(['REQUESTED', 'APPROVED']),
        expiresAt: LessThan(now),
      },
    });

    if (stale.length === 0) return;

    const ids = stale.map((r) => r.id);
    await this.resetRepo.update({ id: In(ids) } as any, { status: 'EXPIRED' });

    for (const r of stale) {
      // Phase 8 (Task 8.6): AuditService.log() resolves tenantId via ambient
      // TenantContextStorage, which is unset for @Cron jobs (null every
      // time). Establish it here from the row's own already-stamped
      // tenantId -- same row-derived pattern as
      // registration.service.ts's sweepExpiredReservations().
      const logExpiry = () =>
        this.auditService.log({
          action:    'PASSWORD_RESET_EXPIRED',
          module:    'AUTH',
          entityId:  r.id,
          entityType: 'password_reset_request',
          metadata:  { targetUserId: r.userId, expiredAt: now.toISOString() },
        });
      if (r.tenantId) {
        await TenantContextStorage.run(r.tenantId, logExpiry);
      } else {
        await logExpiry();
      }
    }

    this.logger.warn(`Expired ${stale.length} stale password reset request(s)`);
  }

  // -- Private helpers ------------------------------------------------------

  private generateSecurePassword(): string {
    // NIST-recommended: 18 random bytes = 24-char base64url, all character classes
    return crypto.randomBytes(TEMP_PW_BYTES).toString('base64url');
  }
}
