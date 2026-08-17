import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  initAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  setAuth: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('jwt_token', token);
      localStorage.setItem('user_data', JSON.stringify(user));
    }
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('user_data');
    }
    set({ user: null, token: null, isAuthenticated: false });
  },

  initAuth: () => {
    if (typeof window !== 'undefined') {
      // ── ZoeConnect integration bridge ────────────────────────────────
      // Mounted inside the main ZoeConnect app (same browser origin, even
      // though it's proxied through to this app's own separate Next.js
      // process -- see next.config.js), a user reaching this page almost
      // always arrived by clicking "LifeGenX" from the already-logged-in
      // ZoeConnect dashboard/sidebar. Prefer that session over this app's
      // own jwt_token/user_data (sessionStorage's 'hdsp-auth' key, Zustand
      // persist -- see ZoeConnect frontend's auth.store.ts) so they don't
      // have to log in a second time; falls through to this app's own
      // stored token for anyone who reaches it directly instead.
      try {
        const raw = sessionStorage.getItem('hdsp-auth');
        const session = raw ? JSON.parse(raw)?.state : null;
        if (session?.token && session?.user) {
          const user = {
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.fullName || session.user.username || '',
            role: session.user.roles?.[0]?.name || '',
            department: '',
          };
          set({ user, token: session.token, isAuthenticated: true });
          return;
        }
      } catch {
        // No usable ZoeConnect session -- fall through to this app's own token below.
      }

      const token = localStorage.getItem('jwt_token');
      const userStr = localStorage.getItem('user_data');
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          set({ user, token, isAuthenticated: true });
        } catch {
          localStorage.removeItem('jwt_token');
          localStorage.removeItem('user_data');
        }
      }
    }
  }
}));
