import {
  Inject, Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import type { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto } from './dto/create-role.dto';
import { AuditService } from '../audit/audit.service';
import { getTenantScopedRepositoryToken } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import type { ILicenseProvider } from '../platform/infrastructure/licensing/license-provider.interface';
import { LICENSE_PROVIDER } from '../platform/infrastructure/tokens';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission) private readonly permRepo: Repository<Permission>,
    private readonly auditService: AuditService,
    /**
     * Stage B (Checkpoint B3.3) — scoped repository for `findAll()`/
     * `findOne()` only. Every write path (`create`/`update`/
     * `assignPermissions`) keeps using `roleRepo` above, unchanged.
     */
    @Inject(getTenantScopedRepositoryToken(Role))
    private readonly scopedRoleRepo: TenantScopedRepository<Role>,

    // Stage B (Checkpoint B6) — write-path tenant stamping, mirroring audit.service.ts's pattern.
    private readonly tenantContext: TenantContextStorage,

    // Non-licensed-module RBAC leak fix: gates findAll()/findOne() by the
    // caller's currently-licensed modules, same abstraction LicenseGuard uses.
    @Inject(LICENSE_PROVIDER) private readonly licenseProvider: ILicenseProvider,
  ) {}

  /**
   * Non-licensed-module RBAC leak fix.
   *
   * Roles (and Permissions, see permissions.service.ts) are tagged with a
   * `moduleCode`, but `findAll()`/`findOne()` never checked it against the
   * tenant's actual license -- every role for every module the *product*
   * supports showed up in the Roles & Permissions screen and the user-edit
   * role-mapping panel, regardless of what the tenant is licensed for.
   *
   * A module is "visible" here if it's either currently licensed
   * (`ILicenseProvider.getStatus().licensedModules`, the same source
   * `LicenseGuard` already trusts) or not license-gated at all
   * (`module_registry.license_required = false` -- e.g. PLATFORM, TOKEN;
   * see `ALL_MODULE_CODES`'s comment in license.service.ts for why TOKEN is
   * deliberately excluded from the licensable-module list). Roles with a
   * `null` moduleCode (system roles like SUPER_ADMIN, not tied to any one
   * module) are always visible.
   */
  private async getVisibleModuleCodes(): Promise<Set<string>> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const [status, alwaysVisible] = await Promise.all([
      this.licenseProvider.getStatus(tenantId ?? undefined),
      this.roleRepo.manager.query<{ code: string }[]>(
        `SELECT code FROM module_registry WHERE license_required = false`,
      ),
    ]);
    const codes = new Set<string>(status.licensedModules);
    for (const row of alwaysVisible) codes.add(row.code);
    return codes;
  }

  private isModuleVisible(moduleCode: string | null, visible: Set<string>): boolean {
    return moduleCode == null || visible.has(moduleCode);
  }

  async findAll(): Promise<(Role & { userCount: number })[]> {
    const [roles, userCounts, visibleModules] = await Promise.all([
      this.scopedRoleRepo.find({ relations: ['permissions'], order: { name: 'ASC' } }),
      // Raw GROUP BY via join table — avoids adding a @OneToMany back-ref to Role entity
      this.roleRepo.manager.query<{ role_id: string; cnt: string }[]>(
        `SELECT role_id, COUNT(DISTINCT user_id)::int AS cnt FROM user_roles GROUP BY role_id`,
      ),
      this.getVisibleModuleCodes(),
    ]);

    const countMap: Record<string, number> = {};
    for (const row of userCounts) countMap[row.role_id] = Number(row.cnt);

    // A5.5 API Contract Audit: unfiltered find() leaks tenantId into the GET
    // response; PATCH /rbac/roles/:id uses the strict-whitelist UpdateRoleDto,
    // so a client that round-trips this object gets rejected with "property
    // tenantId should not exist" -- same failure class found live on
    // feedback_settings. Strip post-fetch (relations make a hand-crafted
    // `select` array risky here).
    return roles
      .filter((r) => this.isModuleVisible(r.moduleCode, visibleModules))
      .map((r) => {
        delete (r as { tenantId?: string | null }).tenantId;
        return Object.assign(r, { userCount: countMap[r.id] ?? 0 });
      });
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.scopedRoleRepo.findOne({
      where: { id },
      relations: ['permissions'],
    });
    if (!role) throw new NotFoundException(`Role ${id} not found`);
    const visibleModules = await this.getVisibleModuleCodes();
    if (!this.isModuleVisible(role.moduleCode, visibleModules)) {
      // Treat an unlicensed-module role as not found, same as it not
      // existing -- consistent with it never appearing in findAll().
      throw new NotFoundException(`Role ${id} not found`);
    }
    delete (role as { tenantId?: string | null }).tenantId;
    return role;
  }

  async create(dto: CreateRoleDto, actorId: string): Promise<Role> {
    // Tenant-Scoped User Identity, Task 4: resolved here (moved up from
    // below) so the duplicate-check can be tenant-scoped -- same pattern as
    // UsersService.create()/update(). `Role.name` still carries a GLOBAL
    // unique constraint at the DB level (Task 5 hasn't run yet, and
    // system roles are deliberately excluded from tenant-scoping regardless
    // -- see PHASE_10_DEFERRED_BACKLOG.md item 7), so this is an accuracy
    // improvement for custom, tenant-owned roles, not a safety regression.
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    // Tenant-Scoped User Identity, Task 5: `roles.tenant_id` is now
    // `NOT NULL` at the DB level -- same defensive fail-fast as
    // UsersService.create(), since custom role creation is always an admin
    // HTTP action with a request-scoped tenant context, never a background
    // call site that would legitimately hit `null` here.
    if (!tenantId) {
      throw new BadRequestException('Unable to resolve a tenant for this request; cannot create a role without one.');
    }

    const exists = await this.roleRepo.findOne({ where: { name: dto.name, tenantId } });
    if (exists) throw new ConflictException(`Role name "${dto.name}" already exists`);

    const permissions = dto.permissionIds?.length
      ? await this.permRepo.find({ where: { id: In(dto.permissionIds) } })
      : [];

    const role = this.roleRepo.create({
      name: dto.name,
      description: dto.description,
      permissions,
      isSystem: false,
      tenantId,
    });
    const saved = await this.roleRepo.save(role);

    await this.auditService.log({
      action: 'ROLE_CREATED',
      module: 'PLATFORM',
      userId: actorId,
      entityType: 'role',
      entityId: saved.id,
      newValue: { name: saved.name, permissionCount: permissions.length },
    });

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateRoleDto, actorId: string): Promise<Role> {
    const role = await this.findOne(id);
    if (role.isSystem) throw new ForbiddenException('Cannot modify system roles');

    if (dto.name && dto.name !== role.name) {
      // Tenant-Scoped User Identity, Task 4: `findOne()` above strips
      // `tenantId` off its return value (same A5.5 API-contract reason as
      // UsersService.findOne()), so fetch it directly -- safe, since `id`
      // is already a resolved, unique primary key from the tenant-scoped
      // `findOne()` above, not caller-supplied.
      const tenantId = (await this.roleRepo.findOne({ where: { id }, select: ['tenantId'] }))?.tenantId ?? null;
      const clash = await this.roleRepo.findOne({
        where: { name: dto.name, tenantId: tenantId === null ? IsNull() : tenantId },
      });
      if (clash) throw new ConflictException(`Role name "${dto.name}" already exists`);
    }

    const old = { name: role.name, permissionCount: role.permissions?.length };

    if (dto.permissionIds !== undefined) {
      role.permissions = dto.permissionIds.length
        ? await this.permRepo.find({ where: { id: In(dto.permissionIds) } })
        : [];
    }
    if (dto.name) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description ?? null;

    const saved = await this.roleRepo.save(role);

    await this.auditService.log({
      action: 'ROLE_UPDATED',
      module: 'PLATFORM',
      userId: actorId,
      entityType: 'role',
      entityId: id,
      oldValue: old,
      newValue: { name: saved.name, permissionCount: saved.permissions?.length },
    });

    return this.findOne(id);
  }

  async assignPermissions(id: string, dto: AssignPermissionsDto, actorId: string): Promise<Role> {
    const role = await this.findOne(id);
    if (role.isSystem) throw new ForbiddenException('Cannot modify system role permissions');

    const permissions = await this.permRepo.find({ where: { id: In(dto.permissionIds) } });
    role.permissions = permissions;
    await this.roleRepo.save(role);

    await this.auditService.log({
      action: 'ROLE_PERMISSIONS_ASSIGNED',
      module: 'PLATFORM',
      userId: actorId,
      entityType: 'role',
      entityId: id,
      newValue: { permissionIds: dto.permissionIds },
    });

    return this.findOne(id);
  }

  // ── Role Membership (which users hold this role) ────────────────────────────
  //
  // Used by module settings screens (e.g. Incident Notification Rules) that
  // target roles like "RISK_MANAGER" and need to show/manage the concrete
  // people behind that name, rather than treating it as an opaque string.
  // Raw queries against the `user_roles` join table, mirroring the pattern
  // already used by findAll()'s userCount aggregate above.

  async getRoleMembers(roleId: string): Promise<{ id: string; username: string; email: string; fullName: string | null }[]> {
    await this.findOne(roleId); // 404s + tenant-scopes if the role doesn't belong to this caller
    return this.roleRepo.manager.query(
      `SELECT u.id, u.username, u.email, u.full_name AS "fullName"
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       WHERE ur.role_id = $1
       ORDER BY u.full_name NULLS LAST, u.username`,
      [roleId],
    );
  }

  async addRoleMember(roleId: string, userId: string, actorId: string): Promise<void> {
    await this.findOne(roleId);
    const user = await this.roleRepo.manager.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!user.length) throw new NotFoundException(`User ${userId} not found`);

    await this.roleRepo.manager.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, roleId],
    );

    await this.auditService.log({
      action: 'ROLE_MEMBER_ADDED',
      module: 'PLATFORM',
      userId: actorId,
      entityType: 'role',
      entityId: roleId,
      newValue: { userId },
    });
  }

  async removeRoleMember(roleId: string, userId: string, actorId: string): Promise<void> {
    await this.findOne(roleId);
    await this.roleRepo.manager.query(
      `DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`,
      [userId, roleId],
    );

    await this.auditService.log({
      action: 'ROLE_MEMBER_REMOVED',
      module: 'PLATFORM',
      userId: actorId,
      entityType: 'role',
      entityId: roleId,
      oldValue: { userId },
    });
  }
}
