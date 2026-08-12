import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { incidentApi } from '../../lib/api/incident.api';
import { incidentKeys } from './use-incident';
import {
  IncidentCategory, IncidentType, IncidentSeverityLevel, IncidentNotificationRule, IncidentNotificationRole,
} from '../../types/incident.types';

export const useIncidentSettings = () => {
  return useQuery({
    queryKey: incidentKeys.settings,
    queryFn: () => incidentApi.getSettings(),
  });
};

export const useIncidentCategories = () => {
  return useQuery({
    queryKey: [...incidentKeys.settings, 'categories'],
    queryFn: () => incidentApi.getCategories(),
  });
};

export const useIncidentTypes = (categoryId?: string) => {
  return useQuery({
    queryKey: [...incidentKeys.settings, 'types', categoryId],
    queryFn: () => incidentApi.getTypes(categoryId),
  });
};

export const useIncidentSeverityLevels = () => {
  return useQuery({
    queryKey: [...incidentKeys.settings, 'severity'],
    queryFn: () => incidentApi.getSeverityLevels(),
  });
};

export const useIncidentRiskMatrix = () => {
  return useQuery({
    queryKey: [...incidentKeys.settings, 'risk-matrix'],
    queryFn: () => incidentApi.getRiskMatrix(),
  });
};

export const useIncidentNotificationRules = () => {
  return useQuery({
    queryKey: [...incidentKeys.settings, 'notification-rules'],
    queryFn: () => incidentApi.getNotificationRules(),
  });
};

// ── Mutations ──────────────────────────────────────────────────────────────

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentCategory>) => incidentApi.createCategory(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'categories'] }),
  });
};

export const useUpdateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IncidentCategory> }) => incidentApi.updateCategory(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'categories'] }),
  });
};

export const useCreateType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentType>) => incidentApi.createType(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'types'] }),
  });
};

export const useUpdateType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IncidentType> }) => incidentApi.updateType(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'types'] }),
  });
};

export const useCreateSeverity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentSeverityLevel>) => incidentApi.createSeverity(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'severity'] }),
  });
};

export const useUpdateSeverity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IncidentSeverityLevel> }) => incidentApi.updateSeverity(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'severity'] }),
  });
};

export const useUpdateRiskMatrixCell = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { likelihood: number; impact: number; riskLevel: string; color?: string }) => incidentApi.updateRiskMatrixCell(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'risk-matrix'] }),
  });
};

export const useCreateNotificationRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentNotificationRule>) => incidentApi.createNotificationRule(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'notification-rules'] }),
  });
};

export const useUpdateNotificationRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IncidentNotificationRule> }) => incidentApi.updateNotificationRule(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'notification-rules'] }),
  });
};

// ── Notification Roles (incident-scoped, distinct from platform RBAC) ──────

export const useIncidentNotificationRoles = () => {
  return useQuery({
    queryKey: [...incidentKeys.settings, 'notification-roles'],
    queryFn: () => incidentApi.getNotificationRoles(),
  });
};

export const useCreateNotificationRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<IncidentNotificationRole>) => incidentApi.createNotificationRole(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'notification-roles'] }),
  });
};

export const useUpdateNotificationRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<IncidentNotificationRole> }) => incidentApi.updateNotificationRole(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'notification-roles'] }),
  });
};

export const useNotificationRoleMembers = (roleId?: string) => {
  return useQuery({
    queryKey: [...incidentKeys.settings, 'notification-roles', roleId, 'members'],
    queryFn: () => incidentApi.getNotificationRoleMembers(roleId as string),
    enabled: !!roleId,
  });
};

export const useAddNotificationRoleMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, userId }: { roleId: string; userId: string }) => incidentApi.addNotificationRoleMember(roleId, userId),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'notification-roles', vars.roleId, 'members'] });
      // Also refresh the roles list itself so its memberCount badge updates live.
      qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'notification-roles'] });
    },
  });
};

export const useRemoveNotificationRoleMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, userId }: { roleId: string; userId: string }) => incidentApi.removeNotificationRoleMember(roleId, userId),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'notification-roles', vars.roleId, 'members'] });
      qc.invalidateQueries({ queryKey: [...incidentKeys.settings, 'notification-roles'] });
    },
  });
};
