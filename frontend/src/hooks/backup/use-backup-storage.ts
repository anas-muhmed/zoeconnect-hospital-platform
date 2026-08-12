import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupApi } from '../../lib/api/backup.api';
import { CreateStorageProviderPayload } from '../../types/backup.types';
import { backupKeys } from './use-backup';

/** GET /backups/storage-providers returns the *driver catalogue* (implemented
 * vs stub), not persisted destination rows -- there is no list-destinations
 * endpoint on the backend today, only POST to create one. This hook exposes
 * the catalogue; configured destinations are tracked client-side per-session
 * via the create mutation's cache until a list endpoint exists. */
export const useBackupStorageDrivers = () => {
  return useQuery({
    queryKey: backupKeys.storageDrivers,
    queryFn: () => backupApi.listStorageDrivers(),
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateBackupStorageProvider = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateStorageProviderPayload) => backupApi.createStorageProvider(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.storageProviders }),
  });
};
