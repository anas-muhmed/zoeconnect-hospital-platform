'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { useAuthStore } from '@/lib/store/auth.store';
import { authApi } from '@/lib/api/auth.api';
import { SessionManager, LogoutReason } from '@/lib/auth/SessionManager';
import { SessionConstants } from '@/lib/auth/SessionConstants';
import ResponsiveDialog from '@/components/ResponsiveDialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Box from '@mui/material/Box';

export interface SessionTimeoutProviderProps {
  children: React.ReactNode;
  mode?: 'interactive' | 'operational';
}

const SessionTimeoutContext = React.createContext<boolean>(false);

export default function SessionTimeoutProvider({ children, mode = 'interactive' }: SessionTimeoutProviderProps) {
  const isNested = React.useContext(SessionTimeoutContext);
  const { isAuthenticated } = useAuth();
  const idleTimeoutMinutes = useAuthStore(state => state.idleTimeoutMinutes);
  const pathname = usePathname();
  
  const lastActivityRef = useRef<number>(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const lastPingRef = useRef<number>(0);
  const lastPointerMoveRef = useRef<number>(0);

  const [warningOpen, setWarningOpen] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const handleLogout = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    SessionManager.logout(LogoutReason.IDLE_TIMEOUT);
  }, []);

  const pingActivity = useCallback(async () => {
    const now = Date.now();
    if (now - lastPingRef.current > 30000) { // Debounce ping to at most once per 30s
      lastPingRef.current = now;
      try {
        await authApi.recordActivity();
      } catch (e) {
        console.error('Failed to record activity', e);
      }
    }
  }, []);

  const handleActivity = useCallback((broadcast = true) => {
    lastActivityRef.current = Date.now();
    setWarningOpen(false);
    
    // Broadcast to other tabs
    if (broadcast && broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: 'SESSION_ACTIVE', timestamp: Date.now() });
      } catch (e) {
        // Channel can already be closed by the time this fires -- e.g. a
        // queued event/interval callback landing just after this effect's
        // cleanup ran (route change, idleTimeoutMinutes update, unmount, or
        // React StrictMode's dev-only mount/unmount/remount cycle), or a
        // race against another tab/effect instance closing the same
        // channel. There's no pre-check the BroadcastChannel spec offers
        // (no `readyState`), so swallow-and-log is the standard-safe
        // pattern here rather than crashing the whole tree over a
        // best-effort cross-tab notification.
        if (process.env.NODE_ENV !== 'production') {
          console.warn('SessionTimeoutProvider: BroadcastChannel postMessage failed (channel likely closed)', e);
        }
      }
    }

    // Ping backend debounced
    pingActivity();
  }, [pingActivity]);

  useEffect(() => {
    // Reset activity on route change
    if (isAuthenticated) {
      handleActivity(true);
    }
  }, [pathname, handleActivity, isAuthenticated]);

  useEffect(() => {
    if (isNested || !isAuthenticated) return;

    // Operational mode just pings periodically, never times out on the frontend
    if (mode === 'operational') {
      const pinger = setInterval(() => {
        authApi.recordActivity().catch(() => {});
      }, 60 * 1000);
      return () => clearInterval(pinger);
    }

    if (idleTimeoutMinutes <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const timeoutMs = idleTimeoutMinutes * 60 * 1000;
    // scalable warning threshold: min(5 minutes, timeout / 5)
    const warningThresholdMs = Math.min(5 * 60 * 1000, timeoutMs / 5);

    // Setup BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannelRef.current = new BroadcastChannel(SessionConstants.AUTH_SYNC_CHANNEL);
      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data?.type === 'SESSION_ACTIVE') {
          handleActivity(false); // Update local timer, but don't broadcast back
        }
      };
    }

    const handleDOMActivity = () => handleActivity(true);
    
    // Throttled pointer move to avoid spam
    const handlePointerMove = () => {
      const now = Date.now();
      if (now - lastPointerMoveRef.current > 1000) {
        lastPointerMoveRef.current = now;
        handleDOMActivity();
      }
    };

    // Attach activity listeners
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach(e => window.addEventListener(e, handleDOMActivity, { passive: true }));
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    // Reset timer on init
    lastActivityRef.current = Date.now();
    pingActivity(); // Ping immediately on load

    // Visibility / Focus handlers to detect sleep/hibernate time skips
    const handleWakeupCheck = () => {
      const timeSince = Date.now() - lastActivityRef.current;
      if (timeSince >= timeoutMs) {
        handleLogout();
      } else {
        handleDOMActivity();
        if (timeSince >= timeoutMs - warningThresholdMs) {
          setWarningOpen(true);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleWakeupCheck();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleWakeupCheck);
    window.addEventListener('focus', handleWakeupCheck);

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;
      
      if (timeSinceLastActivity >= timeoutMs) {
        handleLogout();
      } else if (timeSinceLastActivity >= timeoutMs - warningThresholdMs) {
        setWarningOpen(true);
        setCountdown(Math.ceil((timeoutMs - timeSinceLastActivity) / 1000));
      } else {
        setWarningOpen(false);
      }
    }, 1000);

    return () => {
      events.forEach(e => window.removeEventListener(e, handleDOMActivity));
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleWakeupCheck);
      window.removeEventListener('focus', handleWakeupCheck);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        // Clear the ref so any handleActivity() invocation that lands after
        // this cleanup (a stale event listener, a StrictMode dev
        // remount, etc.) sees `broadcastChannelRef.current` as null and
        // skips the broadcast entirely, instead of holding onto a closed
        // channel object that would throw on postMessage.
        broadcastChannelRef.current = null;
      }
    };
  }, [handleActivity, handleLogout, isAuthenticated, mode, idleTimeoutMinutes, pingActivity, isNested]);

  // If nested, we don't render the provider wrapper again, just the children.
  // Warning modal will be rendered by the top-level provider.
  if (isNested) {
    return <>{children}</>;
  }

  return (
    <SessionTimeoutContext.Provider value={true}>
      {children}
      <ResponsiveDialog
        open={warningOpen}
        onClose={() => handleActivity(true)} // Clicking anywhere closes and resets
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color="warning" />
          Session Expiring Soon
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2}>
            <Typography>
              You have been inactive for a while. For your security, you will be logged out automatically in{' '}
              <strong>{countdown}</strong> seconds.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Click anywhere or press any key to continue your session.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleLogout} color="inherit">
            Log Out Now
          </Button>
          <Button onClick={() => handleActivity(true)} variant="contained" color="primary">
            Stay Signed In
          </Button>
        </DialogActions>
      </ResponsiveDialog>
    </SessionTimeoutContext.Provider>
  );
}
