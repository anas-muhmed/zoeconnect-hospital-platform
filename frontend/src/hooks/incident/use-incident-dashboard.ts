import { useQuery } from '@tanstack/react-query';
import { incidentApi } from '../../lib/api/incident.api';
import { incidentKeys } from './use-incident';

export interface DashboardDateFilter {
  from?: string;
  to?: string;
}

export const useIncidentDashboardExecutive = (filters?: DashboardDateFilter) => {
  return useQuery({
    queryKey: [...incidentKeys.dashboard, 'executive', filters],
    queryFn: () => incidentApi.getDashboardExecutive(filters),
  });
};

export const useIncidentDashboardHeatmap = (filters?: DashboardDateFilter) => {
  return useQuery({
    queryKey: [...incidentKeys.dashboard, 'heatmap', filters],
    queryFn: () => incidentApi.getDashboardHeatmap(filters),
  });
};

export const useIncidentDashboardSla = () => {
  return useQuery({
    queryKey: [...incidentKeys.dashboard, 'sla'],
    queryFn: () => incidentApi.getDashboardSla(),
  });
};

export const useIncidentDashboardCapa = () => {
  return useQuery({
    queryKey: [...incidentKeys.dashboard, 'capa'],
    queryFn: () => incidentApi.getDashboardCapa(),
  });
};

export const useIncidentDashboardNearMiss = (filters?: DashboardDateFilter) => {
  return useQuery({
    queryKey: [...incidentKeys.dashboard, 'near-miss', filters],
    queryFn: () => incidentApi.getDashboardNearMiss(filters),
  });
};

export const useIncidentDashboardLessons = (limit = 5) => {
  return useQuery({
    queryKey: [...incidentKeys.dashboard, 'lessons', limit],
    queryFn: () => incidentApi.getDashboardLessons(limit),
  });
};

export const useIncidentDashboardWorkload = () => {
  return useQuery({
    queryKey: [...incidentKeys.dashboard, 'workload'],
    queryFn: () => incidentApi.getDashboardWorkload(),
  });
};

export const useIncidentAnalyticsTrends = (filters?: { granularity?: string; from?: string; to?: string }) => {
  return useQuery({
    queryKey: [...incidentKeys.analytics, 'trends', filters],
    queryFn: () => incidentApi.getAnalyticsTrends(filters),
  });
};

export const useIncidentAnalyticsCategories = (filters?: DashboardDateFilter) => {
  return useQuery({
    queryKey: [...incidentKeys.analytics, 'categories', filters],
    queryFn: () => incidentApi.getAnalyticsCategories(filters),
  });
};

export const useIncidentAnalyticsRepeatIncidents = (filters?: DashboardDateFilter) => {
  return useQuery({
    queryKey: [...incidentKeys.analytics, 'repeat-incidents', filters],
    queryFn: () => incidentApi.getAnalyticsRepeatIncidents(filters),
  });
};

export const useIncidentAnalyticsInvestigationTime = (filters?: DashboardDateFilter) => {
  return useQuery({
    queryKey: [...incidentKeys.analytics, 'investigation-time', filters],
    queryFn: () => incidentApi.getAnalyticsInvestigationTime(filters),
  });
};

export const useIncidentAnalyticsSentinelEvents = (filters?: DashboardDateFilter) => {
  return useQuery({
    queryKey: [...incidentKeys.analytics, 'sentinel-events', filters],
    queryFn: () => incidentApi.getAnalyticsSentinelEvents(filters),
  });
};
