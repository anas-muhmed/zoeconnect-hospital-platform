# Registration ↔ HIS Integration — Lead Review & Merge Checklist

Reviewer pass over every change made in this work session, scoped mainly to the
Registration/HIS integration change set (highest risk, freshest code). Earlier
session fixes (Token Queue, branch filter, hydration, kiosk print) are covered
briefly at the end since they were already reviewed and accepted in-session.

Severity key: **BLOCKING** = do not merge/deploy until resolved. **HIGH** =
resolve before production go-live, can merge to a feature branch first.
**MEDIUM** = should verify/fix, not necessarily same-day. **LOW** = follow-up.

---

## 1. Security issues

### 1.1 — BLOCKING: `access_token` query-param auth is global, not scoped to SSE
`JwtStrategy` was changed to accept `ExtractJwt.fromUrlQueryParameter('access_token')`
as a fallback extractor. This was intended only for the SSE endpoint
(`EventSource` can't set headers), but passport-jwt applies the strategy
globally — **every authenticated route in the API now accepts a bearer token
via `?access_token=`**, not just `token/registration/queue/stream`.

Impact: any URL, on any endpoint, now becomes a valid token-bearing artifact —
massively widens where a token can leak via server access logs (only the SSE
route's logs were masked), browser history, Referer headers, proxies/WAFs
upstream of our Nginx, and browser extensions with network access.

Fix required: split into a second named strategy (e.g. `'jwt-sse'`) that
only accepts the query param, and guard *only* the SSE controller route with
it (`@UseGuards(AuthGuard('jwt-sse'))`), leaving the default `'jwt'` strategy
header-only as it was before this change.

### 1.2 — BLOCKING: `/auth/widget-token/renew` bypasses idle-session-timeout policy
`AuthService.refreshToken()` enforces `security.idleTimeoutMinutes` by
checking `CACHE_KEYS.SESSION_ACTIVITY(jti)` and calls `recordActivity()`.
The new `renewWidgetToken()` does **neither** — it will happily mint a new
token forever regardless of configured idle timeout, and never touches the
activity key.

Impact: this isn't just a widget-scoping gap — **any caller holding any
valid access token** (not just the widget) can call this endpoint to extend
their session indefinitely, silently bypassing the hospital's configured
idle-timeout / re-auth policy. This turns a 15-minute access token into a
functionally permanent credential for as long as the holder keeps calling
the endpoint.

Fix required before merge:
- Enforce the same idle-timeout check as `refreshToken()`.
- Call `recordActivity()` on successful renewal.
- Add a claim to widget-issued tokens (e.g. `widgetSession: true`, set only
  when HIS originally mints the token) and reject renewal for tokens without
  it, OR cap total renewal count / absolute session lifetime server-side.

### 1.3 — HIGH: Nginx CSP will break the HIS bridge script you also shipped
`nginx-hdsp-production.conf` sets `script-src 'self'` with no `'unsafe-inline'`
or nonce. `registrationflow-widget-COMPLETE.xhtml` relies on an inline
`<h:outputScript>` block (renders as an inline `<script>` in JSF unless bound
to a resource library). Deploying both as-written means the CSP silently
blocks the bridge script in browsers that enforce it — no second login this
whole task was about, no widget at all.

Fix: either externalize the bridge script to a same-origin `.js` file and
keep `script-src 'self'`, or move to a nonce/hash-based CSP. Do not ship
`'unsafe-inline'` for script-src as the fix.

### 1.4 — HIGH: Referer-header token leakage from the widget's own page URL
The iframe's own address is `/widget/registration?branchId=...&token=...`.
`Referrer-Policy: strict-origin-when-cross-origin` (as configured) strips the
query string for *cross-origin* requests but **not for same-origin ones** —
every same-origin fetch/XHR the widget makes will carry the full URL
(including the token) in the `Referer` header by default. Recommend
`Referrer-Policy: same-origin` or `no-referrer` specifically for the
`/hdsp/widget/` path, and confirm no third-party resources (fonts, analytics)
are ever loaded inside that iframe.

### 1.5 — HIGH: CORS private-IP wildcard now sits behind a wider auth surface
`main.ts` CORS allows any RFC1918-origin over http/https on any port. That
was already true before this change, but this change adds a token-bearing
GET/SSE endpoint and a session-extension endpoint, raising the consequence
of that wildcard being broader than intended. Tighten to explicit HIS
origin(s) for production; don't rely on the private-IP regex as the
production security boundary.

### 1.6 — MEDIUM: No automated test for the new auth-sensitive code paths
No test exists for: `JwtStrategy`'s new extractor (header still wins over
query param; unauthenticated requests with neither are still rejected),
`AuthController.renewWidgetToken`'s guard behavior, or rate-limit behavior
on `/auth/widget-token/renew`. Given 1.1/1.2 above, add these before merge,
not after.

---

## 2. Regressions / robustness gaps introduced

### 2.1 — HIGH: Renewal interval is a hardcoded guess, not derived from server config
`TOKEN_RENEWAL_INTERVAL_MS = 8 * 60_000` assumes `jwt.expiresIn` is ~15m.
The renew endpoint *does* return the real `expiresIn`, but the frontend
ignores it. If an operator later shortens `jwt.expiresIn` (e.g. to 5m)
without touching this frontend constant, every widget session will start
renewing against an already-expired token and land in `AUTH_EXPIRED` within
minutes, in production, with no server-side change having obviously caused
it. Fix: derive the next renewal delay from the returned `expiresIn`.

### 2.2 — HIGH: Any renewal failure — including transient network errors — kills the session
`startTokenRenewal`'s catch block treats *every* rejection (network blip,
5xx, brief Nginx reload) identically to "token is truly invalid" and
immediately calls `handleAuthFailure`, tearing the whole widget down to
`AUTH_EXPIRED`. Same issue in `widgetApiClient`'s response interceptor: any
401 from any endpoint (not just renewal) triggers the same teardown. Needs
to distinguish real 401s from transient failures and retry with backoff
before giving up.

### 2.3 — MEDIUM: Module-scoped singleton state in `widget-client.ts`
`widgetAccessToken` and `authFailureHandler` are module-level, not per-hook
instance. Fine under the current single-instance-per-iframe assumption, but
fragile: a second concurrent mount (React StrictMode double-invoke in dev,
or a future refactor) will have one instance's cleanup (`onWidgetAuthFailure(null)`)
silently disable auth-failure handling for a still-mounted sibling. Low risk
today, but worth a comment/guard or moving to a scoped context if the widget
is ever rendered more than once per page.

### 2.4 — LOW: Token bootstrap runs in the render body, not an effect
```
if (getWidgetToken() !== accessToken && accessToken) { setWidgetToken(accessToken); }
```
This mutates external module state directly during render, which is a React
purity violation (harmless today given the guard condition, but the kind of
pattern React's concurrent renderer / StrictMode double-render is specifically
designed to catch). Prefer `useLayoutEffect` ahead of the data-fetching effect.

### 2.5 — MEDIUM: SSE never re-attempts after falling back to polling
Once `sse.onerror` fires once, the code permanently switches to 8s polling
for the rest of the session — it never retries SSE even if connectivity
recovers. Not a correctness bug (polling works), but worth flagging as a
silent long-term degradation (higher backend load, higher latency) that's
invisible to the operator.

### 2.6 — MEDIUM: `getQueue()` and `sweepExpiredReservations()` have zero test coverage
The new `registration.service.spec.ts` covers reserve/heartbeat/release/
mapPatient/mapVisit/supervisorReset (17 tests, passing), but the queue
visibility query (the subquery excluding other users' active reservations)
and the cron-based expiry sweep are completely untested. These are exactly
the kind of query-builder logic that silently breaks on refactors.

---

## 3. Breaking changes / backward compatibility

### 3.1 — Confirm no non-widget caller of `registration.api.ts`
`registration.api.ts` was repointed from the shared `apiClient` (reads the
logged-in HDSP session) to a new `widgetApiClient` (reads only a
URL-injected token, ignores `useAuthStore` entirely). This is safe **only**
if every caller of `registrationApi` is the widget. Verified via grep this
session (5 files, all under `app/widget/registration` or its hook) — but
grep is not proof against dynamic imports or a not-yet-built supervisor-facing
admin screen for `PATCH .../supervisor-reset`. **Action: confirm there is no
existing or planned non-widget UI (e.g. a supervisor console) that calls
`reserve`/`release`/`mapPatient`/`mapVisit` expecting the logged-in
session's own token — if one exists, it just silently broke.**

### 3.2 — Old, already-deployed HIS integration snippets still work
`registration-widget-integration.xhtml` and `registrationflow-widget-patch.xhtml`
(the two pre-existing docs) were left untouched; `registrationflow-widget-COMPLETE.xhtml`
is a new, separate file. Any HIS site already running the old snippet
continues to work unchanged (same iframe query-param contract: `branchId`,
`token`) — it just won't get renewal/bidirectional-bridge benefits until
someone manually upgrades to the new template. Non-breaking, but worth
confirming with whoever owns HIS-side deployment that this is the intended
rollout model (opt-in upgrade, not auto-applied).

### 3.3 — No new DB migration was needed or added
The 5 entity columns added to `TokenRecord` (`registeredAt`,
`registrationUser`, `supervisorResetAt`, `supervisorResetBy`,
`supervisorResetNote`) already existed in the DB via the pre-existing
migration `1751800000001-AddRegistrationColumnsToTokenRecords.ts`. Verified
column names/types/nullability match exactly (`timestamptz`, `varchar(100)`,
`text`, all nullable). No migration risk here — this was purely closing an
entity/schema drift that already existed before this session.

---

## 4. Cross-feature consistency (spans earlier + current session work)

### 4.1 — HIGH, unverified: does the operator Token Queue grid know about `REGISTERED` status?
`registration.service.ts`'s `getQueue()` (widget-facing) explicitly filters
`status IN ('WAITING','CALLED')`, so registered tokens correctly disappear
from the *widget*. It was **not verified in this pass** whether the
*operator-facing* calling grid (`token.service.ts`, largely Redis-driven,
from earlier in this session) also excludes `REGISTERED` tokens, or whether
a token could still show as callable to a counter operator after a
receptionist has already registered it. **Action: confirm before merge.**

### 4.2 — MEDIUM, unverified: interaction between "mark not arrived" and `REGISTERED` status
The Token Queue "not arrived" feature (earlier this session) is a
Redis-only, per-day-TTL flag on `TokenRecord`, independent of the DB
`status` column. A token could theoretically be flagged no-show in Redis
*and* `REGISTERED` in the DB at the same time if a receptionist completes
registration on a token an operator has separately marked not-arrived.
No reconciliation exists between the two. Low likelihood, but worth a
product decision on which state should win in the UI.

---

## 5. Deployment / migration risk

### 5.1 — Nginx config structure
`map`, `log_format`, `upstream`, and `limit_req_zone` directives in
`nginx-hdsp-production.conf` must live in the `http{}` context. If this file
is dropped into a per-site `conf.d/*.conf` pattern alongside other site
configs that also define directives with these same names, `nginx -t` will
fail on a duplicate-name collision. Run `nginx -t` in a staging reload
before any production reload, and if using per-site includes, move the
shared http-level blocks into one common included file instead of
duplicating this whole file per vhost.

### 5.2 — Sandbox/CI TypeScript verification was incomplete
`tsc --noEmit` could not be run to a clean, trusted result against the full
backend in this environment — the sandbox's mount of the repo repeatedly
served stale/truncated snapshots of recently-edited files (a known issue
from earlier in this session, unrelated to the code itself). Where I could
force a resync (`registration.service.ts` + `token-record.entity.ts`), it
compiled and 17/17 Jest tests passed. For `auth.controller.ts`,
`auth.service.ts`, and `jwt.strategy.ts`, correctness was verified by direct
code review only, not a clean sandbox `tsc` run. **Action: run
`tsc --noEmit` and the full test suite in CI/a clean checkout before merge —
do not trust this session's sandbox output as the final verification.**

### 5.3 — No rollback/staging plan captured for the HIS-side template
`registrationflow-widget-COMPLETE.xhtml` has never been pasted into or
compiled against a real HIS project (no HIS source exists in this
environment — see disclosure banner in the file itself). Treat it as an
unvalidated reference until a developer with HIS repo access adapts and
tests it in a staging HIS environment.

### 5.4 — Widget-token-renew endpoint needs its own rollout gate
Given 1.2 (idle-timeout bypass) and 1.1 (global query-param auth), do not
enable the new Nginx routing / expose `/auth/widget-token/renew` in
production until both are fixed. Recommend feature-flagging or holding this
behind a branch until the BLOCKING items are resolved.

---

## 6. Pre-merge checklist

- [ ] **1.1** Split query-param JWT extraction into a dedicated `'jwt-sse'` strategy scoped only to the SSE route; revert `JwtStrategy` to header-only for all other routes.
- [ ] **1.2** Add idle-timeout enforcement + `recordActivity()` call to `renewWidgetToken()`; add a widget-scoped token claim or renewal cap.
- [ ] **1.3** Resolve the CSP `script-src 'self'` vs. inline HIS bridge script conflict (externalize script or move to nonce-based CSP).
- [ ] **1.4** Tighten `Referrer-Policy` for the widget path so the token-bearing page URL isn't sent as Referer on same-origin requests.
- [ ] **1.5** Replace the private-IP CORS wildcard with explicit HIS origin(s) before production.
- [ ] **1.6** Add tests for `JwtStrategy` extractor precedence and `renewWidgetToken` guard/rate-limit behavior.
- [ ] **2.1** Derive renewal timing from the server-returned `expiresIn` instead of a hardcoded interval.
- [ ] **2.2** Distinguish transient renewal/API failures from real auth failures; add retry/backoff before tearing down the session.
- [ ] **3.1** Confirm (don't assume) there is no non-widget consumer of `registration.api.ts`, especially any supervisor-reset UI.
- [ ] **4.1** Confirm the operator Token Queue grid excludes `REGISTERED` tokens.
- [ ] **4.2** Product decision on Redis no-show flag vs. DB `REGISTERED` status precedence.
- [ ] **5.1** `nginx -t` against the actual target server structure (not in isolation) before any reload.
- [ ] **5.2** Clean-checkout `tsc --noEmit` + full test suite run in CI, not just this session's sandbox.
- [ ] **5.3** HIS-side template validated by someone with real HIS source access, in a staging HIS environment.
- [ ] **5.4** Hold `/auth/widget-token/renew` + SSE query-param auth behind a flag/branch until 1.1 and 1.2 are fixed.
- [ ] (Follow-up, non-blocking) Add test coverage for `getQueue()` and `sweepExpiredReservations()`.
