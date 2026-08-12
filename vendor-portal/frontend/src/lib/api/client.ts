import axios from 'axios';

// DEFENSE-IN-DEPTH FIX (production incident, 2026-08 -- layer 3 of 3, see
// .gitea/scripts/build-and-push-image.sh's and docker/vendor-frontend.
// Dockerfile's matching comments for the other two): `||` here (not `??`)
// is deliberate. NEXT_PUBLIC_API_URL is baked in at build time (Next.js
// convention) -- if it's ever built as a DEFINED-BUT-EMPTY string (e.g. CI
// forgets to pass `--build-arg NEXT_PUBLIC_API_URL` AND the Dockerfile's
// own `:-` fallback is somehow bypassed), `??` (nullish coalescing) would
// NOT catch that, because an empty string is not `null`/`undefined`. That
// exact gap silently dropped the `/api` prefix from every request in a
// real incident. `||` treats an empty string the same as unset, which is
// the correct behavior for this specific value -- there is no legitimate
// reason `NEXT_PUBLIC_API_URL` would ever be intentionally set to `''`.
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Inject stored token on every request
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('vendor_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      sessionStorage.removeItem('vendor_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);
