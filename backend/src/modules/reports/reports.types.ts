export interface DashboardKpis {
  totalAccounts:         number;
  activeAccounts:        number;
  newEnrollmentsMonth:   number;
  totalPointsOutstanding: number;
  /** Estimated INR liability (points × pointValue in INR) */
  estimatedLiabilityInr: number;
  transactionsToday:     number;
  pointsEarnedToday:     number;
  pointsRedeemedToday:   number;
  notificationsSentToday: number;
}

export interface TierDistributionRow {
  tierId:       string;
  tierName:     string;
  tierColor:    string;
  count:        number;
  percentage:   number;
  totalPoints:  number;
}

export interface DailyVolumeRow {
  date:          string;   // 'YYYY-MM-DD'
  earnCount:     number;
  redeemCount:   number;
  pointsEarned:  number;
  pointsRedeemed: number;
  totalAmount:   number;
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
  campaignId:       string;
  campaignName:     string;
  campaignType:     string;
  isActive:         boolean;
  startDate:        string | null;
  endDate:          string | null;
  bonusTransactions: number;
  totalBonusPoints:  number;
  uniqueAccounts:    number;
}

export interface NotificationStatsRow {
  channel:   string;
  status:    string;
  count:     number;
}

export interface ReportDateRange {
  from: string;  // ISO date
  to:   string;
}
