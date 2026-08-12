import { apiClient } from './client';
import {
  Incident, IncidentCategory, IncidentType, IncidentSeverityLevel,
  IncidentRiskMatrixConfig, IncidentInvestigation, IncidentRca,
  IncidentCapa, IncidentVerification, IncidentClosure, IncidentTimelineEvent,
  IncidentAttachment, IncidentStatement, RcaFiveWhy, RcaFishboneNode,
  IncidentTriage, IncidentComment, IncidentNotificationRule,
  IncidentNotificationRole, IncidentNotificationRoleMember,
} from '../../types/incident.types';

export const incidentApi = {
  // Incidents
  getAll: (params?: Record<string, any>) => apiClient.get<{ data: Incident[], total: number, page: number, limit: number }>('/incident', { params }).then((res) => res.data),
  getById: (id: string) => apiClient.get<Incident>(`/incident/${id}`).then((res) => res.data),
  create: (data: Partial<Incident>) => apiClient.post<Incident>('/incident', data).then((res) => res.data),
  update: (id: string, data: Partial<Incident>) => apiClient.patch<Incident>(`/incident/${id}`, data).then((res) => res.data),
  
  // Workflow Transitions
  submit: (id: string) => apiClient.post<Incident>(`/incident/${id}/submit`).then((res) => res.data),
  acknowledge: (id: string) => apiClient.post<Incident>(`/incident/${id}/acknowledge`).then((res) => res.data),
  assign: (id: string, investigatorId: string, teamMemberIds?: string[]) => apiClient.post<Incident>(`/incident/${id}/assign`, { investigatorId, teamMemberIds }).then((res) => res.data),
  reopen: (id: string) => apiClient.post<Incident>(`/incident/${id}/reopen`).then((res) => res.data),

  // Triage
  getTriage: (incidentId: string) => apiClient.get<IncidentTriage | null>(`/incident/${incidentId}/triage`).then((res) => res.data),
  createTriage: (incidentId: string, data: Partial<IncidentTriage>) => apiClient.post<IncidentTriage>(`/incident/${incidentId}/triage`, data).then((res) => res.data),
  updateTriage: (incidentId: string, data: Partial<IncidentTriage>) => apiClient.patch<IncidentTriage>(`/incident/${incidentId}/triage`, data).then((res) => res.data),
  beginContainment: (incidentId: string) => apiClient.post<IncidentTriage>(`/incident/${incidentId}/triage/begin-containment`).then((res) => res.data),

  // Comments
  getComments: (incidentId: string) => apiClient.get<IncidentComment[]>(`/incident/${incidentId}/comments`).then((res) => res.data),
  addComment: (incidentId: string, data: { content: string; visibility?: 'PUBLIC' | 'INTERNAL' }) => apiClient.post<IncidentComment>(`/incident/${incidentId}/comments`, data).then((res) => res.data),

  // Investigation
  getInvestigations: (incidentId: string) => apiClient.get<IncidentInvestigation[]>(`/incident/${incidentId}/investigation`).then((res) => res.data),
  createInvestigation: (incidentId: string, data: Partial<IncidentInvestigation>) => apiClient.post<IncidentInvestigation>(`/incident/${incidentId}/investigation`, data).then((res) => res.data),
  updateInvestigation: (incidentId: string, invId: string, data: Partial<IncidentInvestigation>) => apiClient.patch<IncidentInvestigation>(`/incident/${incidentId}/investigation/${invId}`, data).then((res) => res.data),
  addStatement: (incidentId: string, invId: string, data: Partial<IncidentStatement>) => apiClient.post<IncidentStatement>(`/incident/${incidentId}/investigation/${invId}/statement`, data).then((res) => res.data),
  getStatements: (incidentId: string, invId: string) => apiClient.get<IncidentStatement[]>(`/incident/${incidentId}/investigation/${invId}/statements`).then((res) => res.data),

  // RCA
  getRcas: (incidentId: string) => apiClient.get<IncidentRca[]>(`/incident/${incidentId}/rca`).then((res) => res.data),
  createRca: (incidentId: string, data: Partial<IncidentRca>) => apiClient.post<IncidentRca>(`/incident/${incidentId}/rca`, data).then((res) => res.data),
  updateRca: (incidentId: string, rcaId: string, data: Partial<IncidentRca>) => apiClient.patch<IncidentRca>(`/incident/${incidentId}/rca/${rcaId}`, data).then((res) => res.data),
  addFiveWhy: (incidentId: string, rcaId: string, data: Partial<RcaFiveWhy>) => apiClient.post<RcaFiveWhy>(`/incident/${incidentId}/rca/${rcaId}/five-why`, data).then((res) => res.data),
  getFiveWhys: (incidentId: string, rcaId: string) => apiClient.get<RcaFiveWhy[]>(`/incident/${incidentId}/rca/${rcaId}/five-why`).then((res) => res.data),
  upsertFishbone: (incidentId: string, rcaId: string, data: Partial<RcaFishboneNode>) => apiClient.post<RcaFishboneNode>(`/incident/${incidentId}/rca/${rcaId}/fishbone`, data).then((res) => res.data),
  getFishbone: (incidentId: string, rcaId: string) => apiClient.get<RcaFishboneNode[]>(`/incident/${incidentId}/rca/${rcaId}/fishbone`).then((res) => res.data),

  // CAPA
  getCapas: (incidentId: string) => apiClient.get<IncidentCapa[]>(`/incident/${incidentId}/capa`).then((res) => res.data),
  createCapa: (incidentId: string, data: Partial<IncidentCapa>) => apiClient.post<IncidentCapa>(`/incident/${incidentId}/capa`, data).then((res) => res.data),
  updateCapa: (incidentId: string, capaId: string, data: Partial<IncidentCapa>) => apiClient.patch<IncidentCapa>(`/incident/${incidentId}/capa/${capaId}`, data).then((res) => res.data),
  
  // Verification
  getVerifications: (incidentId: string) => apiClient.get<IncidentVerification[]>(`/incident/${incidentId}/verification`).then((res) => res.data),
  verifyCapa: (incidentId: string, capaId: string, data: Partial<IncidentVerification>) => apiClient.post<IncidentVerification>(`/incident/${incidentId}/capa/${capaId}/verify`, data).then((res) => res.data),

  // Closure
  close: (incidentId: string, data: Partial<IncidentClosure>) => apiClient.post<IncidentClosure>(`/incident/${incidentId}/close`, data).then((res) => res.data),

  // Timeline & Attachments
  getTimeline: (incidentId: string) => apiClient.get<IncidentTimelineEvent[]>(`/incident/${incidentId}/timeline`).then((res) => res.data),
  getAttachments: (incidentId: string) => apiClient.get<IncidentAttachment[]>(`/incident/attachments/incident/${incidentId}`).then((res) => res.data),
  uploadAttachment: (incidentId: string, parentType: string, parentId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post<IncidentAttachment>(`/incident/attachments/${incidentId}/${parentType}/${parentId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((res) => res.data);
  },
  deleteAttachment: (incidentId: string, attachmentId: string) => apiClient.delete(`/incident/attachments/${attachmentId}`).then((res) => res.data),
  getPresignedUrl: (incidentId: string, attachmentId: string) => apiClient.get(`/incident/attachments/${attachmentId}/presigned`).then((res) => res.data),
  // Buffered download — works regardless of storage provider (local filesystem
  // or S3). Presigned URLs only work when STORAGE_DRIVER=s3 is configured;
  // the default local-filesystem provider does not support them at all.
  downloadAttachmentBlob: (attachmentId: string) => apiClient.get(`/incident/attachments/${attachmentId}/download`, { responseType: 'blob' }),

  // Dashboard & Analytics
  getDashboardExecutive: (params?: any) => apiClient.get('/incident/dashboard/executive', { params }).then((res) => res.data),
  getDashboardHeatmap: (params?: any) => apiClient.get('/incident/dashboard/department-heatmap', { params }).then((res) => res.data),
  getDashboardWorkload: () => apiClient.get('/incident/dashboard/investigator-workload').then((res) => res.data),
  getDashboardSla: () => apiClient.get('/incident/dashboard/sla-compliance').then((res) => res.data),
  getDashboardCapa: () => apiClient.get('/incident/dashboard/capa-effectiveness').then((res) => res.data),
  getDashboardNearMiss: (params?: any) => apiClient.get('/incident/dashboard/near-miss-ratio', { params }).then((res) => res.data),
  getDashboardLessons: (limit?: number) => apiClient.get('/incident/dashboard/lessons-learned', { params: { limit } }).then((res) => res.data),
  
  getAnalyticsTrends: (params?: any) => apiClient.get('/incident/analytics/trends', { params }).then((res) => res.data),
  getAnalyticsCategories: (params?: any) => apiClient.get('/incident/analytics/categories', { params }).then((res) => res.data),
  getAnalyticsRepeatIncidents: (params?: any) => apiClient.get('/incident/analytics/repeat-incidents', { params }).then((res) => res.data),
  getAnalyticsInvestigationTime: (params?: any) => apiClient.get('/incident/analytics/investigation-time', { params }).then((res) => res.data),
  getAnalyticsSentinelEvents: (params?: any) => apiClient.get('/incident/analytics/sentinel-events', { params }).then((res) => res.data),

  // Settings
  getSettings: () => apiClient.get('/incident/settings').then((res) => res.data),
  getCategories: () => apiClient.get<IncidentCategory[]>('/incident/settings/categories').then((res) => res.data),
  createCategory: (data: Partial<IncidentCategory>) => apiClient.post<IncidentCategory>('/incident/settings/categories', data).then((res) => res.data),
  updateCategory: (id: string, data: Partial<IncidentCategory>) => apiClient.patch<IncidentCategory>(`/incident/settings/categories/${id}`, data).then((res) => res.data),

  getTypes: (categoryId?: string) => apiClient.get<IncidentType[]>('/incident/settings/types', { params: { categoryId } }).then((res) => res.data),
  createType: (data: Partial<IncidentType>) => apiClient.post<IncidentType>('/incident/settings/types', data).then((res) => res.data),
  updateType: (id: string, data: Partial<IncidentType>) => apiClient.patch<IncidentType>(`/incident/settings/types/${id}`, data).then((res) => res.data),

  getSeverityLevels: () => apiClient.get<IncidentSeverityLevel[]>('/incident/settings/severity').then((res) => res.data),
  createSeverity: (data: Partial<IncidentSeverityLevel>) => apiClient.post<IncidentSeverityLevel>('/incident/settings/severity', data).then((res) => res.data),
  updateSeverity: (id: string, data: Partial<IncidentSeverityLevel>) => apiClient.patch<IncidentSeverityLevel>(`/incident/settings/severity/${id}`, data).then((res) => res.data),

  getRiskMatrix: () => apiClient.get<IncidentRiskMatrixConfig[]>('/incident/settings/risk-matrix').then((res) => res.data),
  updateRiskMatrixCell: (data: { likelihood: number; impact: number; riskLevel: string; color?: string }) =>
    apiClient.post<IncidentRiskMatrixConfig>('/incident/settings/risk-matrix', data).then((res) => res.data),

  getNotificationRules: () => apiClient.get<IncidentNotificationRule[]>('/incident/settings/notification-rules').then((res) => res.data),
  createNotificationRule: (data: Partial<IncidentNotificationRule>) => apiClient.post<IncidentNotificationRule>('/incident/settings/notification-rules', data).then((res) => res.data),
  updateNotificationRule: (id: string, data: Partial<IncidentNotificationRule>) => apiClient.patch<IncidentNotificationRule>(`/incident/settings/notification-rules/${id}`, data).then((res) => res.data),

  // Notification Roles (incident-scoped, distinct from platform RBAC roles)
  getNotificationRoles: () => apiClient.get<IncidentNotificationRole[]>('/incident/settings/notification-roles').then((res) => res.data),
  createNotificationRole: (data: Partial<IncidentNotificationRole>) => apiClient.post<IncidentNotificationRole>('/incident/settings/notification-roles', data).then((res) => res.data),
  updateNotificationRole: (id: string, data: Partial<IncidentNotificationRole>) => apiClient.patch<IncidentNotificationRole>(`/incident/settings/notification-roles/${id}`, data).then((res) => res.data),
  getNotificationRoleMembers: (roleId: string) => apiClient.get<IncidentNotificationRoleMember[]>(`/incident/settings/notification-roles/${roleId}/members`).then((res) => res.data),
  addNotificationRoleMember: (roleId: string, userId: string) => apiClient.post(`/incident/settings/notification-roles/${roleId}/members/${userId}`),
  removeNotificationRoleMember: (roleId: string, userId: string) => apiClient.delete(`/incident/settings/notification-roles/${roleId}/members/${userId}`),

  // HIS Employee Lookup
  searchEmployees: (query: string) => apiClient.get(`/incident/his/employee/search`, { params: { q: query } }).then((res) => res.data),
  resolveEmployee: (id: string) => apiClient.get(`/incident/his/employee/${id}`).then((res) => res.data),
};
