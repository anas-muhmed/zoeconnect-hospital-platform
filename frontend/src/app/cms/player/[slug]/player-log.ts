/**
 * CMS Player — lightweight local log.
 *
 * A small ring buffer persisted to localStorage, used for troubleshooting
 * (playback errors, download failures, sync events, recovery actions)
 * without impacting playback -- writes are synchronous localStorage calls
 * on a capped, small array, not a network call or heavy I/O.
 */

export type PlayerLogCategory = 'PLAYBACK_ERROR' | 'DOWNLOAD_FAILURE' | 'SYNC' | 'RECOVERY';

export interface PlayerLogEntry {
  at: string; // ISO timestamp
  category: PlayerLogCategory;
  message: string;
}

const STORAGE_KEY = 'cms-player-log';
const MAX_ENTRIES = 200;

function readAll(): PlayerLogEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: PlayerLogEntry[]): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Storage full or unavailable -- logging must never throw into the playback path.
  }
}

export function logEvent(category: PlayerLogCategory, message: string): void {
  const entries = readAll();
  entries.push({ at: new Date().toISOString(), category, message });
  writeAll(entries);
}

export function getRecentLogs(limit = 20): PlayerLogEntry[] {
  return readAll().slice(-limit);
}

export function getRecentErrors(limit = 5): string[] {
  return readAll()
    .filter(e => e.category === 'PLAYBACK_ERROR' || e.category === 'DOWNLOAD_FAILURE')
    .slice(-limit)
    .map(e => `[${e.category}] ${e.message}`);
}
