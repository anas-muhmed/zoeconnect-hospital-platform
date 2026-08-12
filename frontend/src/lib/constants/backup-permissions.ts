/**
 * Backup & Restore RBAC permission key constants.
 *
 * The backend seeds these as 3-segment MODULE:RESOURCE:ACTION strings (see
 * backend/src/modules/backup/backup.permissions.ts) — resource is fixed to
 * 'BACKUP' even though the spec names the actions with only 2 segments, to
 * stay consistent with every other module's Permission schema.
 */
export const BACKUP_PERMISSIONS = {
  READ: 'BACKUP:BACKUP:READ',
  CREATE: 'BACKUP:BACKUP:CREATE',
  DOWNLOAD: 'BACKUP:BACKUP:DOWNLOAD',
  DELETE: 'BACKUP:BACKUP:DELETE',
  RESTORE: 'BACKUP:BACKUP:RESTORE',
  SCHEDULE: 'BACKUP:BACKUP:SCHEDULE',
  VERIFY: 'BACKUP:BACKUP:VERIFY',
  SETTINGS: 'BACKUP:BACKUP:SETTINGS',
} as const;

export type BackupPermission = typeof BACKUP_PERMISSIONS[keyof typeof BACKUP_PERMISSIONS];
