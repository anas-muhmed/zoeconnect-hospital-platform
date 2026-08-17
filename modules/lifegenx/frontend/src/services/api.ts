import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

function resolveToken(): string | null {
  if (typeof window === 'undefined') return null;
  // ZoeConnect integration bridge -- see authStore.ts's initAuth() for the
  // full explanation. Preferred over this app's own jwt_token when present.
  try {
    const raw = sessionStorage.getItem('hdsp-auth');
    const session = raw ? JSON.parse(raw)?.state : null;
    if (session?.token) return session.token;
  } catch {
    // fall through
  }
  return localStorage.getItem('jwt_token');
}

api.interceptors.request.use(
  (config) => {
    const token = resolveToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user_data');
        // Absolute path here is a real browser navigation, not Next's router
        // -- it must include the /lifegenx basePath, or it lands outside
        // this app entirely (the unified platform's other modules/root).
        if (!window.location.pathname.startsWith('/lifegenx/login')) {
          window.location.href = '/lifegenx/login';
        }
      }
    }
    return Promise.reject(error);
  }
);
