'use client';

import { createContext, useContext, useEffect, useCallback, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store/auth.store';
import { authApi } from '@/lib/api/auth.api';
import { licenseApi } from '@/lib/api/license.api';
import { SessionManager, LogoutReason } from '@/lib/auth/SessionManager';
import { SessionConstants } from '@/lib/auth/SessionConstants';
import BranchSelectModal from '@/components/branch/BranchSelectModal';

// Marketing-site sign-in hand-off (cloud only): the public website's own
// /sign-in page authenticates directly against this app's real /auth/login
// endpoint, then redirects here with `?ssoToken=...&loginOrigin=website` --
// same ssoToken bridge the HIS auto-login iframe already uses (see
// verifyAuth() below), plus this extra marker so logout() knows to send the
// user back to the website's sign-in page instead of this app's own /login.
// Persisted to localStorage (not the sessionStorage-backed auth store) so it
// 'zc_login_origin' marker is stored, and login handoffs from other contexts
// clear it.
//
// Real incident (2026-08-07): the marketing site's origin used to live here
// as its own `NEXT_PUBLIC_MARKETING_SITE_URL` build-time constant, with a
// hardcoded `http://localhost:3010` fallback -- same class of bug as the
// NEXT_PUBLIC_API_URL/NEXT_PUBLIC_WS_URL incidents (a NEXT_PUBLIC_* var
// never wired into the hdsp-frontend image's build args, so every
// production build baked in the fallback and every cloud logout sent users
// to localhost). Fixed by dropping the build-time constant entirely and
// reading `publicLoginUrl` from `GET /license/status` at logout time
// instead (see licenseApi's `LicenseStatus.publicLoginUrl` doc comment) --
// the same backend-owned, runtime-fetched value the deploymentMode check
// right below it already uses, for the same reason.

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  /** `identifier` may be either a username or an email address (Phase 7, ZoeConnect Identity Architecture Migration) -- see authApi.login()'s doc comment. */
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export interface Branch {
  id: string;
  name: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  hisEmployeeCode?: string | null;
  /** Multi-role: array of { id, name } objects */
  roles: { id: string; name: string }[];
  /** Union of all permissions across all assigned roles */
  permissions: string[];
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  /** Branches this user can access (from Oracle orgstructure) */
  branches?: Branch[];
  /** Currently active branch ID */
  activeBranchId?: string | null;
  /** Active department ID mapped from HIS */
  activeDepartmentId?: string | null;
  /** Active service center ID mapped from HIS */
  activeServiceCenterId?: string | null;
  /** Display name for activeDepartmentId, as sent directly by HIS at login time */
  activeDepartmentName?: string | null;
  /** Display name for activeServiceCenterId, as sent directly by HIS at login time */
  activeServiceCenterName?: string | null;
  /** True if session is locked to a specific context via HIS integration */
  isHisIntegration?: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_ROUTES = ['/login', '/forgot-password', '/token/display'];
// Route prefixes that are always public (TV display pages, kiosks) -- these
// routes authenticate themselves independently and must never be bounced to
// /login by this global guard. The cross-origin HIS Registration Assistant
// widget (/widget/*) that used to be listed here was removed -- HIS now
// registers patients via a plain Token Number field + direct API calls, no
// iframe/ZoeConnect route involved. See docs/his-integration/DIRECT_TOKEN_MRN_MAPPING.md.
const PUBLIC_PREFIXES = ['/display/', '/token/display/', '/kiosk/', '/cms/player/', '/player/', '/feedback/f/'];

export default function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, token, setAuth, clearAuth, isLoading, setLoading, activeBranchId } = useAuthStore();
  const [showBranchPicker, setShowBranchPicker] = useState(false);

  // Zustand's persist middleware hydrates from sessionStorage asynchronously.
  const [storeHydrated, setStoreHydrated] = useState(false);

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setStoreHydrated(true);
    } else {
      const unsub = useAuthStore.persist.onFinishHydration(() => setStoreHydrated(true));
      return unsub;
    }
  }, []);

  useEffect(() => {
    SessionManager.initCrossTabSync();
  }, []);

  // Verify token on mount — but only after the store has re-hydrated
  useEffect(() => {
    if (!storeHydrated) return;

    const verifyAuth = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const ssoToken = searchParams.get('ssoToken');
      const loginOrigin = searchParams.get('loginOrigin');

      if (loginOrigin === 'website') {
        localStorage.setItem(SessionConstants.LOGIN_ORIGIN_KEY, 'website');
        searchParams.delete('loginOrigin');
      }

      if (ssoToken) {
        // We have a fresh token from a HIS auto-login iframe load, or from
        // the marketing website's own sign-in page (see LOGIN_ORIGIN_KEY
        // above) -- both hand off the same way.
        // Put it in the store immediately so it's used for the profile fetch
        useAuthStore.getState().setAuth(null, ssoToken, undefined);

        // Remove it from the URL so it's not sitting in history/address bar
        searchParams.delete('ssoToken');
        const newUrl = window.location.pathname + (searchParams.toString() ? '?' + searchParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      } else if (loginOrigin === 'website') {
        // loginOrigin was present but ssoToken wasn't (shouldn't normally
        // happen) -- still clean the marker off the URL.
        const newUrl = window.location.pathname + (searchParams.toString() ? '?' + searchParams.toString() : '');
        window.history.replaceState({}, '', newUrl);
      }

      const currentToken = useAuthStore.getState().token;
      if (!currentToken) {
        const isPublic = PUBLIC_ROUTES.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
        if (!isPublic) router.replace('/login');
        // isLoading defaults to true (see auth.store.ts) so it must be
        // explicitly resolved on every path, including this early return --
        // otherwise any consumer gating on isLoading (e.g. PlatformLayout)
        // would spin forever for a genuinely unauthenticated visitor.
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const session = await authApi.getSession();
        setAuth(session.user, currentToken, undefined, session.user.activeBranchId, session.user.branches, session.session.idleTimeoutMinutes, session.session.deploymentMode, session.session.websiteLoginUrl, session.session.appLoginUrl);
      } catch {
        SessionManager.logout(LogoutReason.TOKEN_EXPIRED);
      } finally {
        setLoading(false);
      }
    };
    verifyAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeHydrated]);

  const login = useCallback(async (identifier: string, password: string) => {
    const { user: authUser, accessToken, refreshToken } = await authApi.login(identifier, password);
    setAuth(authUser, accessToken, refreshToken, authUser.activeBranchId, authUser.branches);

    if (authUser.mustChangePassword) {
      router.replace('/change-password');
      return;
    }

    // Show branch picker if user has multiple branches and none is pre-selected
    const hasBranches = (authUser.branches?.length ?? 0) > 0;
    const needsPicker = hasBranches && !authUser.activeBranchId;
    if (needsPicker) {
      setShowBranchPicker(true);
    } else {
      router.replace('/dashboard');
    }
  }, [router, setAuth]);

  const logout = useCallback(async () => {
    SessionManager.logout(LogoutReason.MANUAL);
  }, []);

  const handleBranchSelected = useCallback(() => {
    setShowBranchPicker(false);
    router.replace('/dashboard');
  }, [router]);

  // Bug fix: dismissing the mandatory branch picker (backdrop click) used to
  // do nothing. Since login already stored tokens before this modal shows,
  // "closing" it without picking a branch cancels that sign-in outright —
  // discard the session and send them back to the login form.
  const handleBranchPickerCancel = useCallback(() => {
    setShowBranchPicker(false);
    SessionManager.logout(LogoutReason.MANUAL);
  }, []);

  return (
    <AuthContext.Provider value={{
      isAuthenticated: !!user && !!token,
      isLoading,
      user: user as AuthUser | null,
      login,
      logout,
    }}>
      {children}
      {showBranchPicker && user && (
        <BranchSelectModal
          branches={user.branches ?? []}
          onSelected={handleBranchSelected}
          onCancel={handleBranchPickerCancel}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
