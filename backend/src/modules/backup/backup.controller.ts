import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, ParseUUIDPipe, HttpCode, HttpStatus, StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { TenantContextInterceptor } from '../platform/tenant/context/tenant-context.interceptor';
import type { User } from '../users/entities/user.entity';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './scheduler/backup-scheduler.service';
import { BackupStorageProviderFactory } from './providers/backup-storage-provider.factory';
import { CreateBackupDto } from './dto/create-backup.dto';
import { VerifyBackupDto } from './dto/verify-backup.dto';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/create-schedule.dto';
import { CreateStorageProviderDto, UpdateStorageProviderDto } from './dto/create-storage-provider.dto';
import { UpdatePgToolsSettingsDto } from './dto/update-pg-tools-settings.dto';
import { BACKUP_PERMISSIONS } from './backup.permissions';
import { BackupVerificationService } from './services/backup-verification.service';
import { BackupStorageConfigService } from './services/backup-storage-config.service';
import { PgToolsService } from './services/pg-tools.service';
import { PgEngineService } from './services/pg-engine.service';
import { BackupDiagnosticsService } from './services/backup-diagnostics.service';
import { BackupHealthCheckService } from './services/backup-health-check.service';
import type { BackupStatus } from './entities/backup-job.entity';

@ApiTags('Backup & Restore')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantContextInterceptor)
@Controller('backups')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly schedulerService: BackupSchedulerService,
    private readonly storageProviderFactory: BackupStorageProviderFactory,
    private readonly verificationService: BackupVerificationService,
    private readonly storageConfigService: BackupStorageConfigService,
    private readonly pgToolsService: PgToolsService,
    private readonly pgEngineService: PgEngineService,
    private readonly diagnosticsService: BackupDiagnosticsService,
    private readonly healthCheckService: BackupHealthCheckService,
  ) {}

  // ── Settings: Database Tools (pg_dump/pg_restore) ───────────────────────
  // Routes registered before the generic ':id' routes below so Nest's
  // route-matching order never lets 'settings' be captured as an :id param.

  @Get('settings/pg-tools/engine-status')
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'Get the "Database Backup Service" health-card status: which strategy (local/docker/bundled/remote/unavailable) is currently resolved, version, location, and last validation result. This is what the normal (non-Advanced) Database Tools UI is built from.' })
  getEngineStatus() {
    return this.pgEngineService.getEngineStatus();
  }

  @Get('diagnostics')
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'Full "is this environment ready to back up" diagnostics report: DB reachability, backup/restore tool status, a permissions heuristic, default storage writability, estimated backup size/duration, and server-vs-client PostgreSQL version compatibility.' })
  getDiagnostics() {
    return this.diagnosticsService.runDiagnostics();
  }

  @Post('settings/health-check')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'BACKUP_HEALTH_CHECK', module: 'BACKUP', entityType: 'backup_tool_settings' })
  @ApiOperation({ summary: '"Run Health Check" -- re-detects the provider, and checks DB connectivity, backup/restore tools, storage capacity, the default destination, the scheduler, and encryption configuration, returning one aggregated pass/warn/fail report. Replaces the separate Validate/Re-detect buttons. More expensive than a read, hence SETTINGS-gated like validate/redetect.' })
  runHealthCheck(@CurrentUser() actor: User) {
    return this.healthCheckService.runFullHealthCheck(actor.id);
  }

  @Post('settings/pg-tools/redetect')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'REDETECT_BACKUP_PG_ENGINE', module: 'BACKUP', entityType: 'backup_tool_settings' })
  @ApiOperation({ summary: '"Re-detect Installation" -- re-runs local pg_dump/pg_restore detection AND Docker container detection, updates the cached results, and returns fresh engine status.' })
  redetectEngine(@CurrentUser() actor: User) {
    return this.pgEngineService.redetect(actor.id);
  }

  @Post('settings/pg-tools/validate')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'VALIDATE_BACKUP_PG_ENGINE', module: 'BACKUP', entityType: 'backup_tool_settings' })
  @ApiOperation({ summary: '"Validate" -- tests the CURRENTLY RESOLVED execution strategy (local/Docker/bundled) and persists the result so the health card reflects it.' })
  validateEngine(@CurrentUser() actor: User) {
    return this.pgEngineService.validate(actor.id);
  }

  @Get('settings/pg-tools')
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'Get the currently configured pg_dump/pg_restore paths, cached auto-detect result, and last test outcome. Viewable by any backup admin.' })
  getPgToolsSettings() {
    return this.pgToolsService.getSettings();
  }

  @Put('settings/pg-tools')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'UPDATE_BACKUP_PG_TOOLS_SETTINGS', module: 'BACKUP', entityType: 'backup_tool_settings' })
  @ApiOperation({ summary: 'Save the pg_dump/pg_restore paths. Runs a connectivity test as part of saving and persists the result.' })
  savePgToolsSettings(@Body() dto: UpdatePgToolsSettingsDto, @CurrentUser() actor: User) {
    return this.pgToolsService.saveSettings(dto.pgDumpPath, dto.pgRestorePath, actor.id, dto.executionMode, dto.dockerContainerName);
  }

  @Post('settings/pg-tools/detect')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'DETECT_BACKUP_PG_TOOLS', module: 'BACKUP', entityType: 'backup_tool_settings' })
  @ApiOperation({ summary: 'Scan common install locations for a PostgreSQL client-tools installation. Does NOT save automatically -- returns candidates for the admin to review and accept via PUT.' })
  detectPgTools() {
    return this.pgToolsService.detectInstallations();
  }

  @Post('settings/pg-tools/test')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'TEST_BACKUP_PG_TOOLS_UNSAVED', module: 'BACKUP' })
  @ApiOperation({ summary: 'Test UNSAVED pg_dump/pg_restore paths (e.g. right after typing/Browse, before Save). Never throws -- resolves { ok, message, ... }.' })
  testPgTools(@Body() dto: UpdatePgToolsSettingsDto) {
    return this.pgToolsService.testConfiguration(dto.pgDumpPath, dto.pgRestorePath);
  }

  // ── Backups ──────────────────────────────────────────────────────────────

  @Get()
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'List backups' })
  findAll(@Query('page') page?: string, @Query('limit') limit?: string, @Query('status') status?: string) {
    return this.backupService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status: status as BackupStatus | undefined,
    });
  }

  @Get('history')
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'Backup run history (alias of the list endpoint, newest-first)' })
  history(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.backupService.findAll({ page: page ? parseInt(page, 10) : undefined, limit: limit ? parseInt(limit, 10) : undefined });
  }

  @Get('health')
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'Backup subsystem health (storage providers, recent failures)' })
  health() {
    return this.backupService.health();
  }

  @Get('storage-providers')
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'List available backup storage driver types (implemented vs stub)' })
  listStorageDrivers() {
    return this.storageProviderFactory.listAvailableDrivers();
  }

  @Get('storage-providers/configs')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @ApiOperation({ summary: 'List configured backup storage destinations (credentials never included in the response)' })
  listStorageConfigs() {
    return this.storageConfigService.findAll();
  }

  @Get('storage-providers/configs/:id')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @ApiOperation({ summary: 'Get one backup storage destination (credentials never included in the response)' })
  getStorageConfig(@Param('id', ParseUUIDPipe) id: string) {
    return this.storageConfigService.findOne(id);
  }

  @Post('storage-providers')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'CREATE_BACKUP_STORAGE_DESTINATION', module: 'BACKUP', entityType: 'backup_storage_config' })
  @ApiOperation({ summary: 'Configure a backup storage destination (Local/Network Share/S3/Azure/GCS/SFTP). Credentials in `config` are encrypted at rest before saving.' })
  async createStorageProvider(@Body() dto: CreateStorageProviderDto, @CurrentUser() actor: User) {
    return this.storageConfigService.create(dto, actor.id);
  }

  @Patch('storage-providers/:id')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'UPDATE_BACKUP_STORAGE_DESTINATION', module: 'BACKUP', entityType: 'backup_storage_config' })
  @ApiOperation({ summary: 'Update a backup storage destination' })
  updateStorageProvider(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStorageProviderDto) {
    return this.storageConfigService.update(id, dto);
  }

  @Post('storage-providers/:id/set-default')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'SET_DEFAULT_BACKUP_STORAGE_DESTINATION', module: 'BACKUP', entityType: 'backup_storage_config' })
  @ApiOperation({ summary: 'Mark a destination as the default (unsets any other default for the same tenant)' })
  setDefaultStorageProvider(@Param('id', ParseUUIDPipe) id: string) {
    return this.storageConfigService.setDefault(id);
  }

  @Delete('storage-providers/:id')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'DELETE_BACKUP_STORAGE_DESTINATION', module: 'BACKUP', entityType: 'backup_storage_config' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a backup storage destination' })
  async removeStorageProvider(@Param('id', ParseUUIDPipe) id: string) {
    await this.storageConfigService.remove(id);
  }

  @Post('storage-providers/:id/test-connection')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'TEST_BACKUP_STORAGE_DESTINATION', module: 'BACKUP', entityType: 'backup_storage_config' })
  @ApiOperation({ summary: "Test connectivity/writability of a saved destination. Never throws -- resolves { ok, message } even for not-yet-implemented drivers." })
  testStorageProviderConnection(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: User) {
    return this.storageConfigService.testConnection(id, actor.id);
  }

  @Post('storage-providers/test-connection')
  @RequirePermissions(BACKUP_PERMISSIONS.SETTINGS)
  @Audit({ action: 'TEST_BACKUP_STORAGE_DESTINATION_UNSAVED', module: 'BACKUP' })
  @ApiOperation({ summary: 'Test connectivity for an UNSAVED destination config (same body shape as create) so an admin can verify before saving.' })
  testUnsavedStorageProviderConnection(@Body() dto: CreateStorageProviderDto, @CurrentUser() actor: User) {
    return this.storageConfigService.testConnectionUnsaved(dto.driver, dto.config ?? {}, actor.id);
  }

  @Get('storage-providers/:id/capacity')
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'Available/total space, backup usage, and health of a destination' })
  getStorageProviderCapacity(@Param('id', ParseUUIDPipe) id: string) {
    return this.storageConfigService.getCapacity(id);
  }

  @Get('schedules')
  @RequirePermissions(BACKUP_PERMISSIONS.SCHEDULE)
  @ApiOperation({ summary: 'List backup schedules' })
  listSchedules() {
    return this.schedulerService.findAll();
  }

  @Post('schedule')
  @RequirePermissions(BACKUP_PERMISSIONS.SCHEDULE)
  @Audit({ action: 'CREATE_BACKUP_SCHEDULE', module: 'BACKUP', entityType: 'backup_schedule' })
  @ApiOperation({ summary: 'Create a dynamic, admin-configurable backup schedule' })
  createSchedule(@Body() dto: CreateScheduleDto, @CurrentUser() actor: User) {
    return this.schedulerService.create(dto, actor.id);
  }

  @Patch('schedules/:id')
  @RequirePermissions(BACKUP_PERMISSIONS.SCHEDULE)
  @Audit({ action: 'UPDATE_BACKUP_SCHEDULE', module: 'BACKUP', entityType: 'backup_schedule' })
  @ApiOperation({ summary: 'Update a backup schedule' })
  updateSchedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedulerService.update(id, dto);
  }

  @Delete('schedules/:id')
  @RequirePermissions(BACKUP_PERMISSIONS.SCHEDULE)
  @Audit({ action: 'DELETE_BACKUP_SCHEDULE', module: 'BACKUP', entityType: 'backup_schedule' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a backup schedule' })
  async removeSchedule(@Param('id', ParseUUIDPipe) id: string) {
    await this.schedulerService.remove(id);
  }

  @Post()
  @RequirePermissions(BACKUP_PERMISSIONS.CREATE)
  @Audit({ action: 'CREATE_BACKUP', module: 'BACKUP', entityType: 'backup_job' })
  @ApiOperation({ summary: 'Create (enqueue) a manual backup' })
  create(@Body() dto: CreateBackupDto, @CurrentUser() actor: User) {
    return this.backupService.create({ ...dto, createdById: actor.id });
  }

  @Post('verify')
  @RequirePermissions(BACKUP_PERMISSIONS.VERIFY)
  @Audit({ action: 'VERIFY_BACKUP', module: 'BACKUP', entityType: 'backup_job' })
  @ApiOperation({ summary: 'Verify a backup archive\'s SHA-256 checksum + manifest structure' })
  async verify(@Body() dto: VerifyBackupDto) {
    const backupJob = await this.backupService.findOne(dto.backupId);
    if (!backupJob.storageKey || !backupJob.checksumSha256) {
      return { valid: false, reason: 'Backup has no stored archive/checksum yet' };
    }
    const provider = await this.backupService.resolveProvider(backupJob.storageConfigId);
    const stream = await provider.downloadStream(backupJob.storageKey);
    try {
      const checksum = await this.verificationService.verifyChecksum(stream, backupJob.checksumSha256);
      return { valid: true, checksum };
    } catch (err) {
      return { valid: false, reason: (err as Error).message };
    }
  }

  @Post('upload')
  @RequirePermissions(BACKUP_PERMISSIONS.CREATE)
  @Audit({ action: 'UPLOAD_BACKUP', module: 'BACKUP', entityType: 'backup_job' })
  @ApiOperation({ summary: 'Register an externally-produced backup archive (metadata only; upload the archive bytes to the resolved storage destination separately)' })
  async upload(@Body() dto: CreateBackupDto, @CurrentUser() actor: User) {
    // Full multipart streaming upload (Fastify @fastify/multipart, already
    // used elsewhere in this codebase — see CmsMediaController) is a
    // natural follow-up; scoped out of this iteration to keep the
    // create/execute/verify/restore state machine the priority. This
    // registers the metadata row so the endpoint's contract exists and a
    // client can PUT the archive to the storage destination this returns.
    const job = await this.backupService.create({ ...dto, createdById: actor.id });
    return { ...job, uploadInstructions: 'Multipart archive upload is not yet implemented — this registers backup metadata only.' };
  }

  @Get(':id')
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'Get a backup by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.backupService.findOne(id);
  }

  @Get(':id/manifest')
  @RequirePermissions(BACKUP_PERMISSIONS.READ)
  @ApiOperation({ summary: 'Read the manifest embedded in a backup archive' })
  getManifest(@Param('id', ParseUUIDPipe) id: string, @Query('passphrase') passphrase?: string) {
    return this.backupService.getManifest(id, passphrase);
  }

  @Get(':id/download')
  @RequirePermissions(BACKUP_PERMISSIONS.DOWNLOAD)
  @Audit({ action: 'DOWNLOAD_BACKUP', module: 'BACKUP', entityType: 'backup_job' })
  @ApiOperation({ summary: 'Stream-download a backup archive' })
  async download(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const { stream, job } = await this.backupService.getDownloadStream(id);
    return new StreamableFile(stream, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${job.id}.tar.gz${job.encrypted ? '.enc' : ''}"`,
    });
  }

  @Post(':id/cancel')
  @RequirePermissions(BACKUP_PERMISSIONS.CREATE)
  @Audit({ action: 'CANCEL_BACKUP', module: 'BACKUP', entityType: 'backup_job' })
  @ApiOperation({ summary: 'Request cancellation of a pending/running backup' })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.backupService.cancel(id);
  }

  @Delete(':id')
  @RequirePermissions(BACKUP_PERMISSIONS.DELETE)
  @Audit({ action: 'DELETE_BACKUP', module: 'BACKUP', entityType: 'backup_job' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a backup (archive + row)' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.backupService.delete(id);
  }
}
