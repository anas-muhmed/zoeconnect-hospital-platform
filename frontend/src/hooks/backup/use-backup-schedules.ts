import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupApi } from '../../lib/api/backup.api';
import { CreateSchedulePayload, UpdateSchedulePayload } from '../../types/backup.types';
import { backupKeys } from './use-backup';

export const useBackupSchedules = () => {
  return useQuery({
    queryKey: backupKeys.schedules,
    queryFn: () => backupApi.listSchedules(),
  });
};

export const useCreateBackupSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSchedulePayload) => backupApi.createSchedule(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.schedules }),
  });
};

export const useUpdateBackupSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateSchedulePayload }) => backupApi.updateSchedule(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.schedules }),
  });
};

export const useDeleteBackupSchedule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backupApi.deleteSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.schedules }),
  });
};
