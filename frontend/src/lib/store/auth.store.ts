import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser, Branch } from '@/providers/AuthProvider';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  /** Currently selected branch ID */
  activeBranchId: string | null;
  userBranches: Branch[];
  idleTimeoutMinutes: number;
  deploymentMode: string;
  websiteLoginUrl?: string;
  appLoginUrl?: string;
  setAuth: (user: AuthUser | null, token: string, refreshToken?: string, activeBranchId?: string | null, branches?: Branch[], idleTimeoutMinutes?: number, deploymentMode?: string, websiteLoginUrl?: string, appLoginUrl?: string) => void;
  setActiveBranch: (branchId: string, newToken: string) => void;
  clearAuth: () => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  hasPermission: (permission?: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isLoading: true,
      activeBranchId: null,
      userBranches: [],
      idleTimeoutMinutes: 60,
      deploymentMode: 'self_hosted',
      websiteLoginUrl: '',
      appLoginUrl: '',

      setAuth: (user, token, refreshToken, activeBranchId, branches, idleTimeoutMinutes = 60, deploymentMode = 'self_hosted', websiteLoginUrl = '', appLoginUrl = '') =>
        set({
          user,
          token,
          refreshToken: refreshToken ?? null,
          isLoading: false,
          activeBranchId: activeBranchId ?? null,
          userBranches: branches ?? [],
          idleTimeoutMinutes,
          deploymentMode,
          websiteLoginUrl,
          appLoginUrl,
        }),

      setActiveBranch: (branchId, newToken) =>
        set((state) => ({
          activeBranchId: branchId,
          token: newToken,
          user: state.user ? { ...state.user, activeBranchId: branchId } : null,
        })),

      clearAuth: () =>
        set({ user: null, token: null, refreshToken: null, isLoading: false, activeBranchId: null, userBranches: [], idleTimeoutMinutes: 60, deploymentMode: 'self_hosted', websiteLoginUrl: '', appLoginUrl: '' }),

      logout: () =>
        set({ user: null, token: null, refreshToken: null, isLoading: false, activeBranchId: null, userBranches: [], idleTimeoutMinutes: 60, deploymentMode: 'self_hosted', websiteLoginUrl: '', appLoginUrl: '' }),

      setLoading: (isLoading) => set({ isLoading }),

      hasPermission: (permission?: string) => {
        const { user } = get();
        if (!user) return false;
        if (user.roles?.some((r) => r.name === 'SUPER_ADMIN')) return true;
        if (!permission) return true;
        return user.permissions.includes(permission);
      },
    }),
    {
      name: 'hdsp-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        activeBranchId: state.activeBranchId,
        userBranches: state.userBranches,
        websiteLoginUrl: state.websiteLoginUrl,
        appLoginUrl: state.appLoginUrl,
      }),
    },
  ),
);
