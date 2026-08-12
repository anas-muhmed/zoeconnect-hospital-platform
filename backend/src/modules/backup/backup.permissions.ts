/**
 * Backup & Restore RBAC permission key constants.
 *
 * The spec names these BACKUP:READ / BACKUP:CREATE / BACKUP:DOWNLOAD /
 * BACKUP:DELETE / BACKUP:RESTORE / BACKUP:SCHEDULE / BACKUP:VERIFY /
 * BACKUP:SETTINGS (module:action, 2 segments) -- but this codebase's
 * `Permission` entity/table (module_code, resource, action) and its
 * `key` getter always produce a 3-segment MODULE:RESOURCE:ACTION string
 * (see rbac/entities/permission.entity.ts and every other module's
 * migration, e.g. 'INCIDENT:INCIDENTS:READ'). To stay consistent with the
 * schema every other module uses (rather than special-casing this one
 * module to 2 segments), `resource` is fixed to 'BACKUP' and the spec's
 * literal action names become the ACTION segment -- e.g. spec's
 * "BACKUP:READ" becomes 'BACKUP:BACKUP:READ' here. The action names
 * themselves are unchanged from the spec.
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
