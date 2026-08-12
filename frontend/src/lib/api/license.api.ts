import { apiClient } from './client';

export interface LicenseStatus {
  isValid: boolean;
  isTrial: boolean;
  hospitalName: string;
  hospitalCode: string;
  licensedModules: string[];
  maxUsers: number;
  expiresAt: string | null;          // soonest expiry across all active records
  daysRemaining: number | null;
  isExpiringSoon: boolean;
  machineFingerprint: string | null;
  /** Per-module expiry — null = perpetual for that module */
  moduleExpiries: Record<string, string | null>;
  /** True when any module is expired but still within the 1-day grace period */
  isInGracePeriod: boolean;
  /** When the earliest grace period ends (ISO string); null if not in grace period */
  gracePeriodEndsAt: string | null;
  /** Modules accessible only via grace period (expired but within 1-day window) */
  gracePeriodModules: string[];
  deploymentMode: string;
  vendorRegistrationRequired: boolean;
  /**
   * Runtime source of truth for where the marketing site's shared login
   * page lives (backend's `app.publicLoginUrl` / `PUBLIC_LOGIN_URL`).
   * Consumed by AuthProvider.tsx's post-logout hand-off instead of a
   * frontend-side `NEXT_PUBLIC_*` build-time constant -- see that config
   * key's doc comment in backend/src/config/app.config.ts for why.
   */
  publicLoginUrl: string;
}

export interface VendorRegistration {
  registered: boolean;
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  hospitalName?: string;
  hospitalCode?: string;
  vendorApiUrl?: string;
  publicIp?: string;
  publicPort?: number;
  registeredAt?: string;
}

export interface LicenseRequest {
  id: string;
  vendorRequestId: string | null;
  requestedModules: string[];
  remarks: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'CANCELLED';
  rejectionReason: string | null;
  submittedAt: string;
  resolvedAt: string | null;
}

export interface LicenseHistoryRecord {
  id: string;
  licenseKey: string;
  hospitalName: string;
  hospitalCode: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'TRIAL';
  licensedModules: string[];
  maxUsers: number;
  expiresAt: string | null;
  activatedAt: string;
  updatedAt: string;
  activatedBy: string | null;
}

export const licenseApi = {
  getStatus: () =>
    apiClient.get<LicenseStatus>('/license/status').then((r) => r.data),

  getFingerprint: () =>
    apiClient.get<{ fingerprint: string }>('/license/fingerprint').then((r) => r.data),

  upload: (license: Record<string, unknown>) =>
    apiClient.post<LicenseStatus>('/license/upload', { license }).then((r) => r.data),

  // ── Vendor Sync ─────────────────────────────────────────────────────────────

  getRegistration: () =>
    apiClient.get<VendorRegistration>('/license/registration').then((r) => r.data),

  register: (data: { vendorApiUrl: string; publicIp: string; publicPort: number }) =>
    apiClient.post<VendorRegistration>('/license/register', data).then((r) => r.data),

  getRequests: () =>
    apiClient.get<LicenseRequest[]>('/license/requests').then((r) => r.data),

  submitRequest: (data: { requestedModules: string[]; remarks?: string }) =>
    apiClient.post<LicenseRequest>('/license/request', data).then((r) => r.data),

  cancelRequest: (id: string) =>
    apiClient.post<LicenseRequest>(`/license/requests/${id}/cancel`).then((r) => r.data),

  getHistory: () =>
    apiClient.get<LicenseHistoryRecord[]>('/license/history').then((r) => r.data),
};

export const ALL_MODULES = [
  { code: 'PLATFORM',   label: 'Platform Core',             description: 'Base platform — required for all modules', required: true },
  { code: 'LOYALTY',    label: 'Patient Loyalty',           description: 'Enrolment, points, tiers, campaigns' },
  { code: 'FORMS',      label: 'Digital Forms',             description: 'Patient intake & consent forms' },
  { code: 'QUEUE',      label: 'Queue Management',          description: 'OPD queue display & token system' },
  { code: 'FEEDBACK',   label: 'Patient Feedback',           description: 'Post-visit surveys & analytics' },
  { code: 'EIC',        label: 'Early Intervention Centre',  description: 'Therapy management for developmental disabilities' },
  { code: 'ATTENDANCE', label: 'Attendance Monitoring',      description: 'Punch processing, Oracle polling & reconciliation' },
  { code: 'CMS',        label: 'Content Management System',  description: 'Digital signage playlists & displays' },
  { code: 'INCIDENT',   label: 'Incident Management',        description: 'Incident reporting, severity/risk tracking & notification routing' },
] as const;
