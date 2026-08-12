# ADR 001: Session Management Architecture

## Status
Accepted

## Context
ZoeConnect is migrating from a single-tenant self-hosted application to a multi-tenant cloud SaaS platform. This required a robust session management architecture that handles multi-tab synchronization, tenant-specific timeouts, aggressive network disconnects, and isolation between public (kiosk/display) and authenticated routes.

Previously, session timeout logic was scattered across `SessionTimeoutProvider`, `auth.store`, and Axios interceptors, leading to race conditions where a late-resolving token refresh could accidentally resurrect a session that was in the middle of logging out.

## Decision

We have adopted a centralized, state-machine-driven session architecture.

### 1. Centralized SessionManager (Singleton)
A single `SessionManager` class orchestrates all logouts across the application. This prevents components from individually trying to manipulate the `auth.store` and ensures a single authoritative source of truth for "is the user logging out?".

### 2. State Machine (`SessionState`)
Instead of a boolean flag (`logoutInProgress`), we use a strict state machine (`ACTIVE` -> `LOGGING_OUT` -> `LOGGED_OUT`). This guarantees that once a logout sequence begins, it cannot be interrupted or reversed by stray network responses.

### 3. Native Network Cancellation (`AbortController`)
To prevent the "late-resolving refresh" race condition, the `SessionManager` exposes a global `AbortSignal`. The Axios interceptor binds all outgoing requests (especially `authApi.refresh()`) to this signal. The instant `LOGGING_OUT` is entered, `abort()` is called, immediately severing all in-flight requests at the network level.

### 4. Server-Driven Configuration
The backend is the sole source of truth for session configuration. The `GET /auth/session` endpoint provides a nested `session` object containing `idleTimeoutMinutes`, `websiteLoginUrl`, `appLoginUrl`, and `deploymentMode`. This allows tenants to configure their own idle timeouts without exposing this logic in frontend constants.

### 5. Fire-and-Forget Logout
The `authApi.logout()` call is best-effort ("fire-and-forget"). We do not `await` the backend response before clearing the local state and redirecting the user. The backend logout endpoint is idempotent (using Redis `setex` to blacklist tokens), so multiple rapid calls or network drops are handled gracefully.

### 6. Public Route Isolation
Public routes (like TV displays and Kiosks) completely bypass `SessionTimeoutProvider` and `SessionManager` logic. They maintain their own independent WebSockets and do not rely on the authenticated user's session state.

### 7. Event-Driven Disconnects
To maintain decoupling, `SessionManager` publishes a typed `LOGOUT` event via an internal `EventBus`. Independent modules (like `useTokenSocket.ts`) subscribe to this bus to explicitly sever WebSockets during a logout without tightly coupling to the `SessionManager` directly.

## Consequences
- **Positive**: Complete elimination of zombie sessions and refresh race conditions.
- **Positive**: Extensible `LogoutReason` enum allows for future OIDC/SAML/Entra ID integrations and `SYSTEM_SHUTDOWN` events.
- **Positive**: Multi-tab synchronization is highly reliable across modern browsers (`BroadcastChannel`) and degrades gracefully (`StorageEvent`).
- **Negative**: Adds slight complexity to the Axios interceptor, which must now attach the global `AbortSignal`.
