import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { incidentApi } from '../../lib/api/incident.api';
import { IncidentTriage } from '../../types/incident.types';

export const triageKeys = {
  triage: (incidentId: string) => ['incidents', 'detail', incidentId, 'triage'] as const,
  detail: (incidentId: string) => ['incidents', 'detail', incidentId] as const,
  timeline: (incidentId: string) => ['incidents', 'detail', incidentId, 'timeline'] as const,
};

export const useIncidentTriage = (incidentId: string) => {
  return useQuery({
    queryKey: triageKeys.triage(incidentId),
    queryFn: () => incidentApi.getTriage(incidentId),
    enabled: !!incidentId,
    retry: false,
  });
};

export const useCreateTriage = (incidentId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentTriage>) => incidentApi.createTriage(incidentId, data),
    // Invalidate the shared `['incidents']` prefix (see use-incident-investigation.ts
    // for the full story) so the Incident Management table, this detail
    // page, and the triage/timeline queries all refresh together instead of
    // only the two keys redefined in this file.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents'] }),
  });
};

export const useUpdateTriage = (incidentId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentTriage>) => incidentApi.updateTriage(incidentId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents'] }),
  });
};

export const useBeginContainment = (incidentId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => incidentApi.beginContainment(incidentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incidents'] }),
  });
};
