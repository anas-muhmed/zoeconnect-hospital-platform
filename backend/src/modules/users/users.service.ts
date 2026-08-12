import {
  Inject, Injectable, NotFoundException, ConflictException,
  ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { assertGlobalIdentityAvailable } from './global-identity-conflict.util';
import { Role } from '../rbac/entities/role.entity';
import { Permission } from '../rbac/entities/permission.entity';
import { AuditService } from '../audit/audit.service';
import type { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { AvailabilityCheckService } from '../../common/validation/availability-check.service';
import type { AvailabilityResponse } from '../../common/validation/field-availability.types';
import { getTenantScopedRepositoryToken } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import { TenantContextService } from '../platform/tenant/tenant-context.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)       private readonly userRepo:       Repository<User>,
    @InjectRepository(Role)       private readonly roleRepo:       Repository<Role>,
    @InjectRepository(Permission) private readonly permissionRepo: Repository<Permission>,
    private readonly auditService: AuditService,
    /**
     * Stage B (Checkpoint B3.3) — scoped repository for `findAll()`/
     * `findOne()` only (the two `GET`-backing methods). Every write path
     * and `findByHisEmployeeCode()` (called from `auth.service.ts` and
     * `his.controller.ts`, outside `UsersController`) keep using `userRepo`
     * above, unchanged.
     */
    @Inject(getTenantScopedRepositoryToken(User))
    private readonly scopedUserRepo: TenantScopedRepository<User>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,

    // Tenant-Scoped User Identity, Task 5 -- resolveRoles()'s global-role
    // fallback needs the seeded 'default' tenant's real UUID; see that
    // method's updated doc comment.
    private readonly tenantContextService: TenantContextService,

    // Reusable "is this value already taken" infrastructure -- shared with
    // (eventually) Organization/Tenant/Client/Vendor-Portal/Registration
    // forms, see common/validation/availability-check.service.ts.
    private readonly availabilityCheckService: AvailabilityCheckService,
  ) {}

  // ── List Users ────────────────────────────────────────────────────────────
  //
  // Branch scoping: a user only shows up in the list for a branch they've been
  // explicitly granted access to (user_branches table — see BranchService).
  // This applies to every caller, including SUPER_ADMIN — a super admin who
  // wants to manage a user with access to a different branch should switch
  // their active branch to that one rather than seeing everyone at once from
  // any branch.
  async findAll(
    page = 1,
    limit = 20,
    search?: string,
    branchId?: string | null,
  ) {
    const qb = (await this.scopedUserRepo.createQueryBuilder('u'))
      .leftJoinAndSelect('u.roles', 'roles')
      .select([
        'u.id', 'u.username', 'u.email', 'u.fullName',
        'u.isActive', 'u.lastLoginAt', 'u.createdAt', 'u.hisEmployeeCode',
        'roles.id', 'roles.name',
      ])
      .orderBy('u.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (branchId) {
      qb.innerJoin(
        'user_branches', 'ub',
        'ub.user_id = u.id AND ub.branch_id = :branchId',
        { branchId },
      );
    }

    if (search) {
      qb.andWhere('(u.username ILIKE :s OR u.email ILIKE :s OR u.full_name ILIKE :s)', {
        s: `%${search}%`,
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Get One ───────────────────────────────────────────────────────────────
  async findOne(id: string): Promise<User> {
    const qb = await this.scopedUserRepo.createQueryBuilder('user');
    const user = await qb
      .leftJoinAndSelect('user.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'rolePermissions')
      .leftJoinAndSelect('user.directPermissions', 'directPermissions')
      .where('user.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    // A5.5 API Contract Audit: findAll() above already excludes tenantId via
    // its query-builder .select(), but this eager findOne() has no
    // equivalent projection (relations make a plain `select` array risky to
    // hand-craft here). Strip post-fetch so the GET response doesn't leak
    // tenantId -- otherwise a client that round-trips this object into
    // PATCH /users/:id (which uses the strict-whitelist UpdateUserDto) gets
    // rejected with "property tenantId should not exist", the same failure
    // class found live on feedback_settings.
    delete (user as { tenantId?: string | null }).tenantId;
    return user;
  }

  // ── Availability Check ────────────────────────────────────────────────────
  //
  // Backs `GET /users/check-availability`. Mirrors
  // `assertGlobalIdentityAvailable()`'s scope exactly (global,
  // case-insensitive, same `excludeUserId` semantics for the edit-my-own-
  // user case) so a "yes, available" response here can never be
  // contradicted by the real check that runs inside create()/update() --
  // this is a live pre-check against the same rule, not a separate one that
  // could drift out of sync with it.
  //
  // Uses the shared AvailabilityCheckService rather than re-querying here
  // directly -- Organization/Tenant/Client/Vendor-Portal/Registration are
  // expected to add their own thin `checkAvailability()`-style method on
  // their own service, calling that same shared service with their own
  // repo/columns, rather than duplicating this query shape.
  async checkAvailability(params: {
    username?: string;
    email?: string;
    excludeUserId?: string;
  }): Promise<AvailabilityResponse> {
    const { username, email, excludeUserId } = params;

    if (excludeUserId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(excludeUserId)) {
      throw new BadRequestException('excludeUserId must be a valid UUID');
    }

    return this.availabilityCheckService.checkFields([
      { field: 'username', repo: this.userRepo, column: 'username', value: username, excludeId: excludeUserId },
      { field: 'email', repo: this.userRepo, column: 'email', value: email, excludeId: excludeUserId },
    ]);
  }

  // ── Reverse HIS mapping lookup ───────────────────────────────────────────
  //
  // The Users admin UI only ever writes ZoeConnect-user -> hisEmployeeCode (see
  // create/update below). The Registration Assistant needs the other
  // direction: given the employeeCode HIS resolved for the currently
  // logged-in HIS user, find (if any) the ZoeConnect user it's mapped to. Returns
  // null rather than throwing -- an unmapped HIS user is an expected,
  // non-error outcome (most receptionists may have no ZoeConnect account at all;
  // the workstation-based flow still works for them, just without an
  // identity label or permission-gated "Change Configuration").
  //
  // Tenant-Scoped User Identity, Task 2 (TENANT_SCOPED_IDENTITY_IMPLEMENTATION_PLAN.md):
  // `hisEmployeeCode` had no uniqueness constraint at all -- tenant-scoped or
  // global -- and this lookup matched on it alone, globally, across every
  // tenant in the database. That's the single most severe finding in the
  // identity audit, since this method backs a live auto-login path
  // (`AuthService.hisLogin()`): a HIS employee code that happens to collide
  // across two different hospitals' ZoeConnect tenants would auto-log the caller
  // into whichever row matched first. `tenantId` is now a required
  // parameter, not optional -- there's no safe default here the way a
  // nullable filter might imply; every caller must have already resolved a
  // real tenant (both call sites use `req.tenantId`, set ambiently by
  // `SubdomainTenantMiddleware` on every request, `@Public()` or not).
  async findByHisEmployeeCode(hisEmployeeCode: string, tenantId: string): Promise<User | null> {
    if (!hisEmployeeCode) return null;
    // Built manually (no `relations` option) rather than
    // `this.userRepo.findOne({ relations: [...] })` -- see `findOne()`
    // above's comment. `Repository.findOne()` sets an internal `take(1)`,
    // which combined with the eager, multi-to-many joins here
    // (roles/roles.permissions/directPermissions) trips TypeORM's
    // pagination-safety rewrite and throws
    // `column distinctAlias.User_id does not exist`.
    return this.userRepo.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'rolePermissions')
      .leftJoinAndSelect('user.directPermissions', 'directPermissions')
      .where('user.his_employee_code = :hisEmployeeCode', { hisEmployeeCode })
      .andWhere('user.is_active = true')
      .andWhere('user.tenant_id = :tenantId', { tenantId })
      .getOne();
  }

  // ── Assign direct permissions ─────────────────────────────────────────────
  //
  // Tenant-Scoped User Identity, Task 6: `Permission` is deliberately NOT
  // tenant-filtered here, unlike `resolveRoles()` below. Per
  // OWNERSHIP_MODEL_AUDIT.md, `Permission` is a genuinely global, shared
  // system catalog -- every tenant sees the same fixed permission-key set
  // (`PLATFORM:USERS:CREATE`, etc.), there is no such thing as a
  // tenant-owned custom permission the way there is a tenant-owned custom
  // Role. This is a deliberate, reviewed exception, not an oversight left
  // inconsistent with `resolveRoles()`'s tenant check.
  async assignPermissions(id: string, permissionIds: string[], actorId: string): Promise<User> {
    // Built manually rather than `relations: [...]` -- see `findOne()`'s
    // comment above; the eager multi-to-many joins here trip TypeORM's
    // `distinctAlias.User_id does not exist` pagination bug when combined
    // with `Repository.findOne()`'s internal `take(1)`.
    const user = await this.userRepo.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'rolePermissions')
      .leftJoinAndSelect('user.directPermissions', 'directPermissions')
      .where('user.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException(`User ${id} not found`);

    const permissions = permissionIds.length
      ? await this.permissionRepo.findBy({ id: In(permissionIds) })
      : [];

    user.directPermissions = permissions;
    await this.userRepo.save(user);

    await this.auditService.log({
      action: 'USER_PERMISSIONS_UPDATED',
      module: 'PLATFORM',
      userId: actorId,
      entityType: 'user',
      entityId: id,
      newValue: { permissionIds },
    });

    return this.findOne(id);
  }

  // ── Create ────────────────────────────────────────────────────────────────
  async create(dto: CreateUserDto, createdById: string): Promise<User> {
    const roles = await this.resolveRoles(dto.roleIds);

    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    // Tenant-Scoped User Identity, Task 5: `users.tenant_id` is now
    // `NOT NULL` at the DB level. `currentTenantIdOrNull()` legitimately
    // returns `null` for background/system call sites (no request-scoped
    // tenant context, or `runAsSystem()`) -- user creation has no such call
    // site today (it's an admin HTTP action, always request-scoped via
    // `TenantContextInterceptor`), so this is a defensive fail-fast, not an
    // expected runtime path. Throwing here (with a clear message) is
    // strictly better than letting Postgres reject the insert with a bare
    // NOT NULL violation.
    if (!tenantId) {
      throw new BadRequestException('Unable to resolve a tenant for this request; cannot create a user without one.');
    }

    // ZoeConnect Identity Architecture Migration, Phase 4.1: global,
    // case-insensitive duplicate check (mirrors the DB-level
    // uq_users_username_ci / uq_users_email_ci indexes from Phase 4's
    // 1788500000000-GlobalIdentityUniqueness.ts). Previously this checked
    // only within `tenantId` -- from the era when the DB constraint itself
    // was tenant-scoped, and a cross-tenant collision was safely caught by
    // that narrower constraint at save() time with a less specific error.
    // Now that the DB constraint is global, this check must be too, or a
    // genuine cross-tenant collision would bypass it and surface as a raw
    // Postgres 23505 instead of this friendly ConflictException.
    await assertGlobalIdentityAvailable(this.userRepo, { username: dto.username, email: dto.email });

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      fullName: dto.fullName ?? null,
      roles,
      isActive: dto.isActive ?? true,
      mustChangePassword: dto.mustChangePassword ?? false,
      isRecoveryAccount: dto.isRecoveryAccount ?? false,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      createdBy: createdById,
      hisEmployeeCode: dto.hisEmployeeCode || null,
      tenantId,
    });

    const saved = await this.userRepo.save(user);

    await this.auditService.log({
      action: 'USER_CREATED',
      module: 'PLATFORM',
      userId: createdById,
      entityType: 'user',
      entityId: saved.id,
      newValue: { username: saved.username, email: saved.email, roleIds: dto.roleIds },
    });

    return this.findOne(saved.id);
  }

  // ── Update ────────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateUserDto, updatedById: string): Promise<User> {
    const user = await this.findOne(id);

    // ZoeConnect Identity Architecture Migration, Phase 4.1: global,
    // case-insensitive duplicate check, same rationale as create()'s above
    // -- this replaces the former tenant-scoped `Not(id)` clash lookups,
    // which (like create()'s) would let a genuine cross-tenant collision
    // bypass this check and hit the global unique index at save() time
    // instead, surfacing as a raw Postgres 23505 rather than this
    // ConflictException. `excludeUserId: id` keeps a user's own unchanged
    // username/email from "conflicting" with itself.
    await assertGlobalIdentityAvailable(this.userRepo, {
      username: dto.username && dto.username !== user.username ? dto.username : undefined,
      email: dto.email && dto.email !== user.email ? dto.email : undefined,
      excludeUserId: id,
    });

    const oldRoleIds = user.roles?.map((r) => r.id) ?? [];

    // Update scalar fields
    const updatePayload = {
      ...(dto.username !== undefined && { username: dto.username }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.fullName !== undefined && { fullName: dto.fullName }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.mustChangePassword !== undefined && { mustChangePassword: dto.mustChangePassword }),
      ...(dto.hisEmployeeCode !== undefined && { hisEmployeeCode: dto.hisEmployeeCode || null }),
    };

    if (Object.keys(updatePayload).length > 0) {
      await this.userRepo.update(id, updatePayload);
    }

    if (dto.hisEmployeeCode !== undefined) {
        user.hisEmployeeCode = dto.hisEmployeeCode || null;
    }

    // Update roles relation if provided
    //
    // Built manually rather than `this.userRepo.findOne({ relations: ['roles'] })`
    // -- see `findOne()`'s comment above. Even a single to-many relation is
    // enough to trip TypeORM's `distinctAlias.User_id does not exist`
    // pagination bug here, since `Repository.findOne()` always sets an
    // internal `take: 1`. This was the one remaining call site still using
    // that pattern -- and since the Edit User form always submits `roleIds`,
    // this branch runs on every save, making it the actual live cause of the
    // 500 on PATCH /users/:id.
    if (Array.isArray(dto.roleIds)) {
      const roles = dto.roleIds.length > 0 ? await this.resolveRoles(dto.roleIds) : [];
      const freshUser = await this.userRepo.createQueryBuilder('user')
        .leftJoinAndSelect('user.roles', 'roles')
        .where('user.id = :id', { id })
        .getOne();
      if (freshUser) {
        freshUser.roles = roles;
        await this.userRepo.save(freshUser);
      }
    }

    await this.auditService.log({
      action: 'USER_UPDATED',
      module: 'PLATFORM',
      userId: updatedById,
      entityType: 'user',
      entityId: id,
      oldValue: { roleIds: oldRoleIds },
      newValue: dto as Record<string, unknown>,
    });

    return this.findOne(id);
  }

  // ── Toggle Active ─────────────────────────────────────────────────────────
  async setActive(id: string, isActive: boolean, updatedById: string): Promise<void> {
    const user = await this.findOne(id);
    const isSystem = user.roles?.some((r) => r.isSystem);
    if (isSystem && !isActive) {
      throw new ForbiddenException('Cannot deactivate system accounts');
    }
    await this.userRepo.update(id, { isActive });
    await this.auditService.log({
      action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      module: 'PLATFORM',
      userId: updatedById,
      entityType: 'user',
      entityId: id,
    });
  }

  // ── Admin Password Reset ──────────────────────────────────────────────────
  async adminResetPassword(id: string, newPassword: string | undefined, adminId: string) {
    await this.findOne(id);
    const generatedPassword = newPassword ?? this.generateTempPassword();
    const hash = await bcrypt.hash(generatedPassword, BCRYPT_ROUNDS);
    await this.userRepo.update(id, { passwordHash: hash, mustChangePassword: true });
    await this.auditService.log({
      action: 'ADMIN_PASSWORD_RESET',
      module: 'PLATFORM',
      userId: adminId,
      entityType: 'user',
      entityId: id,
    });
    return { temporaryPassword: generatedPassword };
  }

  // ── Unlock Account ────────────────────────────────────────────────────────
  async unlockAccount(id: string, adminId: string): Promise<void> {
    await this.findOne(id);
    await this.userRepo.update(id, { failedLoginCount: 0, lockedUntil: null as any });
    await this.auditService.log({
      action: 'ACCOUNT_UNLOCKED',
      module: 'PLATFORM',
      userId: adminId,
      entityType: 'user',
      entityId: id,
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  //
  // Tenant-Scoped User Identity, Task 6: previously an unfiltered
  // `id: In(roleIds)` lookup -- a caller in Tenant A could assign a role ID
  // belonging to Tenant B by ID alone, since nothing here ever checked which
  // tenant a role belongs to. Scoped to "this caller's own tenant's custom
  // roles, OR a global system role." Any submitted role ID that resolves to
  // neither is correctly rejected below as "not found" rather than silently
  // dropped -- from the caller's perspective a cross-tenant role ID and a
  // nonexistent one should look identical, not leak which tenant it
  // actually belongs to.
  //
  // Tenant-Scoped User Identity, Task 5 correction (found during Task 5's
  // pre-flight, not part of Task 6's original shipped fix): Task 6, above,
  // was written assuming global system roles (SUPER_ADMIN, HOSPITAL_ADMIN,
  // etc.) carry `tenantId: NULL` -- true when Task 6 was written, but Task 1
  // (same day, sequenced earlier) had already backfilled every NULL-tenant
  // `roles` row to the seeded 'default' tenant's real UUID, and
  // `seed-platform.ts`/`TenantProvisioningService` both confirm system
  // roles are a genuinely global, SINGLE shared catalog -- every tenant's
  // SUPER_ADMIN user points at the exact same `Role` row
  // (`TenantProvisioningService.stepEnsureGlobalRoles()`'s own doc comment:
  // "no per-tenant rows created"), which today carries `tenantId: 'default'
  // tenant's UUID`, never `NULL`. As shipped, Task 6's `tenantId: IsNull()`
  // fallback could therefore never match a real row again after Task 1 ran
  // -- any tenant other than 'default' assigning a global system role via
  // this method (e.g. a cloud tenant's SUPER_ADMIN creating a second
  // HOSPITAL_ADMIN user) would incorrectly get "Role(s) not found." Fixed
  // here by widening the fallback to the seeded 'default' tenant's real
  // UUID, mirroring the exact "null-vs-default equivalence" pattern already
  // used by `AuthService.isSetupRequired()`/pre-Task-5 `setupSuperAdmin()`.
  private async resolveRoles(roleIds: string[]): Promise<Role[]> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const defaultTenantId = await this.tenantContextService.getCurrentTenantId().catch(() => null);
    const globalTenantIds = [defaultTenantId].filter((id): id is string => !!id);

    const roles = await this.roleRepo.find({
      where: tenantId
        ? [
            { id: In(roleIds), tenantId },
            ...globalTenantIds.map((id) => ({ id: In(roleIds), tenantId: id })),
          ]
        : globalTenantIds.map((id) => ({ id: In(roleIds), tenantId: id })),
    });
    const missing = roleIds.filter((id) => !roles.find((r) => r.id === id));
    if (missing.length) {
      throw new NotFoundException(`Role(s) not found: ${missing.join(', ')}`);
    }
    return roles;
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@$!';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }
}
