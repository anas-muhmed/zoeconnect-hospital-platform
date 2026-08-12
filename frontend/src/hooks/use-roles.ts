import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rolesApi } from '../lib/api/users.api';

export const roleKeys = {
  all: ['roles'] as const,
  members: (roleId: string) => ['roles', roleId, 'members'] as const,
};

export const useRoles = (enabled: boolean = true) => {
  return useQuery({
    queryKey: roleKeys.all,
    queryFn: () => rolesApi.list(),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
};

export const useRoleMembers = (roleId?: string) => {
  return useQuery({
    queryKey: roleKeys.members(roleId || ''),
    queryFn: () => rolesApi.getMembers(roleId as string),
    enabled: !!roleId,
  });
};

export const useAddRoleMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, userId }: { roleId: string; userId: string }) => rolesApi.addMember(roleId, userId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: roleKeys.members(vars.roleId) });
      qc.invalidateQueries({ queryKey: roleKeys.all });
    },
  });
};

export const useRemoveRoleMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, userId }: { roleId: string; userId: string }) => rolesApi.removeMember(roleId, userId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: roleKeys.members(vars.roleId) });
      qc.invalidateQueries({ queryKey: roleKeys.all });
    },
  });
};
