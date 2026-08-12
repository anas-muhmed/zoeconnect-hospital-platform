import { apiClient } from './client';

export interface DiscountThreshold {
  min_value: number;
  discount_pct: number;
}

export interface CardCategory {
  id: string;
  code: string;
  name: string;
  minSpend: number;
  maxSpend: number | null;
  earnRatePer100: number;
  pointValuePer100: number;
  discountThresholds: DiscountThreshold[];
  baseDiscountPct: number | null;
  colourHex: string;
  isActive: boolean;
  displayOrder: number;
  updatedAt: string;
}

export interface LoyaltyAccount {
  id: string;
  patientMrn: string;
  patientName: string | null;
  patientMobile: string | null;
  cardNumber: string;
  cardCategoryId: string;
  category: CardCategory;
  totalLifetimeSpend: number;
  availablePoints: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  enrolledAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  accountId: string;
  transactionType: 'EARN' | 'REDEEM' | 'ADJUST' | 'VOID' | 'EXPIRE';
  referenceType: string | null;
  referenceId: string | null;
  points: number;
  amount: number | null;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export interface RewardCatalog {
  id: string;
  name: string;
  description: string | null;
  pointsRequired: number;
  rewardType: 'DISCOUNT' | 'GIFT' | 'UPGRADE' | 'CASHBACK';
  value: number | null;
  isActive: boolean;
  stockQty: number | null;
}

export interface RewardRedemption {
  id: string;
  accountId: string;
  rewardId: string;
  reward: RewardCatalog;
  pointsUsed: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
  notes: string | null;
  createdAt: string;
}

export interface DiscountResult {
  accountId: string;
  cardNumber: string;
  tier: string;
  availablePoints: number;
  discountPct: number;
  thresholdLabel: string;
}

export interface EarnResult {
  accountId: string;
  cardNumber: string;
  pointsEarned: number;
  balanceBefore: number;
  balanceAfter: number;
  tierChanged: boolean;
  newTier: string;
  activeCampaigns: string[];
}

export const loyaltyApi = {
  listAccounts: (params: { page?: number; limit?: number; search?: string; status?: string; tier?: string }) =>
    apiClient
      .get<{ items: LoyaltyAccount[]; total: number; page: number; limit: number; totalPages: number }>(
        '/loyalty/accounts',
        { params },
      )
      .then((r) => r.data),

  enroll: (patientMrn: string, categoryId?: string) =>
    apiClient.post<LoyaltyAccount>('/loyalty/enroll', { patientMrn, categoryId }).then((r) => r.data),

  getByMrn: (mrn: string) =>
    apiClient.get<LoyaltyAccount>(`/loyalty/accounts/mrn/${mrn}`).then((r) => r.data),

  getByCard: (cardNumber: string) =>
    apiClient.get<LoyaltyAccount>(`/loyalty/accounts/card/${cardNumber}`).then((r) => r.data),

  getById: (id: string) =>
    apiClient.get<LoyaltyAccount>(`/loyalty/accounts/${id}`).then((r) => r.data),

  getDiscount: (id: string) =>
    apiClient.get<DiscountResult>(`/loyalty/accounts/${id}/discount`).then((r) => r.data),

  getTransactions: (id: string, page = 1, limit = 20) =>
    apiClient
      .get<{ items: LoyaltyTransaction[]; total: number; totalPages: number }>(
        `/loyalty/accounts/${id}/transactions`,
        { params: { page, limit } },
      )
      .then((r) => r.data),

  getRedemptions: (id: string) =>
    apiClient
      .get<{ items: RewardRedemption[] }>(`/loyalty/accounts/${id}/redemptions`)
      .then((r) => r.data),

  earnPoints: (payload: { identifier: string; billId: string; billAmount: number; description?: string }) =>
    apiClient.post<EarnResult>('/loyalty/earn', payload).then((r) => r.data),

  adjustPoints: (payload: { accountId: string; points: number; reason: string }) =>
    apiClient.post('/loyalty/adjust', payload).then((r) => r.data),

  getCatalog: () =>
    apiClient.get<RewardCatalog[]>('/loyalty/rewards').then((r) => r.data),

  redeem: (payload: { accountId: string; rewardId: string; notes?: string }) =>
    apiClient.post<RewardRedemption>('/loyalty/redeem', payload).then((r) => r.data),

  processRedemption: (id: string, status: 'APPROVED' | 'REJECTED' | 'FULFILLED', notes?: string) =>
    apiClient.patch<RewardRedemption>(`/loyalty/redemptions/${id}`, { status, notes }).then((r) => r.data),

  // ── Card configuration ──────────────────────────────────────────────────
  getCardConfig: () =>
    apiClient.get<CardCategory[]>('/loyalty/card-config').then((r) => r.data),

  recalculateTiers: () =>
    apiClient.post<{ updated: number }>('/loyalty/card-config/recalculate-tiers').then((r) => r.data),

  updateCardConfig: (id: string, data: Partial<{
    minSpend: number;
    maxSpend: number | null;
    earnRatePer100: number;
    pointValuePer100: number;
    discountThresholds: DiscountThreshold[];
    colourHex: string;
    isActive: boolean;
  }>) =>
    apiClient.patch<CardCategory>(`/loyalty/card-config/${id}`, data).then((r) => r.data),
};
