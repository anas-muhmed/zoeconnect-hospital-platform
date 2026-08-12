import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { incidentApi } from '../../lib/api/incident.api';

export const commentKeys = {
  comments: (incidentId: string) => ['incidents', 'detail', incidentId, 'comments'] as const,
  timeline: (incidentId: string) => ['incidents', 'detail', incidentId, 'timeline'] as const,
};

export const useIncidentComments = (incidentId: string) => {
  return useQuery({
    queryKey: commentKeys.comments(incidentId),
    queryFn: () => incidentApi.getComments(incidentId),
    enabled: !!incidentId,
  });
};

export const useAddComment = (incidentId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string; visibility?: 'PUBLIC' | 'INTERNAL' }) => incidentApi.addComment(incidentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.comments(incidentId) });
      queryClient.invalidateQueries({ queryKey: commentKeys.timeline(incidentId) });
    },
  });
};
