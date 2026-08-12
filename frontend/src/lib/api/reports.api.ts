import { apiClient } from './client';

export interface DashboardKpis {
  totalAccounts:          number;
  activeAccounts:         number;
  newEnrollmentsMonth:    number;
  totalPointsOutstanding: number;
  estimatedLiabilityInr:  number;
  transactionsToday:      number;
  pointsEarnedToday:      number;
  pointsRedeemedToday:    number;
  notificationsSentToday: number;
}

export interface TierDistributionRow {
  tierId:      string;
  tierName:    string;
  tierColor:   string;
  count:       number;
  percentage:  number;
  totalPoints: number;
}

export interface DailyVolumeRow {
  date:           string;
  earnCount:      number;
  redeemCount:    number;
  pointsEarned:   number;
  pointsRedeemed: number;
  totalAmount:    number;
}

export interface TopEarnerRow {
  accountId:       string;
  cardNumber:      string;
  patientMrn:      string;
  tierName:        string;
  tierColor:       string;
  availablePoints: number;
  lifetimePoints:  number;
  totalSpend:      number;
  enrolledAt:      string;
}

export interface CampaignPerformanceRow {
  campaignId:        string;
  campaignName:      string;
  campaignType:      string;
  isActive:          boolean;
  startDate:         string | null;
  endDate:           string | null;
  bonusTransactions: number;
  totalBonusPoints:  number;
  uniqueAccounts:    number;
}

export interface NotificationStatsRow {
  channel: string;
  status:  string;
  count:   number;
}

export const reportsApi = {
  getDashboard:           () => apiClient.get<DashboardKpis>('/reports/dashboard').then(r => r.data),
  getTierDistribution:    () => apiClient.get<TierDistributionRow[]>('/reports/tier-distribution').then(r => r.data),
  getDailyVolume:         (days = 30) => apiClient.get<DailyVolumeRow[]>('/reports/daily-volume', { params: { days } }).then(r => r.data),
  getTopEarners:          (limit = 20) => apiClient.get<TopEarnerRow[]>('/reports/top-earners', { params: { limit } }).then(r => r.data),
  getCampaignPerformance: () => apiClient.get<CampaignPerformanceRow[]>('/reports/campaign-performance').then(r => r.data),
  getNotificationStats:   (days = 30) => apiClient.get<NotificationStatsRow[]>('/reports/notification-stats', { params: { days } }).then(r => r.data),

  // CSV export — trigger browser download
  exportTopEarners:          () => `${apiClient.defaults.baseURL}/reports/export/top-earners`,
  exportDailyVolume:         (days = 30) => `${apiClient.defaults.baseURL}/reports/export/daily-volume?days=${days}`,
  exportCampaignPerformance: () => `${apiClient.defaults.baseURL}/reports/export/campaign-performance`,
};
