# Authentication Flow

This document details the lifecycle and sequence of authentication events in ZoeConnect.

## 1. Login Flow

The login flow handles the initial authentication, establishing the session, and storing the configuration required for idle timeout enforcement.

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant ZoeConnect API
    participant DB/Redis
    
    User->>Browser: Enters credentials
    Browser->>ZoeConnect API: POST /auth/login
    ZoeConnect API->>DB/Redis: Validate credentials
    ZoeConnect API-->>Browser: 200 OK (accessToken, refreshToken, user)
    Browser->>ZoeConnect API: GET /auth/session
    ZoeConnect API->>DB/Redis: Fetch Tenant Settings (idle timeout)
    ZoeConnect API-->>Browser: 200 OK (session { timeout, loginUrls, provider })
    Browser->>Browser: Hydrate auth.store
    Browser->>Browser: SessionManager.init()
    Browser->>User: Redirect to /dashboard
```

## 2. Refresh Flow & Idle Timeout

The refresh flow is triggered automatically by Axios interceptors when an access token expires. The backend strictly enforces idle timeouts during this refresh.

```mermaid
sequenceDiagram
    participant Browser
    participant Axios
    participant ZoeConnect API
    participant Redis
    
    Browser->>Axios: API Request (expired token)
    Axios->>ZoeConnect API: POST /auth/refresh
    ZoeConnect API->>Redis: Check JWT Blacklist
    ZoeConnect API->>Redis: Check Session Activity (idle timeout)
    
    alt Session Active
        ZoeConnect API-->>Axios: 200 OK (new tokens)
        Axios->>Browser: Retry original request
    else Session Idle
        ZoeConnect API-->>Axios: 401 Unauthorized (timeout)
        Axios->>Browser: SessionManager.logout(IDLE_TIMEOUT)
    end
```

## 3. Logout & Cross-Tab Sync

When a user logs out manually or times out, the `SessionManager` orchestrates a clean teardown across all tabs instantly.

```mermaid
sequenceDiagram
    participant Tab 1 (Active)
    participant Tab 2 (Background)
    participant SessionManager
    participant ZoeConnect API
    
    Tab 1 (Active)->>SessionManager: logout(MANUAL)
    SessionManager->>SessionManager: Set state = LOGGING_OUT
    SessionManager->>SessionManager: abortController.abort() (cancel networks)
    SessionManager->>Tab 2 (Background): BroadcastChannel: LOGOUT payload
    SessionManager->>ZoeConnect API: POST /auth/logout (fire-and-forget)
    SessionManager->>SessionManager: Wipe auth.store, query cache
    SessionManager->>Tab 1 (Active): Redirect to /login
    
    Note over Tab 2 (Background): Tab 2 receives LOGOUT event
    Tab 2 (Background)->>SessionManager: Transition to LOGGING_OUT
    Tab 2 (Background)->>SessionManager: Wipe auth.store
    Tab 2 (Background)->>Tab 2 (Background): Redirect to /login
```

## 4. Maintenance Shutdown (Future-Proofing)

ZoeConnect's architecture supports decoupled, event-driven logouts. A future WebSocket connection can broadcast a `SYSTEM_SHUTDOWN` or `LICENSE_REVOKED` payload, immediately ending sessions without waiting for the next 401 response.

```mermaid
sequenceDiagram
    participant Admin
    participant ZoeConnect API
    participant WebSocket
    participant EventBus
    participant SessionManager
    
    Admin->>ZoeConnect API: Suspend Tenant
    ZoeConnect API->>WebSocket: Broadcast: TENANT_SUSPENDED
    WebSocket->>EventBus: publish(LOGOUT, reason: TENANT_SUSPENDED)
    EventBus->>SessionManager: transition(LOGGING_OUT)
    SessionManager->>SessionManager: Redirect to /login
```
