import { useAuthStore } from '@/lib/store/auth.store';
import { authApi } from '@/lib/api/auth.api';
import { getQueryClient } from '@/lib/api/query-client';
import { EventBus } from '@/lib/events/EventBus';
import { SessionLogger } from '@/lib/auth/SessionLogger';
import { SessionConstants } from '@/lib/auth/SessionConstants';
import { SessionMetrics } from '@/lib/auth/SessionMetrics';

export enum SessionState {
  ACTIVE,
  LOGGING_OUT,
  LOGGED_OUT
}

export enum LogoutReason {
  MANUAL = 'MANUAL',
  IDLE_TIMEOUT = 'IDLE_TIMEOUT',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  ACCOUNT_DISABLED = 'ACCOUNT_DISABLED',
  LICENSE_EXPIRED = 'LICENSE_EXPIRED',
  TENANT_SUSPENDED = 'TENANT_SUSPENDED',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',
  FORCE_LOGOUT = 'FORCE_LOGOUT',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  SYSTEM_SHUTDOWN = 'SYSTEM_SHUTDOWN'
}

export interface LogoutBroadcastPayload {
  type: 'LOGOUT';
  reason: LogoutReason;
  timestamp: number;
}

export class SessionManager {
  private static currentState: SessionState = SessionState.ACTIVE;
  private static authSyncChannel: BroadcastChannel | null = null;
  private static storageListener: ((e: StorageEvent) => void) | null = null;
  private static abortController: AbortController = new AbortController();
  private static sessionStartTime: number = Date.now();

  /**
   * Called immediately upon login or SPA hydration to guarantee the session
   * state is reset to ACTIVE and the AbortController is fresh, avoiding
   * inherited dead states.
   */
  public static init() {
    if (this.currentState !== SessionState.ACTIVE) {
      SessionLogger.logTransition(SessionState[this.currentState], SessionState[SessionState.ACTIVE], 'init');
      this.currentState = SessionState.ACTIVE;
      this.abortController = new AbortController();
      this.sessionStartTime = Date.now();
    }
  }

  public static getState(): SessionState {
    return this.currentState;
  }

  public static getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  public static initCrossTabSync() {
    if (typeof window === 'undefined') return;

    if (typeof BroadcastChannel !== 'undefined' && !this.authSyncChannel) {
      this.authSyncChannel = new BroadcastChannel(SessionConstants.AUTH_SYNC_CHANNEL);
      this.authSyncChannel.onmessage = (event) => {
        if (event.data?.type === 'LOGOUT') {
          this.transition(SessionState.LOGGING_OUT, event.data.reason as LogoutReason, false);
        }
      };
    }

    if (!this.storageListener) {
      this.storageListener = (e: StorageEvent) => {
        if (e.key === SessionConstants.LOGOUT_EVENT && e.newValue) {
          try {
            const payload = JSON.parse(e.newValue) as LogoutBroadcastPayload;
            if (payload.type === 'LOGOUT') {
              this.transition(SessionState.LOGGING_OUT, payload.reason as LogoutReason, false);
            }
          } catch { /* ignore */ }
        }
      };
      window.addEventListener('storage', this.storageListener);
    }
  }

  public static cleanup() {
    if (this.authSyncChannel) {
      this.authSyncChannel.onmessage = null;
      this.authSyncChannel.close();
      this.authSyncChannel = null;
    }
    if (this.storageListener) {
      window.removeEventListener('storage', this.storageListener);
      this.storageListener = null;
    }
  }

  /**
   * Safe public wrapper for standard logouts.
   */
  public static async logout(reason: LogoutReason = LogoutReason.MANUAL) {
    return this.transition(SessionState.LOGGING_OUT, reason, true);
  }

  public static async transition(newState: SessionState, reason?: LogoutReason, shouldBroadcast = true) {
    if (typeof window === 'undefined') return;
    
    // Only allow logical progression
    if (newState === SessionState.LOGGING_OUT && this.currentState !== SessionState.ACTIVE) return;
    if (newState === SessionState.LOGGED_OUT && this.currentState === SessionState.LOGGED_OUT) return;

    SessionLogger.logTransition(SessionState[this.currentState], SessionState[newState], reason);
    this.currentState = newState;

    if (newState === SessionState.LOGGING_OUT) {
      this.executeLogoutSequence(reason || LogoutReason.MANUAL, shouldBroadcast);
    }
  }

  private static async executeLogoutSequence(reason: LogoutReason, shouldBroadcast: boolean) {
    // 1. Show spinner immediately
    this.showSpinner();

    // 2. Abort all in-flight network requests tied to this session (including refresh)
    this.abortController.abort();
    // Re-create the controller for the next potential login cycle (e.g. SPA)
    this.abortController = new AbortController();

    // Record session metrics
    const duration = Date.now() - this.sessionStartTime;
    const storeState = useAuthStore.getState();
    SessionMetrics.record({
      event: 'logout',
      reason,
      duration
    });

    // 3. Emit dedicated EventBus event so decoupled modules (like Token UI WebSockets) can react
    EventBus.publish({ type: 'LOGOUT', payload: { reason } });

    // 4. Pre-calculate the redirect destination before destroying the store/localStorage
    let redirectUrl = '/login';
    try {
      const loginOrigin = localStorage.getItem(SessionConstants.LOGIN_ORIGIN_KEY);
      
      if (storeState.deploymentMode === 'cloud') {
        if (loginOrigin === 'website' && storeState.websiteLoginUrl) {
          redirectUrl = storeState.websiteLoginUrl;
        } else if (storeState.appLoginUrl) {
          redirectUrl = storeState.appLoginUrl;
        }
      }
    } catch { /* use default */ }

    if (reason === LogoutReason.IDLE_TIMEOUT) {
      redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + 'timeout=1';
    }

    // 5. Broadcast LOGOUT to other tabs
    if (shouldBroadcast) {
      const payload: LogoutBroadcastPayload = { type: 'LOGOUT', reason, timestamp: Date.now() };
      this.authSyncChannel?.postMessage(payload);
      localStorage.setItem(SessionConstants.LOGOUT_EVENT, JSON.stringify(payload));
      setTimeout(() => localStorage.removeItem(SessionConstants.LOGOUT_EVENT), 100);
    }

    // 6. Query Client wipe
    const queryClient = getQueryClient();
    queryClient.cancelQueries();
    queryClient.clear();

    // 7. State & Storage wipe
    storeState.clearAuth();
    sessionStorage.removeItem('hdsp-auth');
    localStorage.removeItem(SessionConstants.LOGIN_ORIGIN_KEY);
    this.cleanup();

    // 8. Fire /auth/logout backend call (best effort)
    authApi.logout(reason).catch(() => {});

    // 9. Transition to LOGGED_OUT and perform hard redirect
    this.transition(SessionState.LOGGED_OUT);
    window.location.replace(redirectUrl);
  }

  private static showSpinner() {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    overlay.style.zIndex = '999999';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    overlay.innerHTML = `
      <div style="width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #1C6CFF; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <h2 style="margin-top: 20px; color: #333; font-weight: 500;">Signing you out...</h2>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(overlay);
  }
}
