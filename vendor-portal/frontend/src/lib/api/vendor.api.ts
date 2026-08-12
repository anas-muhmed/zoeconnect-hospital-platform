import { apiClient } from './client';

export interface Hospital {
  id: string;
  // Customers merge (Phase 2, 2026-07-20) -- 'cloud' rows are linked from
  // CloudTenantsService.provision(), not the self-hosted "Register to
  // Vendor" flow. See cloudTenantId and the now-nullable self-hosted-only
  // fields below.
  deploymentType: 'self_hosted' | 'cloud';
  cloudTenantId: string | null;
  hospitalName: string;
  hospitalCode: string;
  // Self-hosted-only -- always null for a 'cloud' row (no physical
  // instance to pair with/reach).
  publicIp: string | null;
  publicPort: number | null;
  webhookUrl: string | null;
  machineFingerprint: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  notes: string | null;
  lastWebhookAt: string | null;
  lastWebhookStatus: 'OK' | 'FAILED' | null;
  registeredAt: string;
  // Populated by GET /hospitals (findAll() now loads the 'licenses'
  // relation) so the Registered Tenants list can show trial/licensed
  // status, licensed modules, and trial expiry without a per-row fetch..
  licenses?: IssuedLicense[];
  // Populated by GET /hospitals for cloud rows only -- the live
  // subscription_licenses row read back from ZoeConnect Cloud's own Cloud
  // Licensing API. Authoritative for cloud tenants: covers trials issued
  // directly at provisioning time, which never create a Vendor Portal
  // `licenses` row (see `licenses` above). `null` means the query
  // succeeded but found nothing (or genuinely failed) -- treat the same as
  // "no live subscription data," fall back to `licenses`.
  cloudSubscription?: CloudSubscription | null;
}

export interface CloudSubscription {
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'suspended' | string;
  licensedModules: string[];
  planId: string | null;
  maxUsers: number;
  currentPeriodEnd: string | null;
}

export interface LicenseRequest {
  id: string;
  hospitalId: string;
  hospital: Hospital;
  requestedModules: string[];
  currentModules: string[];
  remarks: string | null;
  machineFingerprint: string;
  isTrial: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  vendorNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  submittedAt: string;
}

export interface IssuedLicense {
  id: string;
  hospitalId: string;
  hospital: Hospital;
  requestId: string | null;
  licenseType: 'TRIAL_EXTENSION' | 'MODULE_LICENSE' | 'PERPETUAL';
  licensedModules: string[];
  maxUsers: number;
  expiresAt: string | null;
  machineLocked: boolean;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  issuedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface RevocationEvent {
  id: string;
  hospitalId: string;
  hospital: Hospital;
  revocationType: 'FULL' | 'MODULE';
  modules: string[] | null;
  reason: string;
  forceLogout: boolean;
  webhookStatus: 'PENDING' | 'DELIVERED' | 'FAILED';
  createdAt: string;
}

export interface HospitalSetting {
  id: string;
  hospitalId: string;
  settingKey: string;
  settingValue: string;
  label: string;
  description: string | null;
  updatedAt: string;
}

export interface HisSchemaConfigEntry {
  id: string;
  hospitalId: string;
  configKey: string;
  configValue: string;
  defaultValue: string;
  label: string;
  description: string | null;
  configType: 'TABLE' | 'COLUMN' | 'STATUS_VALUE' | 'SQL_QUERY' | 'TEXT' | 'CREDENTIAL';
  category: string;
  updatedAt: string;
}

export interface HdspUser {
  id: string;
  hospitalId: string;
  username: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HisConfigTemplate {
  id: string;
  name: string;
  description: string | null;
  queries: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ApproveDto {
  licenseType: 'TRIAL_EXTENSION' | 'MODULE_LICENSE' | 'PERPETUAL';
  modules: string[];
  maxUsers: number;
  expiresAt: string | null;
  machineLocked: boolean;
  vendorNotes?: string;
}

export const vendorApi = {
  // Auth
  login: (username: string, password: string) =>
    apiClient.post<{ accessToken: string; user: { id: string; username: string; role: string } }>(
      '/auth/login', { username, password },
    ).then(r => r.data),

  forgotPassword: (username: string) =>
    apiClient.post<{ token: string }>('/auth/forgot-password', { username }).then(r => r.data),

  resetPassword: (token: string, newPassword: string) =>
    apiClient.post('/auth/reset-password', { token, newPassword }).then(r => r.data),

  // Hospitals
  getHospitals: () =>
    apiClient.get<Hospital[]>('/hospitals').then(r => r.data),

  getHospital: (id: string) =>
    apiClient.get<Hospital>(`/hospitals/${id}`).then(r => r.data),

  suspendHospital: (id: string) =>
    apiClient.patch(`/hospitals/${id}/suspend`).then(r => r.data),

  activateHospital: (id: string) =>
    apiClient.patch(`/hospitals/${id}/activate`).then(r => r.data),

  updateNotes: (id: string, notes: string) =>
    apiClient.patch(`/hospitals/${id}/notes`, { notes }).then(r => r.data),

  extendTrial: (id: string, newExpiresAt: string, reason: string) =>
    apiClient.patch(`/hospitals/${id}/extend-trial`, { newExpiresAt, reason }).then(r => r.data),

  revokeHospital: (id: string, data: { type: 'FULL' | 'MODULE'; modules?: string[]; reason: string; forceLogout?: boolean }) =>
    apiClient.post(`/hospitals/${id}/revoke`, data).then(r => r.data),

  getHospitalLicenses: (id: string) =>
    apiClient.get<IssuedLicense[]>(`/hospitals/${id}/licenses`).then(r => r.data),

  // Requests
  getRequests: (status?: string) =>
    apiClient.get<LicenseRequest[]>('/requests', { params: status ? { status } : {} }).then(r => r.data),

  getRequest: (id: string) =>
    apiClient.get<LicenseRequest>(`/requests/${id}`).then(r => r.data),

  approveRequest: (id: string, dto: ApproveDto) =>
    apiClient.post<IssuedLicense>(`/requests/${id}/approve`, dto).then(r => r.data),

  rejectRequest: (id: string, reason: string) =>
    apiClient.post(`/requests/${id}/reject`, { reason }).then(r => r.data),

  // Licenses
  getActiveLicenses: () =>
    apiClient.get<IssuedLicense[]>('/licenses').then(r => r.data),

  getLicenseHistory: () =>
    apiClient.get<IssuedLicense[]>('/licenses/history').then(r => r.data),

  // Transaction log
  getRevocations: () =>
    apiClient.get<RevocationEvent[]>('/revocations').then(r => r.data),

  // HIS Schema Config
  getHisConfig: (hospitalId: string) =>
    apiClient.get<HisSchemaConfigEntry[]>(`/hospitals/${hospitalId}/his-config`).then(r => r.data),

  updateHisConfig: (hospitalId: string, updates: Array<{ configKey: string; configValue: string }>) =>
    apiClient.patch<HisSchemaConfigEntry[]>(`/hospitals/${hospitalId}/his-config`, { updates }).then(r => r.data),

  pushHisConfig: (hospitalId: string) =>
    apiClient.post<{ ok: boolean; message: string }>(`/hospitals/${hospitalId}/push-his-config`).then(r => r.data),

  testDbConnection: (hospitalId: string) =>
    apiClient.post<{ ok: boolean; message: string }>(`/hospitals/${hospitalId}/test-db-connection`).then(r => r.data),

  /** Pull live HIS SQL queries directly from the running ZoeConnect instance */
  syncHisConfig: (hospitalId: string) =>
    apiClient.get<Record<string, string>>(`/hospitals/${hospitalId}/sync-his-config`).then(r => r.data),

  // ZoeConnect User Credentials
  listHdspUsers: (hospitalId: string) =>
    apiClient.get<HdspUser[]>(`/hospitals/${hospitalId}/hdsp-users`).then(r => r.data),

  createHdspUser: (hospitalId: string, data: { username: string; password: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF'; fullName?: string }) =>
    apiClient.post<HdspUser>(`/hospitals/${hospitalId}/hdsp-users`, data).then(r => r.data),

  updateHdspUser: (userId: string, data: { role?: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF'; fullName?: string; isActive?: boolean; password?: string }) =>
    apiClient.patch<HdspUser>(`/hdsp-users/${userId}`, data).then(r => r.data),

  deleteHdspUser: (userId: string) =>
    apiClient.delete(`/hdsp-users/${userId}`),

  deleteHospital: async (id: string): Promise<void> => {
    await apiClient.delete(`/hospitals/${id}`);
  },

  // ── System Settings ─────────────────────────────────────────────────────────

  getSystemSettings: async (hospitalId: string): Promise<HospitalSetting[]> => {
    const { data } = await apiClient.get<HospitalSetting[]>(`/hospitals/${hospitalId}/system-settings`);
    return data;
  },

  updateSystemSettings: async (hospitalId: string, updates: Array<{ settingKey: string; settingValue: string; label: string; description?: string }>): Promise<{ ok: boolean; message: string }> => {
    const { data } = await apiClient.patch(`/hospitals/${hospitalId}/system-settings`, { updates });
    return data;
  },

  pushSystemSettings: async (hospitalId: string): Promise<{ ok: boolean; message: string }> => {
    const { data } = await apiClient.post(`/hospitals/${hospitalId}/push-system-settings`);
    return data;
  },

  // HIS Config Templates
  listTemplates: () =>
    apiClient.get<HisConfigTemplate[]>('/his-config-templates').then(r => r.data),

  getTemplate: (id: string) =>
    apiClient.get<HisConfigTemplate>(`/his-config-templates/${id}`).then(r => r.data),

  createTemplate: (hospitalId: string, name: string, description: string | null) =>
    apiClient.post<HisConfigTemplate>('/his-config-templates', { hospitalId, name, description }).then(r => r.data),

  deleteTemplate: (id: string) =>
    apiClient.delete(`/his-config-templates/${id}`),

  applyTemplate: (hospitalId: string, templateId: string) =>
    apiClient.post<HisSchemaConfigEntry[]>(`/hospitals/${hospitalId}/his-config/apply-template`, { templateId }).then(r => r.data),

  // â”€â”€ Global Admin / Remote Security â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Remote Admin
  getLockedUsers: (hospitalId: string) =>
    apiClient.get<any[]>(`/hospitals/${hospitalId}/admin/security/locked-users`).then(r => r.data),

  remoteCreateUser: (hospitalId: string, payload: any) =>
    apiClient.post<{ commandId: string; status: string; message?: string; result?: any }>(
      `/hospitals/${hospitalId}/admin/security/users/actions/create`, payload
    ).then(r => r.data),

  remoteUnlockUser: (hospitalId: string, userId: string, payload: any) =>
    apiClient.post<{ commandId: string; status: string }>(
      `/hospitals/${hospitalId}/admin/security/users/${userId}/actions/unlock`, payload
    ).then(r => r.data),

  remoteResetAttempts: (hospitalId: string, userId: string, payload: any) =>
    apiClient.post<{ commandId: string; status: string }>(
      `/hospitals/${hospitalId}/admin/security/users/${userId}/actions/reset-attempts`, payload
    ).then(r => r.data),

  remoteResetPassword: (hospitalId: string, userId: string, payload: { vendorRequestId: string; reason?: string }) =>
    apiClient.post<{ commandId: string; status: string; result?: any }>(
      `/hospitals/${hospitalId}/admin/security/users/${userId}/actions/reset-password`, payload
    ).then(r => r.data),

  remoteBulkUnlock: (hospitalId: string, userIds: string[], payload: any) =>
    apiClient.post(`/hospitals/${hospitalId}/admin/security/users/bulk-unlock`, { userIds, payload }).then(r => r.data),

  // Remote Admin - Password Reset Requests
  getPasswordResetRequests: (hospitalId: string) =>
    apiClient.get<any[]>(`/hospitals/${hospitalId}/admin/password-reset-requests`).then(r => r.data),

  approvePasswordResetRequest: (hospitalId: string, reqId: string, payload: { note: string }) =>
    apiClient.post(`/hospitals/${hospitalId}/admin/password-reset-requests/${reqId}/approve`, payload).then(r => r.data),

  rejectPasswordResetRequest: (hospitalId: string, reqId: string, payload: { reason: string }) =>
    apiClient.post(`/hospitals/${hospitalId}/admin/password-reset-requests/${reqId}/reject`, payload).then(r => r.data),

  // Children's Village -- standalone (internal student DB) vs HIS-connected
  // (Oracle-integrated). See adr/0001 and adr/0002 in
  // backend/src/modules/childrens-village/adr/.
  getChildrensVillageProvider: (hospitalId: string) =>
    apiClient.get<{ mode: 'internal' | 'oracle_his'; state?: string; source?: string }>(
      `/hospitals/${hospitalId}/admin/modules/childrens-village/provider`
    ).then(r => r.data),

  setChildrensVillageProvider: (hospitalId: string, mode: 'internal' | 'oracle_his') =>
    apiClient.post<{ mode: 'internal' | 'oracle_his'; state?: string }>(
      `/hospitals/${hospitalId}/admin/modules/childrens-village/provider`, { mode }
    ).then(r => r.data),
};

// Keep in sync with the canonical `ALL_MODULE_CODES` list in the hospital
// instance's `backend/src/modules/licensing/license.service.ts` -- this was
// the third independent copy of the module list in the repo (alongside that
// one and `frontend/src/lib/api/license.api.ts`'s `ALL_MODULES`) and had
// drifted, missing CMS/ATTENDANCE. A missing entry here doesn't just mislabel
// a module -- `activeModulesForRevoke` in hospitals/page.tsx is driven by
// whatever modules a hospital's issued licenses actually contain, so a real
// module missing from this map renders as a blank, unlabeled checkbox in the
// Revoke License dialog rather than being hidden outright.
export const MODULE_LABELS: Record<string, string> = {
  PLATFORM: 'Platform Core',
  LOYALTY: 'Patient Loyalty',
  FORMS: 'Digital Forms',
  QUEUE: 'Queue Management',
  FEEDBACK: 'Patient Feedback',
  EIC: 'Early Intervention Centre',
  ATTENDANCE: 'Attendance Monitoring',
  CMS: 'Content Management System',
};

export const ALL_MODULES = ['PLATFORM', 'LOYALTY', 'FORMS', 'QUEUE', 'FEEDBACK', 'EIC', 'ATTENDANCE', 'CMS'];

