'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import { announceToken } from '../audio/tokenAudio';
import { resolveSocketBaseUrl } from '../utils/socket-url';
import { EventBus } from '../events/EventBus';

const WS_URL = resolveSocketBaseUrl();

// DEFENSE-IN-DEPTH FIX (production incident, 2026-08) -- `||`, not `??`;
// see src/lib/api/client.ts's matching comment for the full rationale
// (an empty-but-defined NEXT_PUBLIC_API_URL, which `??` would not catch).
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

// ── Shared types (also used by display board) ────────────────────────────────

export interface CounterSlot {
  id:            string;
  counterNumber: number;
  currentToken:  number | null;
  isOccupied:    boolean;
  operatorId?:   string | null; // who holds this counter (exposed for JoinPanel "your counter" detection)
  operatorName?: string | null; // display name of the operator holding this counter, if resolvable
}

export interface LocationState {
  id:           string;
  code:         string;
  label:        string;
  isActive:     boolean;
  displayOrder: number;
  counters:     CounterSlot[];
  calledTokens: number[];
  noShowTokens: number[];
  issuedCount:  number;
  /** Globally-unique TV display board token — see backend TokenLocation.displayToken's doc comment. */
  displayToken?: string | null;
}

export interface TokenCalledPayload {
  locationId:    string;
  locationCode:  string;
  locationLabel: string;
  counterNumber: number;
  counterId:     string;
  tokenNumber:   number;
  calledBy:      string;
  calledAt:      string;
  action?:       'CALLED' | 'RECALLED' | 'MISSED';
}

export interface SessionInfo {
  locked:         boolean;
  locationId?:    string;
  counterNumber?: number;
}

interface UseTokenSocketOptions {
  /** Play audio announcement when a token is called (default: true) */
  withAudio?: boolean;
  onError?:   (msg: string) => void;
  onCalled?:  (payload: TokenCalledPayload) => void;
  /** Fired when an admin flips the branch's token issuance mode (LOCATION_BASED <-> SERVICE_CENTER_BASED) */
  onModeChanged?: (payload: { branchId: string; mode: 'LOCATION_BASED' | 'SERVICE_CENTER_BASED' }) => void;
}

export interface UseTokenSocketResult {
  connected:    boolean;
  locations:    LocationState[];
  lastCalled:   TokenCalledPayload | null;
  session:      SessionInfo | null;
  joinCounter:  (locationId: string, counterNumber: number) => void;
  leaveCounter: (locationId: string, counterNumber: number) => void;
  callToken:    (locationId: string, counterNumber: number, tokenNumber: number) => void;
  recallToken:  (locationId: string, counterNumber: number, tokenNumber: number) => void;
  markNotArrived: (locationId: string, counterNumber: number, tokenNumber: number) => void;
  resetCounter: (locationId: string, counterNumber: number) => void;
}

export function useTokenSocket(options: UseTokenSocketOptions = {}): UseTokenSocketResult {
  const { withAudio = true, onError, onCalled, onModeChanged } = options;

  const [connected,  setConnected]  = useState(false);
  const [locations,  setLocations]  = useState<LocationState[]>([]);
  const [lastCalled, setLastCalled] = useState<TokenCalledPayload | null>(null);
  const [session,    setSession]    = useState<SessionInfo | null>(null);

  const socketRef       = useRef<Socket | null>(null);
  const heartbeatRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef      = useRef<SessionInfo | null>(null);

  // Stable refs for callbacks — avoids stale closures without recreating the socket
  const onErrorRef  = useRef(onError);
  const onCalledRef = useRef(onCalled);
  const withAudioRef = useRef(withAudio);
  const onModeChangedRef = useRef(onModeChanged);
  useEffect(() => { onErrorRef.current  = onError;   }, [onError]);
  useEffect(() => { onCalledRef.current = onCalled;  }, [onCalled]);
  useEffect(() => { withAudioRef.current = withAudio; }, [withAudio]);
  useEffect(() => { onModeChangedRef.current = onModeChanged; }, [onModeChanged]);

  // Keep sessionRef in sync so interval closures read the latest value
  useEffect(() => { sessionRef.current = session; }, [session]);

  // ── Proactive token refresh ───────────────────────────────────────────────
  //
  // JWT access tokens expire in 15 min. Without this, any WebSocket reconnect
  // after expiry triggers "Authentication required" because the gateway re-verifies
  // the token on every connection. This schedules a silent refresh 2 min before
  // expiry — updating the store AND socket.auth so the next reconnect succeeds.
  // The existing WS connection is never interrupted.
  const scheduleRefresh = useCallback((accessToken: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try {
      const payload     = JSON.parse(atob(accessToken.split('.')[1]));
      const msUntilExp  = payload.exp * 1000 - Date.now();
      const delay       = msUntilExp <= 0 ? 0 : Math.max(msUntilExp - 2 * 60 * 1000, 5_000); // refresh immediately if expired, else 2 min early

      refreshTimerRef.current = setTimeout(async () => {
        const { refreshToken } = useAuthStore.getState();
        if (!refreshToken) return;
        try {
          const res = await fetch(`${API_BASE}/auth/refresh`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ refreshToken }),
          });
          if (!res.ok) throw new Error(`Refresh HTTP ${res.status}`);
          const data = await res.json();
          // Persist new tokens in store (triggers other interceptors if needed).
          // Bug fix: this used to omit activeBranchId/userBranches, which
          // reset them to null/[] on every silent refresh (~every 13 min)
          // even though the refreshed JWT still carries the correct branch —
          // desyncing the sidebar's "Active Branch" display and any
          // branch-scoped UI from the token actually in use. Carry the
          // current values forward explicitly.
          const { activeBranchId: currentBranchId, userBranches: currentBranches } = useAuthStore.getState();
          useAuthStore.getState().setAuth(
            data.user,
            data.accessToken,
            data.refreshToken ?? refreshToken,
            data.user?.activeBranchId ?? currentBranchId,
            currentBranches,
          );
          // Update socket auth for the NEXT reconnect without disconnecting now
          if (socketRef.current) {
            socketRef.current.auth = { token: data.accessToken };
          }
          // Chain: schedule refresh for the new token
          scheduleRefresh(data.accessToken);
        } catch {
          // Silent failure — user will see auth error only if the socket reconnects
          // after expiry. In practice this rarely happens on a stable LAN.
        }
      }, delay);
    } catch { /* malformed JWT */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Socket lifecycle — created ONCE on mount ──────────────────────────────
  //
  // The socket is NOT recreated when the access token refreshes. Instead:
  //   1. scheduleRefresh() updates socket.auth silently before expiry
  //   2. handleDisconnect on the server no longer deletes the Redis session key,
  //      so reconnects after a network blip auto-restore the counter via findExistingSession
  //   3. handleConnection on the server calls findExistingSession and emits token:session
  //      so the client UI recovers without user interaction
  useEffect(() => {
    const initialToken = useAuthStore.getState().token;
    if (!initialToken) return;

    const socket: Socket = io(`${WS_URL}/token`, {
      auth:                { token: initialToken },
      transports:          ['websocket'],
      reconnection:        true,
      reconnectionDelay:   1_000,
      reconnectionDelayMax: 5_000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Server auto-restores the session via findExistingSession in handleConnection
      // and will emit token:session — no need to re-emit token:join from the client.
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('token:state', (data: LocationState[]) => {
      setLocations(data);
    });

    socket.on('token:called', async (payload: TokenCalledPayload) => {
      setLastCalled(payload);
      if (withAudioRef.current) {
        try { await announceToken(payload.tokenNumber, payload.counterNumber); } catch { /* visual fallback */ }
      }
      onCalledRef.current?.(payload);
    });

    socket.on('token:issued', ({ locationId, issuedCount }: { locationId: string; issuedCount: number }) => {
      setLocations(prev => prev.map(loc => 
        loc.id === locationId ? { ...loc, issuedCount } : loc
      ));
    });

    socket.on('token:session', (info: SessionInfo) => {
      setSession(info.locked ? info : null);
    });

    socket.on('token:error', ({ message }: { message: string }) => {
      onErrorRef.current?.(message);
    });

    // Bug fix: an admin flipping LOCATION_BASED <-> SERVICE_CENTER_BASED mode
    // used to leave already-open operator sessions stuck showing the old
    // join panel until they manually reloaded (the GET /token/config result
    // was cached client-side with no way to know it went stale). The server
    // now pushes this event immediately after a successful mode change.
    socket.on('token:mode-changed', (payload: { branchId: string; mode: 'LOCATION_BASED' | 'SERVICE_CENTER_BASED' }) => {
      onModeChangedRef.current?.(payload);
    });

    // 30 s heartbeat to keep Redis session alive (TTL = 1 h, refreshed each beat)
    heartbeatRef.current = setInterval(() => {
      const s = sessionRef.current;
      if (s?.locked && s.locationId && s.counterNumber != null) {
        socket.emit('token:heartbeat', {
          locationId:    s.locationId,
          counterNumber: s.counterNumber,
        });
      }
    }, 30_000);

    // Release counter on tab close / hard navigation
    const handleUnload = () => {
      const s = sessionRef.current;
      if (s?.locked && s.locationId && s.counterNumber != null) {
        socket.emit('token:leave', {
          locationId:    s.locationId,
          counterNumber: s.counterNumber,
        });
      }
    };
    window.addEventListener('beforeunload', handleUnload);

    // Start the proactive refresh chain
    scheduleRefresh(initialToken);

    // Listen for application-wide logout event to explicitly sever the socket immediately
    const unsubscribeLogout = EventBus.subscribe('LOGOUT', () => {
      socket.disconnect();
    });

    return () => {
      // Fires on component unmount (SPA navigation away from the token page)
      handleUnload();
      unsubscribeLogout();
      if (heartbeatRef.current)    clearInterval(heartbeatRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      window.removeEventListener('beforeunload', handleUnload);
      socket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← intentionally empty: socket is created once, token refresh is handled internally

  // ── Public actions ────────────────────────────────────────────────────────

  const joinCounter = useCallback((locationId: string, counterNumber: number) => {
    socketRef.current?.emit('token:join', { locationId, counterNumber });
  }, []);

  const leaveCounter = useCallback((locationId: string, counterNumber: number) => {
    socketRef.current?.emit('token:leave', { locationId, counterNumber });
    setSession(null);
  }, []);

  const callToken = useCallback(
    (locationId: string, counterNumber: number, tokenNumber: number) => {
      socketRef.current?.emit('token:call', { locationId, counterNumber, tokenNumber });
    },
    [],
  );

  const recallToken = useCallback(
    (locationId: string, counterNumber: number, tokenNumber: number) => {
      socketRef.current?.emit('token:recall', { locationId, counterNumber, tokenNumber });
    },
    [],
  );

  const markNotArrived = useCallback(
    (locationId: string, counterNumber: number, tokenNumber: number) => {
      socketRef.current?.emit('token:mark-no-show', { locationId, counterNumber, tokenNumber });
    },
    [],
  );

  const resetCounter = useCallback((locationId: string, counterNumber: number) => {
    socketRef.current?.emit('token:reset', { locationId, counterNumber });
  }, []);

  return {
    connected, locations, lastCalled, session,
    joinCounter, leaveCounter, callToken, recallToken, markNotArrived, resetCounter,
  };
}
