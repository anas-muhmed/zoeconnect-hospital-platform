/**
 * Resolves the base URL a Socket.IO client should connect to for the Token
 * Queue realtime channels (Join Counter, kiosks, print-kiosk, display
 * boards).
 *
 * Real incident (2026-07-30): `NEXT_PUBLIC_WS_URL` is a Next.js
 * `NEXT_PUBLIC_*` env var, which gets baked into the client JS bundle at
 * BUILD time -- the exact same value ships to every browser, regardless of
 * what host that browser actually loaded the page from. A dev/single-machine
 * value like `http://127.0.0.1:3001` (this repo's own `frontend/.env.local`)
 * or `http://localhost:3001` only ever resolves to the BROWSER'S OWN
 * machine. That's harmless for whoever happens to be on the same machine as
 * the backend, but for anyone else -- a second PC on the LAN, a kiosk, a
 * phone -- it silently tries to open a websocket to a server that isn't
 * there on their own loopback interface, and the UI just hangs on
 * "connecting to server" forever with no further error. Confirmed via the
 * Token Queue "Join Counter" screen (`(platform)/token/page.tsx`, via
 * `useTokenSocket`) failing exactly this way when opened from a second
 * machine on the LAN.
 *
 * `useTokenSocket.ts` already had a partial guard for this (skip
 * `NEXT_PUBLIC_WS_URL` when it contains the substring `'localhost'`), but
 * missed `127.0.0.1` -- the literal value configured in this repo's own
 * `.env.local` -- so it never actually took effect here. The other
 * Token Queue realtime pages (`print-kiosk`, `token/kiosk/[code]`,
 * `token/display`, `display/[slug]`) had no guard at all: they used
 * `NEXT_PUBLIC_WS_URL` unconditionally whenever it was set.
 *
 * This helper is the single, shared fix: treat `NEXT_PUBLIC_WS_URL` as a
 * real override only when it points somewhere OTHER than this same
 * machine's own loopback interface.
 *
 * Real incident (2026-08-07): the "otherwise" fallback used to be
 * `${window.location.hostname}:3001` -- resolved at runtime (good, fixes
 * the incident above), but it still assumed the backend's raw port (3001)
 * is always directly reachable from wherever the browser is. That's true
 * for a bare self-hosted box with no reverse proxy in front, but false the
 * moment there's a single public ingress point -- the real cloud deployment
 * (Cloudflare -> nginx -> app.zoeconnect.in on 80/443 only) never forwards
 * arbitrary backend ports to the origin, so the browser's WS handshake to
 * `wss://app.zoeconnect.in:3001/...` was refused before nginx ever saw it,
 * and the UI hung on "Connecting to server..." forever. nginx already has a
 * correct `location /socket.io/` proxy (with the WS upgrade headers) for
 * both the cloud and self-hosted configs
 * (docker/nginx/conf.d/cloud.conf, docker/nginx/conf.d/self-hosted.conf),
 * and next.config.mjs already rewrites `/socket.io/:path*` to `BACKEND_URL`
 * for the no-nginx-in-front case -- so the fix is to stop guessing a port
 * at all and just connect same-origin, letting whichever proxy is actually
 * in front of this page (nginx, or Next's own rewrite) route it to the
 * backend. Do not reintroduce a hardcoded backend port here.
 */
export function resolveSocketBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  const isLoopbackOverride = !configured
    || /^https?:\/\/(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0)(?::\d+)?\/?$/i.test(configured.trim());

  if (configured && !isLoopbackOverride) {
    return configured;
  }

  if (typeof window !== 'undefined') {
    // Same origin (protocol + host, port included if the page itself is on
    // a non-standard one) as the page the socket is opened from. Routing to
    // the backend from there is the reverse proxy's job, not this client's.
    return `${window.location.protocol}//${window.location.host}`;
  }

  // Server-side render / no window (shouldn't normally reach here for a
  // 'use client' socket connection, but keeps this safe to import anywhere).
  return '';
}
