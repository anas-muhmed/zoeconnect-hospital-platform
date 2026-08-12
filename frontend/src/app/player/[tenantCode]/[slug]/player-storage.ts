/**
 * CMS Player — last-known-good playlist persistence.
 *
 * Stores the most recently *fully synced* (all assets successfully cached)
 * playlist snapshot in localStorage, keyed by display slug. On page load /
 * app restart this lets the player resume playback immediately from cache
 * -- before the server has even responded -- and only swap to newer content
 * once a fresh sync completes in the background (see page.tsx).
 */

import type { SnapshotItem } from './content-renderers';

export interface PersistedPlayerState {
  slug: string;
  versionId: string;
  versionNumber: number;
  playlistId: string;
  playlistName: string;
  items: SnapshotItem[];
  savedAt: string;
}

function storageKey(slug: string): string {
  return `cms-player-state-${slug}`;
}

export function saveKnownGoodState(state: PersistedPlayerState): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey(state.slug), JSON.stringify(state));
  } catch {
    // Non-fatal -- offline restore just won't have this snapshot available next time.
  }
}

export function loadKnownGoodState(slug: string): PersistedPlayerState | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPlayerState;
    return parsed?.items?.length ? parsed : null;
  } catch {
    return null;
  }
}

/** v1.0: clears the persisted known-good snapshot (used by the remote CLEAR_CACHE command). */
export function clearKnownGoodState(slug: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(storageKey(slug));
  } catch {
    // Non-fatal.
  }
}
