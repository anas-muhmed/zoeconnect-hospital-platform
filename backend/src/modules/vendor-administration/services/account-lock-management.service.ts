import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Role } from '../../rbac/entities/role.entity';
import { AuditService } from '../../audit/audit.service';
import { TenantContextStorage } from '../../platform/tenant/context/tenant-context-storage';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AccountLockManagementService {
  private readonly logger = new Logger(AccountLockManagementService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly auditService: AuditService,
    // Tenant-Scoped User Identity, Task 5 -- see createUser()'s comment.
    private readonly tenantContext: TenantContextStorage,
  ) {}

  async getLockedUsers(): Promise<Partial<User>[]> {
    // A user is locked if failedLoginCount >= 5 or lockedUntil is in the future
    const qb = this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles')
      .where('user.failedLoginCount >= :max', { max: 5 })
      .orWhere('user.lockedUntil > :now', { now: new Date() })
      .select([
        'user.id', 'user.username', 'user.fullName', 'user.email',
        'user.failedLoginCount', 'user.lockedUntil', 'user.lastLoginAt',
        'roles.name'
      ]);
      
    const users = await qb.getMany();
    return users.map(user => {
      let lockReason = 'Unknown';
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        lockReason = 'Temporarily locked due to repeated failures';
      } else if (user.failedLoginCount >= 5) {
        lockReason = 'Exceeded maximum login attempts';
      }
      return {
        ...user,
        lockReason,
        activeSessions: 0 // Will integrate with real session management if present
      };
    });
  }

  async unlockUser(
    userId: string,
    payload: { terminateSessions?: string, forcePasswordChange?: boolean, notifyUser?: boolean, reason: string },
    vendorContext: { correlationId: string, instanceId: string }
  ) {
    // Tenant-Scoped User Identity, Task 7: previously fell back to an
    // unscoped `username` lookup for any non-UUID input -- in a
    // multi-tenant deployment that's ambiguous (which tenant's "admin"?)
    // and, worse, mutates whichever row happens to match first across
    // every tenant. Per the plan's Task 7 decision (restrict any
    // account-mutating vendor command to UUID-only, per
    // TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md's explicit
    // recommendation): the vendor operator must resolve the target user's
    // real UUID first (via `getLockedUsers()`, which already returns
    // `user.id`, or any other cross-tenant support view) rather than this
    // endpoint guessing a tenant from a bare username.
    this.requireUuid(userId);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const previousAttempts = user.failedLoginCount;
    const previousLockedUntil = user.lockedUntil;

    // In a real implementation, we would set a flag for forced password change
    // user.forcePasswordChange = payload.forcePasswordChange;

    await this.userRepository.update(user.id, {
      failedLoginCount: 0,
      lockedUntil: null,
    });

    await this.auditService.log({
      action: 'VENDOR_REMOTE_UNLOCK',
      module: 'SECURITY',
      entityType: 'user',
      entityId: user.id,
      metadata: {
        vendorContext,
        reason: payload.reason,
        previousAttempts,
        previousLockedUntil,
        terminateSessions: payload.terminateSessions,
        forcePasswordChange: payload.forcePasswordChange,
      }
    });

    return { success: true };
  }

  async resetAttempts(
    userId: string,
    payload: { reason: string },
    vendorContext: { correlationId: string, instanceId: string }
  ) {
    // Tenant-Scoped User Identity, Task 7 -- same UUID-only restriction as
    // unlockUser() above, same rationale.
    this.requireUuid(userId);
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const previousAttempts = user.failedLoginCount;

    if (previousAttempts === 0) {
      return { success: true, message: 'Attempts were already 0' };
    }

    await this.userRepository.update(user.id, { failedLoginCount: 0 });

    await this.auditService.log({
      action: 'VENDOR_RESET_ATTEMPTS',
      module: 'SECURITY',
      entityType: 'user',
      entityId: user.id,
      metadata: {
        vendorContext,
        reason: payload.reason,
        previousAttempts,
      }
    });

    return { success: true };
  }

  async createUser(
    payload: {
      username: string;
      fullName: string;
      roles: string[];
      mustChangePassword?: boolean;
      isRecoveryAccount?: boolean;
      expiresAt?: string;
    },
    context: any
  ) {
    const existing = await this.userRepository.findOne({ where: { username: payload.username } });
    if (existing) {
      // If it's a recovery account and already exists, we might just update the password. But let's throw for safety unless we want to reset.
      throw new BadRequestException('User already exists');
    }

    const roles = [];
    for (const r of payload.roles) {
      const role = await this.roleRepository.findOne({ where: { name: r } });
      if (!role) throw new BadRequestException(`Role ${r} not found`);
      roles.push(role);
    }

    const tempPassword = crypto.randomBytes(12).toString('base64');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Tenant-Scoped User Identity, Task 5: `users.tenant_id` is now
    // `NOT NULL` at the DB level -- this call site never stamped a
    // tenantId at all (flagged in TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md's
    // Task 7 write-up as a correctness gap independent of that task's
    // broader UUID-vs-username decision), which would now hard-fail this
    // insert outright. Vendor remote-support tooling runs outside any HTTP
    // request's tenant context, so there is no ambient tenant to read here
    // the way UsersService.create() does -- fail fast with a clear error
    // rather than silently guess a tenant, until Task 7 decides how this
    // tooling should resolve/require a target tenant.
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    if (!tenantId) {
      throw new BadRequestException(
        'Unable to resolve a tenant for this request; cannot create a user without one. ' +
        'Vendor remote-support user creation currently requires an ambient tenant context.',
      );
    }

    const user = this.userRepository.create({
      username: payload.username,
      fullName: payload.fullName,
      passwordHash,
      roles,
      mustChangePassword: payload.mustChangePassword ?? false,
      isRecoveryAccount: payload.isRecoveryAccount ?? false,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      createdBy: 'SYSTEM_VENDOR_GATEWAY',
      tenantId,
    });

    const saved = await this.userRepository.save(user);

    await this.auditService.log({
      action: payload.isRecoveryAccount ? 'RECOVERY_ADMIN_CREATED' : 'USER_CREATED',
      module: 'PLATFORM',
      entityType: 'user',
      entityId: saved.id,
      metadata: { username: saved.username, context },
    });

    return {
      userId: saved.id,
      username: saved.username,
      temporaryPassword: tempPassword,
    };
  }

  // -- Private helpers ---------------------------------------------------------

  /**
   * Tenant-Scoped User Identity, Task 7: shared UUID-format guard for every
   * account-mutating vendor command (`unlockUser()`, `resetAttempts()`; see
   * also `PasswordResetService.applyRemoteReset()`'s identical check). Not a
   * DB lookup -- purely a format check, so it fails fast with a clear,
   * actionable error before any query runs.
   */
  private requireUuid(value: string): void {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (!isUuid) {
      throw new BadRequestException(
        `Invalid target user identifier "${value}" -- vendor commands that mutate an account require the ` +
        `user's UUID (not username). Resolve the target user's id first via a support/admin view (e.g. ` +
        `GET /vendor/security/locked-users) before issuing this command.`,
      );
    }
  }
}
