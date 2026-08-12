import { apiClient } from './client';

export interface Branch {
  id: string;
  name: string;
}

export const branchesApi = {
  /** List all branches from Oracle HIS (superadmin only) */
  listAll: async (): Promise<Branch[]> => {
    const { data } = await apiClient.get<Branch[]>('/branches');
    return data;
  },

  /** Get branches assigned to a specific user */
  getUserBranches: async (userId: string): Promise<Branch[]> => {
    const { data } = await apiClient.get<Branch[]>(`/branches/user/${userId}`);
    return data;
  },

  /** Assign branches to a user (replaces existing assignment) */
  assignBranches: async (userId: string, branchIds: string[]): Promise<Branch[]> => {
    const { data } = await apiClient.put<Branch[]>(`/branches/user/${userId}`, { branchIds });
    return data;
  },

  /** Get current user's assigned branches */
  myBranches: async (): Promise<Branch[]> => {
    const { data } = await apiClient.get<Branch[]>('/branches/my');
    return data;
  },
};
