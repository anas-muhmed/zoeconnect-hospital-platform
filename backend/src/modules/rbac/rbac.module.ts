import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacController } from './rbac.controller';
import { RolesService } from './roles.service';
import { PermissionsService } from './permissions.service';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { AuditModule } from '../audit/audit.module';
import { TenantModule } from '../platform/tenant/tenant.module';
import { createTenantScopedRepositoryProvider } from '../platform/tenant/repositories/tenant-scoped-repository.provider';
import { LicensingModule } from '../licensing/license.module';

/**
 * Stage B (Checkpoint B3.3) — `RolesService.findAll()`/`findOne()` and
 * `PermissionsService.findAll()` (the methods backing `GET /rbac/roles`,
 * `GET /rbac/roles/:id`, `GET /rbac/permissions`) use `TenantScopedRepository`
 * instances, alongside the raw repositories used for every write path.
 * `RbacController` has no consumers outside itself (unlike `LicenseService`/
 * `UsersService.findByHisEmployeeCode`), so this is a clean, fully
 * controller-local conversion.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Role, Permission]),
    AuditModule,
    TenantModule,
    // Non-licensed-module RBAC leak fix: RolesService/PermissionsService.findAll()
    // (backing GET /rbac/roles, GET /rbac/permissions -- consumed by the Roles &
    // Permissions screen and the user-edit role-mapping panel) previously returned
    // every tenant-scoped row with no regard to which modules are actually
    // licensed. Both services now filter by ILicenseProvider.getStatus(), the
    // same abstraction LicenseGuard already uses to gate module-specific routes.
    LicensingModule,
  ],
  controllers: [RbacController],
  providers: [
    RolesService,
    PermissionsService,
    createTenantScopedRepositoryProvider(Role, { mode: 'dry-run' }),
    createTenantScopedRepositoryProvider(Permission, { mode: 'dry-run' }),
  ],
  exports: [RolesService, PermissionsService, TypeOrmModule],
})
export class RbacModule {}
