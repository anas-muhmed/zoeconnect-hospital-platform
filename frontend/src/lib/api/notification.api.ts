import { apiClient } from './client';

export type NotificationChannel   = 'WHATSAPP' | 'SMS' | 'EMAIL';
export type NotificationStatus    = 'PENDING' | 'SENT' | 'FAILED' | 'DELIVERED';
export type NotificationEventType =
  | 'WELCOME' | 'EARN_POINTS' | 'REDEEM_POINTS'
  | 'BIRTHDAY_BONUS' | 'CAMPAIGN_BONUS' | 'TIER_UPGRADE'
  | 'ACCOUNT_EXPIRY_WARNING' | 'CUSTOM';

export interface NotificationLog {
  id: string;
  phone: string;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  templateName: string;
  languageCode: string;
  templateParams: string[];
  status: NotificationStatus;
  providerMessageId: string | null;
  errorMessage: string | null;
  attempts: number;
  loyaltyAccountId: string | null;
  mrn: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  templateName: string;
  languageCode: string;
  paramDescriptions: string[];
  bodyPreview: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedLogs {
  data: NotificationLog[];
  total: number;
  page: number;
  limit: number;
}

export interface LogFilters {
  page?: number;
  limit?: number;
  phone?: string;
  status?: NotificationStatus;
  eventType?: NotificationEventType;
  channel?: NotificationChannel;
  loyaltyAccountId?: string;
}

export const notificationApi = {
  // Logs
  getLogs: (filters: LogFilters = {}) =>
    apiClient.get<PaginatedLogs>('/notifications/logs', { params: filters }).then(r => r.data),

  getLog: (id: string) =>
    apiClient.get<NotificationLog>(`/notifications/logs/${id}`).then(r => r.data),

  resend: (id: string) =>
    apiClient.post<NotificationLog>(`/notifications/logs/${id}/resend`).then(r => r.data),

  // Templates
  getTemplates: (activeOnly?: boolean) =>
    apiClient.get<NotificationTemplate[]>('/notifications/templates', { params: { activeOnly } }).then(r => r.data),

  getTemplate: (id: string) =>
    apiClient.get<NotificationTemplate>(`/notifications/templates/${id}`).then(r => r.data),

  createTemplate: (payload: Partial<NotificationTemplate>) =>
    apiClient.post<NotificationTemplate>('/notifications/templates', payload).then(r => r.data),

  updateTemplate: (id: string, payload: Partial<NotificationTemplate>) =>
    apiClient.patch<NotificationTemplate>(`/notifications/templates/${id}`, payload).then(r => r.data),
};
