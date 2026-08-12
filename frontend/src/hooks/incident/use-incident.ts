import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { incidentApi } from '../../lib/api/incident.api';
import { Incident } from '../../types/incident.types';

export const incidentKeys = {
  all: ['incidents'] as const,
  lists: () => [...incidentKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...incidentKeys.lists(), filters] as const,
  details: () => [...incidentKeys.all, 'detail'] as const,
  detail: (id: string) => [...incidentKeys.details(), id] as const,
  timeline: (id: string) => [...incidentKeys.detail(id), 'timeline'] as const,
  attachments: (id: string) => [...incidentKeys.detail(id), 'attachments'] as const,
  investigations: (id: string) => [...incidentKeys.detail(id), 'investigations'] as const,
  dashboard: ['incident-dashboard'] as const,
  analytics: ['incident-analytics'] as const,
  settings: ['incident-settings'] as const,
};

export const useIncidents = (filters?: Record<string, any>) => {
  return useQuery({
    queryKey: incidentKeys.list(filters || {}),
    queryFn: () => incidentApi.getAll(filters),
  });
};

export const useIncident = (id: string) => {
  return useQuery({
    queryKey: incidentKeys.detail(id),
    queryFn: () => incidentApi.getById(id),
    enabled: !!id,
  });
};

export const useCreateIncident = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: incidentApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: incidentKeys.dashboard });
    },
  });
};

export const useUpdateIncident = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Incident>) => incidentApi.update(id, data),
    onSuccess: (updatedIncident) => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
      queryClient.setQueryData(incidentKeys.detail(id), updatedIncident);
      queryClient.invalidateQueries({ queryKey: incidentKeys.timeline(id) });
    },
  });
};

export const useIncidentWorkflow = (id: string) => {
  const queryClient = useQueryClient();
  
  const onSuccess = (updatedIncident: Incident) => {
    queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
    queryClient.setQueryData(incidentKeys.detail(id), updatedIncident);
    queryClient.invalidateQueries({ queryKey: incidentKeys.timeline(id) });
  };

  return {
    submit: useMutation({
      mutationFn: () => incidentApi.submit(id),
      onSuccess,
    }),
    acknowledge: useMutation({
      mutationFn: () => incidentApi.acknowledge(id),
      onSuccess,
    }),
    assign: useMutation({
      mutationFn: (investigatorId: string) => incidentApi.assign(id, investigatorId),
      onSuccess,
    }),
    close: useMutation({
      mutationFn: (data: any) => incidentApi.close(id, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
        queryClient.invalidateQueries({ queryKey: incidentKeys.detail(id) });
        queryClient.invalidateQueries({ queryKey: incidentKeys.timeline(id) });
      },
    }),
    reopen: useMutation({
      mutationFn: () => incidentApi.reopen(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
        queryClient.invalidateQueries({ queryKey: incidentKeys.detail(id) });
        queryClient.invalidateQueries({ queryKey: incidentKeys.timeline(id) });
      },
    }),
  };
};

export const useIncidentTimeline = (id: string) => {
  return useQuery({
    queryKey: incidentKeys.timeline(id),
    queryFn: () => incidentApi.getTimeline(id),
    enabled: !!id,
  });
};

export const useIncidentAttachments = (id: string) => {
  return useQuery({
    queryKey: incidentKeys.attachments(id),
    queryFn: () => incidentApi.getAttachments(id),
    enabled: !!id,
  });
};
