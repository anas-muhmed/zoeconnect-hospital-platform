import {
  Controller, Get, Post, Body, Param, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';
import type { User } from '../users/entities/user.entity';
import { RestoreService } from './restore.service';
import { RestoreBackupDto } from './dto/restore-backup.dto';
import { BACKUP_PERMISSIONS } from './backup.permissions';

/**
 * RestoreController — deliberately mounted under the same `backups` prefix
 * as BackupController (per the spec's literal `POST /backups/restore`
 * endpoint) while remaining its own named class per the architecture list
 * ("BackupController, RestoreController"). Nest supports two controllers
 * sharing a path prefix; route-collision is avoided since BackupController
 * has no `restore*` routes of its own.
 */
@ApiTags('Backup & Restore')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('backups')
export class RestoreController {
  constructor(private readonly restoreService: RestoreService) {}

  @Post('restore')
  @RequirePermissions(BACKUP_PERMISSIONS.RESTORE)
  @Audit({ action: 'RESTORE_REQUEST', module: 'BACKUP', entityType: 'restore_job' })
  @ApiOperation({ summary: 'Restore from a backup. Requires explicit confirm:true — this is destructive.' })
  create(@Body() dto: RestoreBackupDto, @CurrentUser() actor: User) {
    return this.restoreService.create({ ...dto, createdById: actor.id });
  }

  @Get(':id/restore-readiness')
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'Read-only pre-restore readiness check for the backup with this id (:id is a BackupJob id, not a RestoreJob id): disk space, DB reachability, client tools, archive integrity, and version compatibility. Performs no destructive action.' })
  checkRestoreReadiness(@Param('id', ParseUUIDPipe) id: string) {
    return this.restoreService.checkRestoreReadiness(id);
  }

  @Get('restores')
  @RequirePermissions(BACKUP_PERMISSIONS.RESTORE)
  @ApiOperation({ summary: 'List restore jobs' })
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.restoreService.findAll({ page: page ? parseInt(page, 10) : undefined, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Get('restores/:id')
  @RequirePermissions(BACKUP_PERMISSIONS.RESTORE)
  @ApiOperation({ summary: 'Get a restore job by id, including its restore report once complete' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.restoreService.findOne(id);
  }

  @Post('restores/:id/cancel')
  @RequirePermissions(BACKUP_PERMISSIONS.RESTORE)
  @Audit({ action: 'CANCEL_RESTORE', module: 'BACKUP', entityType: 'restore_job' })
  @ApiOperation({ summary: 'Cancel a restore job before it has started making destructive changes' })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.restoreService.cancel(id);
  }
}
