import { apiClient } from './client';

export const settingsApi = {
  getSystemSettings: async (): Promise<Record<string, string>> => {
    const { data } = await apiClient.get<Record<string, string>>('/settings');
    return data;
  },
};
