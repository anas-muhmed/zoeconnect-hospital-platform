'use client';

/**
 * CMS Player — /cms/player/[slug]
 * Full-screen, unauthenticated digital signage player. Fetches the display's
 * currently-active content (resolved server-side via the v1.0 priority chain:
 * Emergency > Maintenance > Schedule > Group > fallback playlist) and plays
 * items sequentially in a loop, periodically re-checking for newer content.
 *
 * Phase 3 (player robustness): all assets for a version are downloaded and
 * cached locally (see player-cache.ts) *before* that version is ever shown
 * -- new content only replaces what's on screen at the next loop boundary,
 * once the sync fully succeeds. This gives seamless, network-independent
 * transitions between items and lets the player keep running through
 * temporary server/network outages using the last fully-synced version
 * (persisted via player-storage.ts and restored immediately on page load,
 * before the network has even responded -- see the mount effect below).
 * Broken assets are retried with exponential backoff and, if still
 * unreachable, skipped rather than allowed to stall the whole playlist.
 *
 * v1.0 stabilization adds: settings-driven poll/health intervals (no magic
 * constants -- fetched once from GET /cms/player/settings), maintenance-mode
 * and emergency-broadcast screens (rendered ahead of normal content per the
 * server-resolved priority), pause/resume honoring, and remote command
 * polling (Refresh/Restart/ClearCache/ForceSync/Pause/Resume) with
 * acknowledgement. Recent local log lines are piggy-backed onto each health
 * report for remote diagnostics.
 *
 * Rendering itself is unchanged from Sprint 1: normal-content dispatch is
 * still purely through the content-renderers.tsx registry -- this file never
 * branches on content type, and content-renderers.tsx is untouched.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BuildIcon from '@mui/icons-material/Build';
import PlayArrowIcon    from '@mui/icons-material/PlayArrow';

import { useFullscreenToggle } from '@/lib/hooks/useFullscreenToggle';
import { getRenderer, SnapshotItem } from './content-renderers';
import { ensureCached, evictUnusedCacheEntries, getStorageUsageBytes, clearAllCache } from './player-cache';
import { logEvent, getRecentErrors, getRecentLogs } from './player-log';
import { saveKnownGoodState, loadKnownGoodState, clearKnownGoodState, PersistedPlayerState } from './player-storage';
import TickerOverlay from './ticker-overlay';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? `${API_ORIGIN}/api/v1`;

interface RawSnapshotItem extends SnapshotItem {
  mediaName?: string | null;
}

interface PublishVersion {
  id: string;
  versionNumber: number;
  snapshot: { playlistId: string; name: string; items: RawSnapshotItem[] };
}

interface ActiveContentResponse {
  display: { name: string; slug: string };
  version: PublishVersion | null;
  isPaused: boolean;
  emergency: { message: string; activatedAt: string } | null;
  maintenance: { message: string } | null;
}

interface PlayerSettings {
  playerPollIntervalMs: number;
  heartbeatIntervalMs: number;
  retryCount: number;
  retryDelayMs: number;
  offlineTimeoutMs: number;
  maxCacheSizeMb: number;
  defaultImageDurationSeconds: number;
}

const FALLBACK_SETTINGS: PlayerSettings = {
  playerPollIntervalMs: 30_000,
  heartbeatIntervalMs: 30_000,
  retryCount: 4,
  retryDelayMs: 1000,
  offlineTimeoutMs: 90_000,
  maxCacheSizeMb: 2048,
  defaultImageDurationSeconds: 10,
};

interface PendingCommand {
  id: string;
  displayAssignmentId: string;
  commandType: 'REFRESH' | 'RESTART' | 'CLEAR_CACHE' | 'FORCE_SYNC' | 'PAUSE' | 'RESUME';
}

/** Downloads/caches every item's asset, skipping (and logging) any that fail after retries. Never throws. */
async function syncAssets(items: RawSnapshotItem[]): Promise<{ playable: SnapshotItem[]; failedCount: number }> {
  const playable: SnapshotItem[] = [];
  let failedCount = 0;

  for (const item of items) {
    // Widget items (Phase 5, e.g. Queue Widget) aren't file-backed -- nothing to cache/preload,
    // they fetch their own live data client-side. Pass them straight through.
    if (item.mediaId === null) {
      playable.push(item);
      continue;
    }

    const networkUrl = `${API_ORIGIN}${item.url}`;
    const resolution = await ensureCached(networkUrl, (attempt, err) => {
      logEvent('DOWNLOAD_FAILURE', `Attempt ${attempt} failed for "${item.mediaName ?? item.mediaId}": ${String(err)}`);
    });

    if (!resolution) {
      failedCount++;
      logEvent('DOWNLOAD_FAILURE', `Giving up on "${item.mediaName ?? item.mediaId}" after retries -- skipping`);
      continue;
    }

    playable.push({ ...item, url: resolution.objectUrl });
  }

  return { playable, failedCount };
}

export default function CmsPlayerPage() {
  const params = useParams();
  const slug = params.slug as string;
  const tenantCode = params.tenantCode as string;

  const [settings, setSettings] = useState<PlayerSettings>(FALLBACK_SETTINGS);
  const [items, setItems] = useState<SnapshotItem[]>([]);
  const [rawItems, setRawItems] = useState<RawSnapshotItem[]>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<'OK' | 'SYNCING' | 'ERROR' | 'OFFLINE'>('SYNCING');
  const [isPaused, setIsPaused] = useState(false);
  const [emergency, setEmergency] = useState<{ message: string; activatedAt: string } | null>(null);
  const [maintenance, setMaintenance] = useState<{ message: string } | null>(null);

  const pendingVersionRef = useRef<{
    versionId: string; versionNumber: number; playlistId: string; playlistName: string;
    rawItems: RawSnapshotItem[]; playable: SnapshotItem[];
  } | null>(null);
  const syncingRef = useRef(false);
  const restoredRef = useRef(false);
  const lastLogUploadAtRef = useRef<string>(new Date(0).toISOString());

  // -- Fetch player settings once at startup (fallback to sane defaults if unreachable) --
  useEffect(() => {
    fetch(`${API_BASE}/player/settings`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: Partial<PlayerSettings> | null) => {
        if (data) setSettings(prev => ({ ...prev, ...data }));
      })
      .catch(() => { /* keep fallback defaults -- must never block startup */ });
  }, []);

  // -- Restore last known-good state immediately on mount (before any network round trip) --
  useEffect(() => {
    const restored = loadKnownGoodState(slug);
    if (restored) {
      setRawItems(restored.items);
      // Interim paint with plain network URLs (prefixed) while the cache lookup below resolves --
      // avoids a broken-image flash from using the raw relative path.
      setItems(restored.items.map(i => ({ ...i, url: `${API_ORIGIN}${i.url}` })));
      setVersionId(restored.versionId);
      setVersionNumber(restored.versionNumber);
      setPlaylistId(restored.playlistId);
      setPlaylistName(restored.playlistName);
      setCacheStatus('SYNCING');
      logEvent('RECOVERY', `Restored cached playlist "${restored.playlistName}" (v${restored.versionNumber}) from local storage`);

      // Re-resolve each item's URL against the local cache so playback can start immediately offline.
      (async () => {
        const { playable } = await syncAssets(restored.items);
        if (playable.length > 0) setItems(playable);
      })();
    }
    restoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const applyVersion = useCallback((v: {
    versionId: string; versionNumber: number; playlistId: string; playlistName: string;
    rawItems: RawSnapshotItem[]; playable: SnapshotItem[];
  }) => {
    setItems(v.playable);
    setRawItems(v.rawItems);
    setVersionId(v.versionId);
    setVersionNumber(v.versionNumber);
    setPlaylistId(v.playlistId);
    setPlaylistName(v.playlistName);
    setIndex(0);

    const state: PersistedPlayerState = {
      slug,
      versionId: v.versionId,
      versionNumber: v.versionNumber,
      playlistId: v.playlistId,
      playlistName: v.playlistName,
      items: v.rawItems,
      savedAt: new Date().toISOString(),
    };
    saveKnownGoodState(state);
    evictUnusedCacheEntries(v.rawItems.filter(i => i.mediaId !== null).map(i => `${API_ORIGIN}${i.url}`));
  }, [slug]);

  const fetchAndSync = useCallback(async () => {
    if (syncingRef.current) return;
    try {
      const res = await fetch(`${API_BASE}/player/${tenantCode}/${slug}/active-content`);
      if (!res.ok) throw new Error(`Display "${slug}" not found`);
      const data: ActiveContentResponse = await res.json();
      setDisplayName(data.display.name);
      setError(null);
      setIsPaused(!!data.isPaused);
      setEmergency(data.emergency ?? null);
      setMaintenance(data.maintenance ?? null);

      if (!data.version) {
        if (items.length === 0) setCacheStatus('OK');
        return;
      }

      if (data.version.id === versionId) return; // already current, nothing to sync

      syncingRef.current = true;
      setCacheStatus('SYNCING');
      logEvent('SYNC', `New published version detected (v${data.version.versionNumber}) -- syncing assets`);

      const rawSnapshotItems = data.version.snapshot.items;
      const { playable, failedCount } = await syncAssets(rawSnapshotItems);

      const nextVersion = {
        versionId: data.version.id,
        versionNumber: data.version.versionNumber,
        playlistId: data.version.snapshot.playlistId,
        playlistName: data.version.snapshot.name,
        rawItems: rawSnapshotItems,
        playable,
      };

      const isEmergencyTransition = (emergency !== null) !== (data.emergency != null);

      if (playable.length === 0) {
        // Every asset failed -- don't blank the screen, keep showing whatever is currently playing.
        setCacheStatus('ERROR');
        logEvent('SYNC', `Sync failed for v${data.version.versionNumber}: all ${rawSnapshotItems.length} asset(s) unreachable, keeping current content`);
      } else if (items.length === 0 || isEmergencyTransition) {
        // Nothing playing yet OR emergency state just flipped -- apply immediately!
        applyVersion(nextVersion);
        setCacheStatus(failedCount > 0 ? 'ERROR' : 'OK');
        logEvent('SYNC', `Applied v${data.version.versionNumber} immediately (${playable.length}/${rawSnapshotItems.length} assets ready)`);
      } else {
        // Normal transition -- apply at the next loop boundary so playback is never interrupted.
        pendingVersionRef.current = nextVersion;
        setCacheStatus(failedCount > 0 ? 'ERROR' : 'OK');
        logEvent('SYNC', `Sync complete for v${data.version.versionNumber} (${playable.length}/${rawSnapshotItems.length} assets ready) -- applying at next loop boundary`);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load display content');
      setCacheStatus(items.length > 0 ? 'OFFLINE' : 'ERROR');
      logEvent('SYNC', `active-content fetch failed: ${String(err)}`);
    } finally {
      syncingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, versionId, items.length, applyVersion]);

  const reportHealth = useCallback(() => {
    getStorageUsageBytes().then(storageUsageBytes => {
      const since = lastLogUploadAtRef.current;
      const newLogs = getRecentLogs(50).filter(l => l.at > since);
      const body = {
        isPlayerOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        currentPlaylistId: playlistId,
        currentItemLabel: items[index] ? (rawItems[index]?.mediaName ?? items[index].mediaId) : null,
        currentVersionNumber: versionNumber,
        lastSyncAt: new Date().toISOString(),
        cacheStatus,
        lastError: getRecentErrors(1)[0] ?? null,
        storageUsageBytes,
        logs: newLogs.map(l => ({ category: l.category, message: l.message, occurredAt: l.at })),
      };
      lastLogUploadAtRef.current = new Date().toISOString();
      fetch(`${API_BASE}/player/${tenantCode}/${slug}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => { /* health reporting must never disrupt playback */ });
    });
  }, [slug, playlistId, playlistName, versionNumber, items, rawItems, index, cacheStatus]);

  /** v1.0: polls for and executes any pending remote command, then acknowledges it. */
  const pollCommands = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/player/${tenantCode}/${slug}/commands`);
      if (!res.ok) return;
      const commands: PendingCommand[] = await res.json();

      for (const command of commands) {
        logEvent('RECOVERY', `Executing remote command ${command.commandType}`);
        switch (command.commandType) {
          case 'REFRESH':
            await fetch(`${API_BASE}/player/commands/${command.id}/ack`, { method: 'POST' }).catch(() => undefined);
            window.location.reload();
            return;
          case 'RESTART':
            await fetch(`${API_BASE}/player/commands/${command.id}/ack`, { method: 'POST' }).catch(() => undefined);
            window.location.reload();
            return;
          case 'CLEAR_CACHE':
            await clearAllCache();
            clearKnownGoodState(slug);
            await fetch(`${API_BASE}/player/commands/${command.id}/ack`, { method: 'POST' }).catch(() => undefined);
            window.location.reload();
            return;
          case 'FORCE_SYNC':
            await fetchAndSync();
            await fetch(`${API_BASE}/player/commands/${command.id}/ack`, { method: 'POST' }).catch(() => undefined);
            break;
          case 'PAUSE':
          case 'RESUME':
            // Already reflected via the isPaused flag on active-content; these are auto-acknowledged server-side.
            break;
          default:
            break;
        }
      }
    } catch {
      // Command polling failures are non-fatal -- just try again next cycle.
    }
  }, [slug, fetchAndSync]);

  // Initial load + periodic content re-check + health reporting + command polling.
  // Intervals are settings-driven (no magic constants) once GET /cms/player/settings resolves.
  useEffect(() => {
    fetchAndSync();
    reportHealth();
    pollCommands();
    const contentInterval = setInterval(fetchAndSync, settings.playerPollIntervalMs);
    const healthInterval = setInterval(reportHealth, settings.heartbeatIntervalMs);
    const commandInterval = setInterval(pollCommands, settings.playerPollIntervalMs);
    return () => {
      clearInterval(contentInterval);
      clearInterval(healthInterval);
      clearInterval(commandInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, settings.playerPollIntervalMs, settings.heartbeatIntervalMs]);

  const advance = useCallback(() => {
    if (isPaused) return; // A remote PAUSE command freezes the player on the current item.
    setIndex(prevIndex => {
      const next = prevIndex + 1;
      if (next >= items.length) {
        // Loop boundary — apply any pending, already-synced new version now.
        if (pendingVersionRef.current) {
          const pending = pendingVersionRef.current;
          pendingVersionRef.current = null;
          applyVersion(pending);
          return 0;
        }
        return 0;
      }
      return next;
    });
  }, [items.length, applyVersion, isPaused]);

  const current = items[index];
  const renderer = current ? getRenderer(current.mediaType) : undefined;

  const { toggleFullScreen } = useFullscreenToggle();

  return (
    <Box 
      onDoubleClick={toggleFullScreen}
      sx={{
        position: 'fixed', inset: 0, bgcolor: 'black',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        cursor: 'default', // optional, helps user know it's not a regular web page
      }}>
      {/* v1.0: Maintenance mode takes over the whole screen (server never returns both maintenance and emergency together). */}
      {maintenance && !emergency && (
        <Box sx={{ textAlign: 'center' }}>
          <BuildIcon sx={{ fontSize: 64, mb: 2, color: 'grey.500' }} />
          <Typography variant="h4" color="white" gutterBottom>System Maintenance</Typography>
          <Typography variant="h6" color="grey.400">{maintenance.message}</Typography>
        </Box>
      )}

      {!maintenance && !current && (
        <Box sx={{ textAlign: 'center', color: 'grey.500' }}>
          <Typography variant="h6">{displayName || 'CMS Display'}</Typography>
          <Typography variant="body2">
            {error ? error : 'Waiting for published content...'}
          </Typography>
        </Box>
      )}

      {!maintenance && current && renderer && (
        <renderer.Component
          key={current.itemId}
          item={current}
          mediaOrigin=""
          onAdvance={advance}
        />
      )}

      {!maintenance && current && !renderer && (
        <Box sx={{ textAlign: 'center', color: 'grey.500' }}>
          <Typography variant="body2">
            No renderer registered for content type "{current.mediaType}"
          </Typography>
        </Box>
      )}

      {/* v1.0: Emergency broadcast banner overlays whatever content is playing (the emergency
          playlist itself), so the alert is always visible even on top of the emergency content. */}
      {emergency && (
        <Box sx={{
          position: 'absolute', top: 0, left: 0, right: 0,
          bgcolor: 'error.main', color: 'white', py: 1.5, px: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
          zIndex: 10, boxShadow: 3,
        }}>
          <WarningAmberIcon />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{emergency.message}</Typography>
        </Box>
      )}

      {/* Scrolling ticker: rendered unconditionally, independent of maintenance/emergency/content
          state above -- it polls and manages itself entirely (see ticker-overlay.tsx) and is a
          no-op (renders null) whenever the display's ticker is disabled or has no active messages. */}
      <TickerOverlay slug={slug} tenantCode={tenantCode} />
    </Box>
  );
}
