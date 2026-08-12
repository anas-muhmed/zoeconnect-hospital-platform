// ── Backup & Restore module types ──────────────────────────────────────────
// Mirrors backend entities at backend/src/modules/backup/entities/*.entity.ts

export type BackupType =
  | 'full' | 'incremental' | 'differential' | 'manual' | 'scheduled'
  | 'pre_upgrade' | 'pre_restore';

export type BackupStatus =
  | 'pending' | 'running' | 'verifying' | 'completed' | 'failed' | 'cancelled';

export type BackupModuleName = 'database' | 'files' | 'configuration' | 'licensing' | 'tenant_configuration';

export const BACKUP_MODULES: BackupModuleName[] = ['database', 'files', 'configuration', 'licensing', 'tenant_configuration'];
export const BACKUP_TYPES_FOR_CREATE: BackupType[] = ['full', 'incremental', 'differential'];

export interface BackupJob {
  id: string;
  tenantId: string | null;
  type: BackupType;
  status: BackupStatus;
  modules: BackupModuleName[];
  storageConfigId: string | null;
  storageKey: string | null;
  manifest: Record<string, unknown> | null;
  checksumSha256: string | null;
  sizeBytes: string;
  compressedSizeBytes: string;
  compressionRatio: string | null;
  encrypted: boolean;
  appVersion: string | null;
  dbVersion: string | null;
  fileCount: number;
  databaseSizeBytes: string | null;
  durationMs: number | null;
  progress: number;
  errorMessage: string | null;
  createdById: string | null;
  scheduleId: string | null;
  bullJobId: string | null;
  cancelRequested: boolean;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RestoreMode =
  | 'entire_application' | 'database_only' | 'files_only'
  | 'configuration_only' | 'selected_modules' | 'selected_tenant';

export const RESTORE_MODES: RestoreMode[] = [
  'entire_application', 'database_only', 'files_only',
  'configuration_only', 'selected_modules', 'selected_tenant',
];

export type RestoreStatus =
  | 'pending' | 'validating' | 'running' | 'rolled_back'
  | 'completed' | 'failed' | 'cancelled';

export type VersionCompatibility = 'same' | 'older' | 'newer' | 'incompatible';

export interface RestoreJob {
  id: string;
  tenantId: string | null;
  sourceBackupJobId: string;
  mode: RestoreMode;
  modules: BackupModuleName[];
  status: RestoreStatus;
  confirmed: boolean;
  preRestoreBackupJobId: string | null;
  versionCompatibility: VersionCompatibility | null;
  restartRequired: boolean;
  rolledBack: boolean;
  validationReport: Record<string, unknown> | null;
  progress: number;
  errorMessage: string | null;
  createdById: string | null;
  bullJobId: string | null;
  cancelRequested: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BackupStorageDriver = 'local' | 's3' | 'azure' | 'gcs' | 'sftp' | 'network_share';

export const STORAGE_DRIVERS: BackupStorageDriver[] = ['local', 's3', 'azure', 'gcs', 'sftp', 'network_share'];

export interface BackupStorageConfig {
  id: string;
  tenantId: string | null;
  name: string;
  driver: BackupStorageDriver;
  config: Record<string, unknown>;
  isDefault: boolean;
  isActive: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSchedule {
  id: string;
  tenantId: string | null;
  name: string;
  cronExpression: string;
  backupType: BackupType;
  modules: BackupModuleName[];
  storageConfigId: string | null;
  retentionCount: number | null;
  retentionDays: number | null;
  encrypt: boolean;
  isActive: boolean;
  lastRunAt: string | null;
  lastBackupJobId: string | null;
  nextRunAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailableStorageDriver {
  driver: string;
  displayName: string;
  implemented: boolean;
}

export interface BackupHealth {
  storageProviders: AvailableStorageDriver[];
  recentFailures: number;
  oldestUnexpiredBackup: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export interface CreateBackupPayload {
  type?: BackupType;
  modules?: BackupModuleName[];
  storageConfigId?: string;
  encrypt?: boolean;
  passphrase?: string;
}

export interface RestoreBackupPayload {
  backupId: string;
  mode?: RestoreMode;
  modules?: BackupModuleName[];
  confirm: boolean;
  passphrase?: string;
}

export interface CreateSchedulePayload {
  name: string;
  cronExpression: string;
  backupType?: BackupType;
  modules?: BackupModuleName[];
  storageConfigId?: string;
  retentionCount?: number;
  retentionDays?: number;
  encrypt?: boolean;
  isActive?: boolean;
}

export type UpdateSchedulePayload = Partial<CreateSchedulePayload>;

export interface CreateStorageProviderPayload {
  name: string;
  driver: BackupStorageDriver;
  config?: Record<string, unknown>;
  isDefault?: boolean;
}

export interface VerifyBackupResult {
  valid: boolean;
  checksum?: string;
  reason?: string;
}

// ── pg_dump / pg_restore tool settings ──────────────────────────────────────
// Mirrors backend/src/modules/backup/services/pg-tools.service.ts

export type PgToolsPathSource = 'configured' | 'detected' | 'env' | 'default';

export interface PgToolsSettings {
  pgDumpPath: string | null;
  pgRestorePath: string | null;
  detectedPgDumpPath: string | null;
  detectedPgRestorePath: string | null;
  detectedVersion: string | null;
  lastTestedAt: string | null;
  lastTestStatus: 'success' | 'failure' | null;
  lastTestMessage: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  executionMode: PgExecutionMode;
  dockerContainerName: string | null;
  detectedDockerContainerName: string | null;
  effective: {
    pgDumpPath: string;
    pgRestorePath: string;
    pgDumpSource: PgToolsPathSource;
    pgRestoreSource: PgToolsPathSource;
  };
}

export type PgExecutionMode = 'auto' | 'local' | 'docker' | 'remote' | 'bundled';

export interface UpdatePgToolsSettingsPayload {
  pgDumpPath: string;
  pgRestorePath: string;
  executionMode?: PgExecutionMode;
  dockerContainerName?: string;
}

// ── Database Backup Service health card (PgEngineService) ───────────────────
// Mirrors backend/src/modules/backup/services/pg-engine.service.ts EngineStatus

export interface EngineStatus {
  status: 'healthy' | 'degraded' | 'unavailable';
  mode: 'local' | 'docker' | 'bundled' | 'unavailable';
  executionMode: PgExecutionMode;
  strategyLabel: string;
  version: string | null;
  location: string;
  detectedAutomatically: boolean;
  containerName: string | null;
  lastValidatedAt: string | null;
  lastValidationOk: boolean | null;
  lastValidationMessage: string | null;
}

// ── Diagnostics report (BackupDiagnosticsService) ────────────────────────────

export type VersionCompatibilityLevel = 'fully_compatible' | 'compatible_with_warning' | 'incompatible' | 'unknown';

export interface DiagnosticsReport {
  databaseReachable: boolean;
  backupToolOk: boolean;
  restoreToolOk: boolean;
  permissionsOk: boolean;
  storageWritable: boolean;
  estimatedBackupSizeBytes: number;
  estimatedDurationSeconds: number;
  estimatedDurationIsRoughGuess: boolean;
  versionCompatibility: {
    serverVersion: string | null;
    clientVersion: string | null;
    compatibility: VersionCompatibilityLevel;
    message: string;
  };
  messages: string[];
  checkedAt: string;
}

// ── Restore readiness (RestoreService.checkRestoreReadiness) ────────────────

export interface RestoreReadinessReport {
  backupJobId: string;
  diskSpaceOk: boolean;
  databaseReachable: boolean;
  clientToolsOk: boolean;
  backupArchiveOk: boolean;
  versionCompatibilityOk: boolean;
  overallReady: boolean;
  details: {
    availableDiskBytes: number | null;
    requiredDiskBytes: number;
    archiveChecksumVerified: boolean;
    appVersionCompatibility: VersionCompatibility;
    dbVersionCompatibility: VersionCompatibilityLevel;
    messages: string[];
  };
  checkedAt: string;
}

// ── Health check report (BackupHealthCheckService) ───────────────────────────

export type HealthCheckItemStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheckItem {
  key: string;
  label: string;
  status: HealthCheckItemStatus;
  message: string;
}

export interface HealthCheckReport {
  overallStatus: HealthCheckItemStatus;
  items: HealthCheckItem[];
  checkedAt: string;
}

export interface DetectPgToolsResult {
  pgDumpPath: string | null;
  pgRestorePath: string | null;
  version: string | null;
  candidates: string[];
}

export interface TestPgToolsResult {
  ok: boolean;
  pgDumpVersion?: string;
  pgRestoreVersion?: string;
  compatible?: boolean;
  message: string;
}
