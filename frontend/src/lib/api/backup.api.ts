import { apiClient } from './client';
import {
  BackupJob, RestoreJob, BackupSchedule, BackupStorageConfig, BackupHealth,
  AvailableStorageDriver, PaginatedResult, CreateBackupPayload, RestoreBackupPayload,
  CreateSchedulePayload, UpdateSchedulePayload, CreateStorageProviderPayload,
  VerifyBackupResult, PgToolsSettings, UpdatePgToolsSettingsPayload, DetectPgToolsResult,
  TestPgToolsResult, EngineStatus, DiagnosticsReport, RestoreReadinessReport, HealthCheckReport,
} from '../../types/backup.types';

export const backupApi = {
  // ── Backups ────────────────────────────────────────────────────────────
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<PaginatedResult<BackupJob>>('/backups', { params }).then((r) => r.data),

  history: (params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResult<BackupJob>>('/backups/history', { params }).then((r) => r.data),

  health: () => apiClient.get<BackupHealth>('/backups/health').then((r) => r.data),

  listStorageDrivers: () =>
    apiClient.get<AvailableStorageDriver[]>('/backups/storage-providers').then((r) => r.data),

  createStorageProvider: (payload: CreateStorageProviderPayload) =>
    apiClient.post<BackupStorageConfig>('/backups/storage-providers', payload).then((r) => r.data),

  listSchedules: () => apiClient.get<BackupSchedule[]>('/backups/schedules').then((r) => r.data),

  createSchedule: (payload: CreateSchedulePayload) =>
    apiClient.post<BackupSchedule>('/backups/schedule', payload).then((r) => r.data),

  updateSchedule: (id: string, payload: UpdateSchedulePayload) =>
    apiClient.patch<BackupSchedule>(`/backups/schedules/${id}`, payload).then((r) => r.data),

  deleteSchedule: (id: string) => apiClient.delete(`/backups/schedules/${id}`).then((r) => r.data),

  create: (payload: CreateBackupPayload) =>
    apiClient.post<BackupJob>('/backups', payload).then((r) => r.data),

  verify: (backupId: string) =>
    apiClient.post<VerifyBackupResult>('/backups/verify', { backupId }).then((r) => r.data),

  upload: (payload: CreateBackupPayload) =>
    apiClient.post<BackupJob & { uploadInstructions: string }>('/backups/upload', payload).then((r) => r.data),

  getOne: (id: string) => apiClient.get<BackupJob>(`/backups/${id}`).then((r) => r.data),

  getManifest: (id: string, passphrase?: string) =>
    apiClient.get<Record<string, unknown>>(`/backups/${id}/manifest`, { params: passphrase ? { passphrase } : undefined }).then((r) => r.data),

  download: (id: string) =>
    apiClient.get(`/backups/${id}/download`, { responseType: 'blob' }),

  cancel: (id: string) => apiClient.post<BackupJob>(`/backups/${id}/cancel`).then((r) => r.data),

  remove: (id: string) => apiClient.delete(`/backups/${id}`).then((r) => r.data),

  // ── Restore ────────────────────────────────────────────────────────────
  restore: (payload: RestoreBackupPayload) =>
    apiClient.post<RestoreJob>('/backups/restore', payload).then((r) => r.data),

  listRestores: (params?: { page?: number; limit?: number }) =>
    apiClient.get<PaginatedResult<RestoreJob>>('/backups/restores', { params }).then((r) => r.data),

  getRestore: (id: string) => apiClient.get<RestoreJob>(`/backups/restores/${id}`).then((r) => r.data),

  cancelRestore: (id: string) => apiClient.post<RestoreJob>(`/backups/restores/${id}/cancel`).then((r) => r.data),

  getRestoreReadiness: (backupId: string) =>
    apiClient.get<RestoreReadinessReport>(`/backups/${backupId}/restore-readiness`).then((r) => r.data),

  // ── Settings: Database Tools (pg_dump/pg_restore) ─────────────────────────
  getPgToolsSettings: () => apiClient.get<PgToolsSettings>('/backups/settings/pg-tools').then((r) => r.data),

  savePgToolsSettings: (payload: UpdatePgToolsSettingsPayload) =>
    apiClient.put<PgToolsSettings>('/backups/settings/pg-tools', payload).then((r) => r.data),

  detectPgTools: () =>
    apiClient.post<DetectPgToolsResult>('/backups/settings/pg-tools/detect').then((r) => r.data),

  testPgTools: (payload: UpdatePgToolsSettingsPayload) =>
    apiClient.post<TestPgToolsResult>('/backups/settings/pg-tools/test', payload).then((r) => r.data),

  // ── Database Backup Service health card ──────────────────────────────────
  getEngineStatus: () =>
    apiClient.get<EngineStatus>('/backups/settings/pg-tools/engine-status').then((r) => r.data),

  redetectEngine: () =>
    apiClient.post<EngineStatus>('/backups/settings/pg-tools/redetect').then((r) => r.data),

  validateEngine: () =>
    apiClient.post<TestPgToolsResult>('/backups/settings/pg-tools/validate').then((r) => r.data),

  // ── Diagnostics / health check ──────────────────────────────────────────
  getDiagnostics: () => apiClient.get<DiagnosticsReport>('/backups/diagnostics').then((r) => r.data),

  runHealthCheck: () => apiClient.post<HealthCheckReport>('/backups/settings/health-check').then((r) => r.data),
};

/** Triggers a browser download from the blob response of backupApi.download(). */
export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
