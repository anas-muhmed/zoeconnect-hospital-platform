import { apiClient } from './client';

export type CampaignType = 'FESTIVAL' | 'BIRTHDAY' | 'ANNIVERSARY' | 'CUSTOM';

export interface Campaign {
  id: string;
  name: string;
  campaignType: CampaignType;
  multiplier: number;
  bonusPoints: number;
  /** Card tier codes eligible for this campaign. Empty = all tiers. */
  eligibleCardCodes: string[];
  startDate: string | null;
  endDate: string | null;
  conditions: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export interface CreateCampaignPayload {
  name: string;
  campaignType: CampaignType;
  multiplier?: number;
  bonusPoints?: number;
  /** Card tier codes eligible; empty/omitted = applies to all tiers */
  eligibleCardCodes?: string[];
  startDate?: string;
  endDate?: string;
  conditions?: Record<string, unknown>;
  isActive?: boolean;
}

export const campaignApi = {
  list: (activeOnly?: boolean) =>
    apiClient
      .get<Campaign[]>('/loyalty/campaigns', { params: { activeOnly } })
      .then((r) => r.data),

  getActive: () =>
    apiClient.get<Campaign[]>('/loyalty/campaigns/active').then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Campaign>(`/loyalty/campaigns/${id}`).then((r) => r.data),

  create: (payload: CreateCampaignPayload) =>
    apiClient.post<Campaign>('/loyalty/campaigns', payload).then((r) => r.data),

  update: (id: string, payload: Partial<CreateCampaignPayload>) =>
    apiClient.patch<Campaign>(`/loyalty/campaigns/${id}`, payload).then((r) => r.data),

  activate: (id: string) =>
    apiClient.patch<Campaign>(`/loyalty/campaigns/${id}/activate`).then((r) => r.data),

  deactivate: (id: string) =>
    apiClient.patch<Campaign>(`/loyalty/campaigns/${id}/deactivate`).then((r) => r.data),
};
