import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { getTenantScopedRepositoryToken } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import type { TenantScopedRepository } from '../platform/tenant/repositories/tenant-scoped.repository';
import { TenantContextStorage } from '../platform/tenant/context/tenant-context-storage';
import type { ILicenseProvider } from '../platform/infrastructure/licensing/license-provider.interface';
import { LICENSE_PROVIDER } from '../platform/infrastructure/tokens';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission) private readonly permRepo: Repository<Permission>,
    /**
     * Stage B (Checkpoint B3.3) — scoped repository for `findAll()` only
     * (the sole live GET-backing method). `findOne()` below is unused by
     * any controller (confirmed via grep) and is left on the raw
     * repository, out of scope.
     */
    @Inject(getTenantScopedRepositoryToken(Permission))
    private readonly scopedPermRepo: TenantScopedRepository<Permission>,

    private readonly tenantContext: TenantContextStorage,

    // Non-licensed-module RBAC leak fix (see roles.service.ts for the full
    // writeup) -- same fix, same source of truth, applied here so
    // GET /rbac/permissions stops leaking unlicensed-module permissions
    // into the Roles & Permissions screen and the user role-mapping panel.
    @Inject(LICENSE_PROVIDER) private readonly licenseProvider: ILicenseProvider,
  ) {}

  private async getVisibleModuleCodes(): Promise<Set<string>> {
    const tenantId = await this.tenantContext.currentTenantIdOrNull();
    const [status, alwaysVisible] = await Promise.all([
      this.licenseProvider.getStatus(tenantId ?? undefined),
      this.permRepo.manager.query<{ code: string }[]>(
        `SELECT code FROM module_registry WHERE license_required = false`,
      ),
    ]);
    const codes = new Set<string>(status.licensedModules);
    for (const row of alwaysVisible) codes.add(row.code);
    return codes;
  }

  // List all permissions, optionally grouped by module
  async findAll(groupByModule?: boolean) {
    const [rows, visibleModules] = await Promise.all([
      this.scopedPermRepo.find({
        order: { moduleCode: 'ASC', resource: 'ASC', action: 'ASC' },
      }),
      this.getVisibleModuleCodes(),
    ]);
    const permissions = rows.filter((p) => visibleModules.has(p.moduleCode));

    if (!groupByModule) return permissions;

    // Group: { PLATFORM: { USERS: ['READ','CREATE',...], ... }, LOYALTY: {...} }
    return permissions.reduce<Record<string, Record<string, Permission[]>>>((acc, p) => {
      acc[p.moduleCode] ??= {};
      acc[p.moduleCode][p.resource] ??= [];
      acc[p.moduleCode][p.resource].push(p);
      return acc;
    }, {});
  }

  async findOne(id: string): Promise<Permission> {
    const p = await this.permRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Permission ${id} not found`);
    return p;
  }
}
