/**
 * CMS Player — offline asset cache.
 *
 * Uses the browser's Cache Storage API (window.caches) purely as a local
 * blob store -- no Service Worker involved. Each asset URL is fetched once,
 * stored in a named cache, and resolved to an object URL for playback.
 * Because every upload gets a brand-new filename (see cms-media upload
 * controller), a URL that's already cached is guaranteed to be the same
 * content -- so "only download assets that have changed" falls out for
 * free: we simply skip the network fetch whenever the URL is already cached.
 *
 * Falls back to plain network URLs (no offline capability) if Cache Storage
 * isn't available in the current context (e.g. non-secure origin).
 */

const CACHE_NAME = 'cms-player-assets-v1';
const MAX_RETRY_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1000;

function cacheApiAvailable(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadWithRetry(url: string, onAttemptFailed?: (attempt: number, err: unknown) => void): Promise<Response | null> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return response;
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      onAttemptFailed?.(attempt, err);
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)); // exponential backoff: 1s, 2s, 4s
      }
    }
  }
  return null;
}

export interface CacheResolution {
  objectUrl: string;
  fromCache: boolean;
}

/**
 * Ensures `url` is available locally, downloading (with retry) if needed.
 * Returns an object URL suitable for direct use in <img>/<video src>, or
 * null if the asset could not be obtained after all retries (caller should
 * skip this item rather than blocking playback on it).
 */
export async function ensureCached(url: string, onAttemptFailed?: (attempt: number, err: unknown) => void): Promise<CacheResolution | null> {
  if (!cacheApiAvailable()) {
    // No offline capability in this context -- just use the network URL directly.
    return { objectUrl: url, fromCache: false };
  }

  try {
    const cache = await window.caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) {
      const blob = await cached.blob();
      return { objectUrl: URL.createObjectURL(blob), fromCache: true };
    }

    const response = await downloadWithRetry(url, onAttemptFailed);
    if (!response) return null;

    await cache.put(url, response.clone());
    const blob = await response.blob();
    return { objectUrl: URL.createObjectURL(blob), fromCache: false };
  } catch (err) {
    onAttemptFailed?.(MAX_RETRY_ATTEMPTS, err);
    return null;
  }
}

export async function isCached(url: string): Promise<boolean> {
  if (!cacheApiAvailable()) return false;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    const match = await cache.match(url);
    return !!match;
  } catch {
    return false;
  }
}

/** Removes cached entries whose URL is not in `keepUrls`, to bound storage growth as playlists change. */
export async function evictUnusedCacheEntries(keepUrls: string[]): Promise<void> {
  if (!cacheApiAvailable()) return;
  try {
    const cache = await window.caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const keepSet = new Set(keepUrls);
    await Promise.all(
      keys
        .filter(req => !keepSet.has(req.url))
        .map(req => cache.delete(req)),
    );
  } catch {
    // Eviction failures are non-fatal -- storage just grows a bit faster than ideal.
  }
}

/** Approximate storage usage in bytes, via the Storage API (best-effort, may be unavailable). */
export async function getStorageUsageBytes(): Promise<number | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    return estimate.usage ?? null;
  } catch {
    return null;
  }
}

/** v1.0: fully clears the local asset cache (used by the remote CLEAR_CACHE command). */
export async function clearAllCache(): Promise<void> {
  if (!cacheApiAvailable()) return;
  try {
    await window.caches.delete(CACHE_NAME);
  } catch {
    // Non-fatal -- worst case the cache is just not cleared and gets overwritten naturally.
  }
}
