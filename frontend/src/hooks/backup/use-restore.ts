import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupApi } from '../../lib/api/backup.api';
import { RestoreBackupPayload } from '../../types/backup.types';
import { backupKeys } from './use-backup';

const ACTIVE_POLL_MS = 3000;

export const restoreKeys = {
  all: ['restores'] as const,
  lists: () => [...restoreKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...restoreKeys.lists(), filters] as const,
  details: () => [...restoreKeys.all, 'detail'] as const,
  detail: (id: string) => [...restoreKeys.details(), id] as const,
};

export const useRestores = (filters?: { page?: number; limit?: number }) => {
  return useQuery({
    queryKey: restoreKeys.list(filters || {}),
    queryFn: () => backupApi.listRestores(filters),
  });
};

export const useRestoreJob = (id?: string) => {
  return useQuery({
    queryKey: restoreKeys.detail(id || ''),
    queryFn: () => backupApi.getRestore(id as string),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as { status: string } | undefined;
      const active = data && ['pending', 'validating', 'running'].includes(data.status);
      return active ? ACTIVE_POLL_MS : false;
    },
  });
};

export const useCreateRestore = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RestoreBackupPayload) => backupApi.restore(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: restoreKeys.lists() });
      qc.invalidateQueries({ queryKey: backupKeys.lists() });
    },
  });
};

export const useCancelRestore = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backupApi.cancelRestore(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: restoreKeys.lists() });
      qc.invalidateQueries({ queryKey: restoreKeys.detail(id) });
    },
  });
};

/**
 * GET /backups/:id/restore-readiness — read-only pre-restore check (point 6
 * of the "Database Backup Service" review). `id` here is the BACKUP job id
 * being restored FROM, not a restore job id.
 *
 * TODO(restore-wizard): this hook is not yet wired into
 * frontend/src/app/(platform)/backup/restore/page.tsx's confirmation step --
 * the backend endpoint is fully implemented and this hook is ready to use;
 * wiring the wizard to call it before the final confirm button and render
 * the report is a follow-up (left as a TODO in that page per the review's
 * explicit scope guidance).
 */
export const useRestoreReadiness = (backupId?: string) => {
  return useQuery({
    queryKey: backupKeys.restoreReadiness(backupId || ''),
    queryFn: () => backupApi.getRestoreReadiness(backupId as string),
    enabled: !!backupId,
  });
};
