import { apiClient } from './client';

const base = '/attendance/monitoring';

export const attendanceMonitoringApi = {
  summary: () => apiClient.get(`${base}/summary`).then((r) => r.data),
  health: () => apiClient.get(`${base}/health`).then((r) => r.data),
  statistics: (date?: string) =>
    apiClient.get(`${base}/statistics`, { params: { date } }).then((r) => r.data),
  liveFeed: (limit = 50) =>
    apiClient.get(`${base}/live-feed`, { params: { limit } }).then((r) => r.data),
  employeeTrace: (employeeCode: string, date?: string) =>
    apiClient.get(`${base}/employee/${encodeURIComponent(employeeCode)}`, { params: { date } }).then((r) => r.data),
  audit: (params?: Record<string, unknown>) =>
    apiClient.get(`${base}/audit`, { params }).then((r) => r.data),
  errors: (params?: Record<string, unknown>) =>
    apiClient.get(`${base}/errors`, { params }).then((r) => r.data),
  queue: () => apiClient.get(`${base}/queue`).then((r) => r.data),
  oracle: () => apiClient.get(`${base}/oracle`).then((r) => r.data),
  reconciliation: () => apiClient.get(`${base}/reconciliation`).then((r) => r.data),
  performance: () => apiClient.get(`${base}/performance`).then((r) => r.data),
  debugMode: () => apiClient.get(`${base}/debug-mode`).then((r) => r.data),
};
