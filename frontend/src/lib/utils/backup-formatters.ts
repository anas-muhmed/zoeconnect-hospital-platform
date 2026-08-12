import { BackupStatus, BackupType, RestoreStatus, RestoreMode, BackupModuleName } from '../../types/backup.types';

export const getBackupStatusLabel = (status: BackupStatus): string => {
  const map: Record<BackupStatus, string> = {
    pending: 'Pending',
    running: 'Running',
    verifying: 'Verifying',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  return map[status] || status;
};

export const getBackupStatusColor = (status: BackupStatus): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (status) {
    case 'pending': return 'default';
    case 'running': return 'info';
    case 'verifying': return 'secondary';
    case 'completed': return 'success';
    case 'failed': return 'error';
    case 'cancelled': return 'warning';
    default: return 'default';
  }
};

export const getRestoreStatusLabel = (status: RestoreStatus): string => {
  const map: Record<RestoreStatus, string> = {
    pending: 'Pending',
    validating: 'Validating',
    running: 'Running',
    rolled_back: 'Rolled Back',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };
  return map[status] || status;
};

export const getRestoreStatusColor = (status: RestoreStatus): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (status) {
    case 'pending': return 'default';
    case 'validating': return 'secondary';
    case 'running': return 'info';
    case 'rolled_back': return 'warning';
    case 'completed': return 'success';
    case 'failed': return 'error';
    case 'cancelled': return 'warning';
    default: return 'default';
  }
};

export const getBackupTypeLabel = (type: BackupType): string => {
  const map: Record<BackupType, string> = {
    full: 'Full',
    incremental: 'Incremental',
    differential: 'Differential',
    manual: 'Manual',
    scheduled: 'Scheduled',
    pre_upgrade: 'Pre-Upgrade Snapshot',
    pre_restore: 'Pre-Restore Snapshot',
  };
  return map[type] || type;
};

export const getRestoreModeLabel = (mode: RestoreMode): string => {
  const map: Record<RestoreMode, string> = {
    entire_application: 'Entire Application',
    database_only: 'Database Only',
    files_only: 'Files Only',
    configuration_only: 'Configuration Only',
    selected_modules: 'Selected Modules',
    selected_tenant: 'Selected Tenant',
  };
  return map[mode] || mode;
};

export const getModuleLabel = (mod: BackupModuleName): string => {
  const map: Record<BackupModuleName, string> = {
    database: 'Database',
    files: 'Files',
    configuration: 'Configuration',
    licensing: 'Licensing',
    tenant_configuration: 'Tenant Configuration',
  };
  return map[mod] || mod;
};

export const formatBytes = (bytes: string | number | null | undefined): string => {
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!n || Number.isNaN(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const value = n / Math.pow(1024, exp);
  return `${value.toFixed(exp === 0 ? 0 : 2)} ${units[exp]}`;
};

export const formatDuration = (ms: number | null | undefined): string => {
  if (!ms || ms <= 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
};
