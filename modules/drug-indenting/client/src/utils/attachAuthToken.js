// Attaches the logged-in user's JWT to every outgoing request, whether it
// goes through axios or the native fetch() — this codebase uses both
// inconsistently across components, so rather than editing every call site
// individually, this sets it up once, centrally, at app startup.
//
// The regular-user token ('token' in localStorage) is preferred; 'admin_token'
// is the fallback. AdminDashboard.js's own /api/admin/* calls already send
// their own explicit Authorization header via adminHeaders() and this file
// never overwrites a header a caller already set, so those don't conflict.
// But AdminDashboard.js also embeds AnalyticsDashboard.js (the same
// component CEO/DTC dashboards use) to show live KPIs, and that component's
// axios.get() calls don't set their own header -- they rely entirely on
// this interceptor. Without the admin_token fallback, an admin session has
// no 'token' entry at all, so every one of those calls went out with no
// Authorization header and hit a 401, even though routes/analytics.js's
// requireRole() already allows admin tokens through. Found via E2E testing:
// the Admin Control Panel's "Hospital Formulary Intelligence Console" KPIs
// all rendered as "—"/0 despite ~1,500+ real rows in the database.

import axios from 'axios';

// All API calls from this app must go to /api/drug-indenting/* — the unified
// platform mounts this module there. Components call /api/login, /api/requests
// etc., so we rewrite the prefix centrally here rather than touching every
// call site.
const MODULE_PREFIX = '/api/drug-indenting';

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || localStorage.getItem('admin_token');
  if (token && !config.headers?.Authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Rewrite /api/X → /api/drug-indenting/X
  if (config.url && config.url.startsWith('/api/')) {
    config.url = MODULE_PREFIX + config.url.slice(4);
  }
  return config;
});

const originalFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const token = localStorage.getItem('token') || localStorage.getItem('admin_token');
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // Rewrite /api/X → /api/drug-indenting/X
  const url = typeof input === 'string' && input.startsWith('/api/')
    ? MODULE_PREFIX + input.slice(4)
    : input;
  return originalFetch(url, { ...init, headers });
};
