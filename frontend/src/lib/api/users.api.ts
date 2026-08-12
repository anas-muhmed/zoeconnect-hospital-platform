import { apiClient } from './client';
import type { AvailabilityResponse } from '@/lib/validation/availability.types';

export interface RoleSummary {
  id: string;
  name: string;
}

export interface Permission {
  id: string;
  moduleCode: string;
  resource: string;
  action: string;
  description: string | null;
}

export interface RoleWithPermissions extends RoleSummary {
  description: string;
  isSystem: boolean;
  moduleCode: string | null;
  permissions: Permission[];
  userCount: number;
}

export interface CreateRolePayload {
  name: string;
  description?: string;
  permissionIds?: string[];
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
  permissionIds?: string[];
}

export interface UserListItem {
  id: string;
  username: string;
  email: string;
  fullName: string | null;
  hisEmployeeCode?: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: RoleSummary[];
}

export interface UserDetail extends UserListItem {
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  directPermissions: Permission[];
}

export interface PaginatedUsers {
  items: UserListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  fullName?: string;
  roleIds: string[];
  hisEmployeeCode?:string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export interface UpdateUserPayload {
  email?: string;
  fullName?: string;
  roleIds?: string[];
  hisEmployeeCode?:string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export const usersApi = {
  list: (page = 1, limit = 20, search?: string) =>
    apiClient
      .get<PaginatedUsers>('/users', { params: { page, limit, search } })
      .then((r) => r.data),

  get: (id: string) =>
    apiClient.get<UserDetail>(`/users/${id}`).then((r) => r.data),

  create: (payload: CreateUserPayload) =>
    apiClient.post<UserDetail>('/users', payload).then((r) => r.data),

  update: (id: string, payload: UpdateUserPayload) =>
    apiClient.patch<UserDetail>(`/users/${id}`, payload).then((r) => r.data),

  activate: (id: string) =>
    apiClient.patch(`/users/${id}/activate`),

  deactivate: (id: string) =>
    apiClient.patch(`/users/${id}/deactivate`),

  resetPassword: (id: string, newPassword?: string) =>
    apiClient
      .post<{ temporaryPassword: string }>(`/users/${id}/reset-password`, { newPassword })
      .then((r) => r.data),

  unlock: (id: string) =>
    apiClient.post(`/users/${id}/unlock`),

  // Backed by the shared AvailabilityCheckService (see backend
  // `common/validation/`) — live username/email uniqueness check for the
  // create/edit user form. `excludeUserId` lets an in-progress edit keep a
  // user's own current username/email without flagging it as taken.
  checkAvailability: (
    params: { username?: string; email?: string; excludeUserId?: string },
    signal?: AbortSignal,
  ) =>
    apiClient
      .get<AvailabilityResponse>('/users/check-availability', { params, signal })
      .then((r) => r.data),

  getPermissions: (id: string) =>
    apiClient.get<UserDetail>(`/users/${id}`).then((r) => r.data.directPermissions ?? []),

  assignPermissions: (id: string, permissionIds: string[]) =>
    apiClient
      .patch<UserDetail>(`/users/${id}/permissions`, { permissionIds })
      .then((r) => r.data),
};

export interface RoleMember {
  id: string;
  username: string;
  email: string;
  fullName: string | null;
}

export const rolesApi = {
  list: () =>
    apiClient.get<RoleWithPermissions[]>('/rbac/roles').then((r) => r.data),

  get: (id: string) =>
    apiClient.get<RoleWithPermissions>(`/rbac/roles/${id}`).then((r) => r.data),

  create: (payload: CreateRolePayload) =>
    apiClient.post<RoleWithPermissions>('/rbac/roles', payload).then((r) => r.data),

  update: (id: string, payload: UpdateRolePayload) =>
    apiClient.patch<RoleWithPermissions>(`/rbac/roles/${id}`, payload).then((r) => r.data),

  listPermissions: () =>
    apiClient.get<Permission[]>('/rbac/permissions').then((r) => r.data),

  getMembers: (roleId: string) =>
    apiClient.get<RoleMember[]>(`/rbac/roles/${roleId}/users`).then((r) => r.data),

  addMember: (roleId: string, userId: string) =>
    apiClient.post(`/rbac/roles/${roleId}/users/${userId}`),

  removeMember: (roleId: string, userId: string) =>
    apiClient.delete(`/rbac/roles/${roleId}/users/${userId}`),
};
