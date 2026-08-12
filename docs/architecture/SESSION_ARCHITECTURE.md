# Session Management Architecture

## Overview
ZoeConnect employs a robust, centralized session management architecture to ensure security, consistency across browser tabs, and graceful handling of network drops and background token expirations.

## Session Lifecycle

### 1. Initialization
When a user logs in, or the single-page application (SPA) hydrates its authentication state, `SessionManager.init()` is called. This explicitly transitions the session into an `ACTIVE` state and spawns a fresh `AbortController`. This prevents a newly logged-in user from inheriting a stale or aborted network state from a previous session.

### 2. The State Machine
The session is governed by a strict state machine defined in `SessionState`:
- `ACTIVE`: The normal operating state. Network requests proceed.
- `LOGGING_OUT`: A transitional state. The UI shows a loading spinner, in-flight network requests are aborted, memory is wiped, and cross-tab synchronization events are broadcasted.
- `LOGGED_OUT`: The terminal state. The user has been redirected to the login page. The SPA context is usually destroyed at this point via a hard redirect.

### 3. Server-Driven Configuration
The backend acts as the single source of truth for session behavior. Upon login, the frontend calls `GET /auth/session` which returns:
```json
{
  "user": { ... },
  "tenantId": "...",
  "session": {
    "idleTimeoutMinutes": 60,
    "deploymentMode": "cloud",
    "websiteLoginUrl": "...",
    "appLoginUrl": "..."
  }
}
```
This design allows enterprise tenants to configure their own idle timeouts dynamically without frontend code changes, and centrally manages login routing based on deployment modes.

### 4. Native Request Cancellation
To prevent "zombie sessions" (where a slow token refresh request resolves *after* a logout has completed, inadvertently resurrecting the session), the Axios interceptor binds all outgoing requests to a global `AbortSignal` exposed by the `SessionManager`. 
When `SessionManager.logout()` is called, `abortController.abort()` instantly kills all pending network traffic.

### 5. Multi-Tab Synchronization
If a user has ZoeConnect open in multiple tabs and logs out (or times out) in one tab, all other tabs must instantly follow suit.
- **Primary Mechanism**: `BroadcastChannel`. Modern browsers use this to instantly pass a `LOGOUT` payload between tabs.
- **Fallback Mechanism**: `localStorage` events. For older browsers, a temporary key is written and immediately deleted, triggering a `storage` event across all open tabs.

### 6. Decoupled Cleanup via EventBus
Certain UI components, like the TV display boards or operator queues, maintain long-lived WebSocket connections (`useTokenSocket.ts`). To avoid coupling these components directly to the `SessionManager`, an internal `EventBus` publishes typed events (e.g., `LOGOUT`). Components subscribe to these events to explicitly sever their own WebSocket connections when a logout begins.

### 7. Extensible Logout Reasons
The architecture relies on a `LogoutReason` enum to track exactly *why* a session ended. This is critical for observability and UI feedback.
- `MANUAL`: User clicked "Log Out".
- `IDLE_TIMEOUT`: User was away from keyboard.
- `TOKEN_EXPIRED`: JWT naturally expired and refresh failed.
- `SYSTEM_SHUTDOWN`: (Enterprise feature) Administrators forced a global disconnect for maintenance.

## Public vs. Authenticated Routes
Public kiosk and display pages completely bypass this architecture. They do not initialize the `SessionTimeoutProvider` and rely entirely on stateless or short-lived token interactions, ensuring that authenticated session timeouts do not inadvertently crash unattended public displays.
