import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupApi } from '../../lib/api/backup.api';
import { UpdatePgToolsSettingsPayload } from '../../types/backup.types';
import { backupKeys } from './use-backup';

/** GET /backups/settings/pg-tools — current configured/detected paths + last test result. Viewable by BACKUP:READ. */
export const usePgToolsSettings = () => {
  return useQuery({
    queryKey: backupKeys.pgTools,
    queryFn: () => backupApi.getPgToolsSettings(),
  });
};

/** PUT /backups/settings/pg-tools — saves the paths; backend runs+persists a test as part of saving. */
export const useSavePgToolsSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePgToolsSettingsPayload) => backupApi.savePgToolsSettings(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.pgTools }),
  });
};

/** POST /backups/settings/pg-tools/detect — scans common install locations; does not save automatically. */
export const useDetectPgTools = () => {
  return useMutation({
    mutationFn: () => backupApi.detectPgTools(),
  });
};

/** POST /backups/settings/pg-tools/test — tests unsaved values (before Save). Never throws server-side; resolves {ok, message, ...}. */
export const useTestPgTools = () => {
  return useMutation({
    mutationFn: (payload: UpdatePgToolsSettingsPayload) => backupApi.testPgTools(payload),
  });
};

// ── Database Backup Service health card ──────────────────────────────────────

/** GET /backups/settings/pg-tools/engine-status — the "Database Backup Service" health card's data source. */
export const useEngineStatus = () => {
  return useQuery({
    queryKey: backupKeys.engineStatus,
    queryFn: () => backupApi.getEngineStatus(),
  });
};

/** POST /backups/settings/pg-tools/redetect — "Re-detect Installation": re-runs local + Docker detection, returns fresh status. */
export const useRedetectEngine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backupApi.redetectEngine(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: backupKeys.engineStatus });
      qc.invalidateQueries({ queryKey: backupKeys.pgTools });
    },
  });
};

/** POST /backups/settings/pg-tools/validate — "Validate": tests the currently-resolved engine and persists the result. */
export const useValidateEngine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backupApi.validateEngine(),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.engineStatus }),
  });
};

// ── Diagnostics / unified health check ───────────────────────────────────────

/** GET /backups/diagnostics — "is this environment ready to back up" report. */
export const useBackupDiagnostics = (enabled = false) => {
  return useQuery({
    queryKey: backupKeys.diagnostics,
    queryFn: () => backupApi.getDiagnostics(),
    enabled,
  });
};

/** POST /backups/settings/health-check — "Run Health Check": one aggregated pass/warn/fail report, replaces the separate Validate/Re-detect buttons. */
export const useRunHealthCheck = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backupApi.runHealthCheck(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: backupKeys.engineStatus });
      qc.invalidateQueries({ queryKey: backupKeys.pgTools });
    },
  });
};
