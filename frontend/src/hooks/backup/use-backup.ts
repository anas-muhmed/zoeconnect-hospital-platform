import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupApi, triggerBlobDownload } from '../../lib/api/backup.api';
import { CreateBackupPayload } from '../../types/backup.types';

/** Poll interval while any job is still running/pending — no websocket channel
 * exists for backup jobs in this codebase (only token-queue has one via
 * useTokenSocket), so live progress is done via short-interval refetch
 * instead of inventing a new socket channel. */
const ACTIVE_POLL_MS = 3000;

export const backupKeys = {
  all: ['backups'] as const,
  lists: () => [...backupKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...backupKeys.lists(), filters] as const,
  history: (filters: Record<string, any>) => [...backupKeys.all, 'history', filters] as const,
  details: () => [...backupKeys.all, 'detail'] as const,
  detail: (id: string) => [...backupKeys.details(), id] as const,
  health: ['backup-health'] as const,
  storageDrivers: ['backup-storage-drivers'] as const,
  storageProviders: ['backup-storage-providers'] as const,
  schedules: ['backup-schedules'] as const,
  pgTools: ['backup-pg-tools-settings'] as const,
  engineStatus: ['backup-pg-engine-status'] as const,
  diagnostics: ['backup-diagnostics'] as const,
  restoreReadiness: (backupId: string) => ['backup-restore-readiness', backupId] as const,
};

export const useBackups = (filters?: { page?: number; limit?: number; status?: string }) => {
  return useQuery({
    queryKey: backupKeys.list(filters || {}),
    queryFn: () => backupApi.list(filters),
    refetchInterval: (query) => {
      const data = query.state.data as { data?: { status: string }[] } | undefined;
      const hasActive = data?.data?.some((j) => j.status === 'running' || j.status === 'pending' || j.status === 'verifying');
      return hasActive ? ACTIVE_POLL_MS : false;
    },
  });
};

export const useBackupHistory = (filters?: { page?: number; limit?: number }) => {
  return useQuery({
    queryKey: backupKeys.history(filters || {}),
    queryFn: () => backupApi.history(filters),
  });
};

export const useBackupHealth = () => {
  return useQuery({
    queryKey: backupKeys.health,
    queryFn: () => backupApi.health(),
    staleTime: 30_000,
  });
};

export const useBackup = (id?: string) => {
  return useQuery({
    queryKey: backupKeys.detail(id || ''),
    queryFn: () => backupApi.getOne(id as string),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as { status: string } | undefined;
      return data && (data.status === 'running' || data.status === 'pending' || data.status === 'verifying') ? ACTIVE_POLL_MS : false;
    },
  });
};

export const useCreateBackup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBackupPayload) => backupApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: backupKeys.lists() });
      qc.invalidateQueries({ queryKey: backupKeys.health });
    },
  });
};

export const useCancelBackup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backupApi.cancel(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: backupKeys.lists() });
      qc.invalidateQueries({ queryKey: backupKeys.detail(id) });
    },
  });
};

export const useDeleteBackup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backupApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: backupKeys.lists() });
      qc.invalidateQueries({ queryKey: backupKeys.health });
    },
  });
};

export const useVerifyBackup = () => {
  return useMutation({
    mutationFn: (backupId: string) => backupApi.verify(backupId),
  });
};

export const useDownloadBackup = () => {
  return useMutation({
    mutationFn: async ({ id, filename }: { id: string; filename: string }) => {
      const res = await backupApi.download(id);
      triggerBlobDownload(res.data as Blob, filename);
    },
  });
};

export const useBackupManifest = (id?: string) => {
  return useQuery({
    queryKey: [...backupKeys.detail(id || ''), 'manifest'],
    queryFn: () => backupApi.getManifest(id as string),
    enabled: !!id,
  });
};
