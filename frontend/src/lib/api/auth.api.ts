import { apiClient } from './client';
import type { AuthUser } from '@/providers/AuthProvider';
import { AuthenticationProvider } from '@/lib/auth/AuthenticationProvider';

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export const authApi = {
  /**
   * ZoeConnect Identity Architecture Migration, Phase 7 (final frontend
   * authentication phase). `identifier` may be either a username or an
   * email address -- resolved globally, case-insensitively, on the backend
   * (see LoginDto/AuthService.resolveLoginUserGlobal(), Phases 3-4).
   *
   * `username` is still sent alongside `identifier`, set to the same
   * value, purely for backward compatibility during the transition
   * period: any deployment still running an older backend build that
   * predates the `identifier` field (or running with
   * `AUTH_IDENTITY_MODE=legacy`) reads `username` exactly as it always
   * has and behaves identically. Safe to remove once every deployment is
   * confirmed to be on a backend build that understands `identifier`.
   */
  login: async (identifier: string, password: string): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', { identifier, username: identifier, password });
    return data;
  },

  logout: async (reason?: string): Promise<void> => {
    await apiClient.post('/auth/logout', { reason });
  },

  recordActivity: async (): Promise<void> => {
    await apiClient.post('/auth/activity');
  },

  refresh: async (refreshToken: string): Promise<{ accessToken: string; user: AuthUser }> => {
    const { data } = await apiClient.post('/auth/refresh', { refreshToken });
    return data;
  },

  getProfile: async (): Promise<AuthUser> => {
    const { data } = await apiClient.get<AuthUser>('/auth/profile');
    return data;
  },

  getSession: async (): Promise<{ user: AuthUser; tenant: { id: string }; session: { idleTimeoutMinutes: number; deploymentMode: string; websiteLoginUrl?: string; appLoginUrl?: string; authenticationProvider: AuthenticationProvider } }> => {
    const { data } = await apiClient.get<{ user: AuthUser; tenant: { id: string }; session: { idleTimeoutMinutes: number; deploymentMode: string; websiteLoginUrl?: string; appLoginUrl?: string; authenticationProvider: AuthenticationProvider } }>('/auth/session');
    return data;
  },

  /** Switch to a different branch. Returns a new access token embedding the chosen branch. */
  selectBranch: async (branchId: string): Promise<{ accessToken: string; activeBranchId: string }> => {
    const { data } = await apiClient.post('/auth/select-branch', { branchId });
    return data;
  },

  changePassword: async (dto: { currentPassword: string; newPassword: string }): Promise<void> => {
    await apiClient.post('/auth/change-password', dto);
  },

  setupRequired: async (): Promise<{ required: boolean }> => {
    const { data } = await apiClient.get<{ required: boolean }>('/auth/setup-required');
    return data;
  },

  setupSuperAdmin: async (dto: {
    username: string;
    email: string;
    fullName?: string;
    password: string;
  }): Promise<{ id: string; username: string; email: string; role: string }> => {
    const { data } = await apiClient.post('/auth/setup-superadmin', dto);
    return data;
  },

  /**
   * ZoeConnect Identity Architecture Migration, Phase 7 follow-up: accepts
   * the same `identifier` (username or email) the login flow does, for a
   * consistent experience across Login and Forgot Password. `username` is
   * still sent alongside `identifier`, set to the same value, for backward
   * compatibility with an older backend build that predates the
   * `identifier` field on this endpoint -- same convention as
   * authApi.login() above.
   */
  forgotPassword: async (dto: { identifier: string; reason?: string }): Promise<{ code?: string; message?: string } | void> => {
    const { data } = await apiClient.post('/auth/forgot-password', { ...dto, username: dto.identifier });
    return data;
  },

  emergencyVendorRegister: async (dto: { vendorApiUrl: string; publicIp: string; publicPort: number }): Promise<void> => {
    await apiClient.post('/setup/vendor-registration', dto);
  },

  getVendorRegistrationStatus: async (): Promise<{ registered: boolean; hospitalName?: string; vendorName?: string; registeredAt?: string }> => {
    const { data } = await apiClient.get('/setup/vendor-registration/status');
    return data;
  },

  listPasswordResetRequests: async (): Promise<PasswordResetRequestItem[]> => {
    const { data } = await apiClient.get<PasswordResetRequestItem[]>('/auth/password-reset-requests');
    return data;
  },

  reviewPasswordResetRequest: async (
    id: string,
    dto: { action: 'APPROVE' | 'REJECT'; note: string },
  ): Promise<{ requestId: string; status: string; temporaryPassword?: string }> => {
    const { data } = await apiClient.post(`/auth/password-reset-requests/${id}/review`, dto);
    return data;
  },
};

export interface PasswordResetRequestItem {
  id: string;
  requestType: 'EMPLOYEE_TO_SUPERADMIN' | 'SUPERADMIN_TO_VENDOR';
  userId: string;
  username: string;
  requestedByIp: string;
  reason: string | null;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'COMPLETED';
  attemptCount: number;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvalNote: string | null;
  rejectionReason: string | null;
  expiresAt: string;
  completedAt: string | null;
  requestedAt: string;
}
