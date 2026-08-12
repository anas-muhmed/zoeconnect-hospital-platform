/**
 * ZoeConnect Axios API Client
 * - Injects Bearer token from auth store
 * - Handles 401 → token refresh → retry
 * - Generates X-Request-ID for log correlation
 */
import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError, CanceledError } from 'axios';
import { useAuthStore } from '@/lib/store/auth.store';
import { SessionManager, SessionState, LogoutReason } from '@/lib/auth/SessionManager';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

function generateRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  // ── Request Interceptor ────────────────────────────────────────────────────
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    // If logout is occurring, instantly abort new requests
    if (SessionManager.getState() !== SessionState.ACTIVE) {
      const controller = new AbortController();
      config.signal = controller.signal;
      controller.abort('Session terminated');
      return config;
    }

    // Attach session-wide abort signal so active requests die instantly on logout
    if (!config.signal) {
      config.signal = SessionManager.getAbortSignal();
    }

    const token = useAuthStore.getState().token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    config.headers['X-Request-ID'] = generateRequestId();
    return config;
  });

  // ── Response Interceptor — Token Refresh ───────────────────────────────────
  client.interceptors.response.use(
    (response) => {
      // Hard block: never allow responses to resolve if we've transitioned state
      if (SessionManager.getState() !== SessionState.ACTIVE) {
        return Promise.reject(new CanceledError('Session terminated'));
      }
      return response;
    },
    async (error: AxiosError) => {
      if (SessionManager.getState() !== SessionState.ACTIVE) {
        return Promise.reject(new CanceledError('Session terminated'));
      }

      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      // 401 on a non-auth endpoint → attempt token refresh
      if (
        error.response?.status === 401 &&
        !originalRequest._retry &&
        !originalRequest.url?.match(/\/auth\/(login|refresh)/)
      ) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({
              resolve: (token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(client(originalRequest));
              },
              reject,
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const { refreshToken } = useAuthStore.getState();
          if (!refreshToken) throw new Error('No refresh token');

          const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
            refreshToken,
          }, {
            // Very important: bind the refresh token request to the abort controller
            // so it gets killed instantly if the user logs out mid-refresh!
            signal: SessionManager.getAbortSignal()
          });

          // Extra safety check in case the signal abort didn't fire in time
          if (SessionManager.getState() !== SessionState.ACTIVE) {
             throw new CanceledError('Session terminated');
          }

          const { accessToken, refreshToken: newRefreshToken, user } = data;
          const { activeBranchId: currentBranchId, userBranches: currentBranches } = useAuthStore.getState();
          useAuthStore.getState().setAuth(
            user,
            accessToken,
            newRefreshToken ?? refreshToken,
            user?.activeBranchId ?? currentBranchId,
            currentBranches,
          );
          processQueue(null, accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return client(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          SessionManager.transition(SessionState.LOGGING_OUT, LogoutReason.TOKEN_EXPIRED);
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      // If a request was already retried and still got 401, or if it's the refresh token call itself returning 401,
      // it means the session is completely invalid. Trigger logout immediately.
      if (error.response?.status === 401 && (originalRequest._retry || originalRequest.url?.match(/\/auth\/(login|refresh)/))) {
        SessionManager.transition(SessionState.LOGGING_OUT, LogoutReason.TOKEN_EXPIRED);
      }

      return Promise.reject(error);
    },
  );

  return client;
}

export const apiClient = createApiClient();
