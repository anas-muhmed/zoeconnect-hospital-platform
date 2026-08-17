// Tiny in-memory response cache for read-only, non-urgent GET endpoints
// (the analytics dashboard). Not a general-purpose cache -- no eviction
// policy beyond TTL expiry, no cross-process sharing (fine for this app's
// single-process deployment). Keyed by the full request URL (path + query
// string) so different filter combinations on the same route never collide.

const store = new Map();

// Wraps a route handler so its JSON response is cached for `ttlMs`,
// keyed by req.originalUrl. Only successful (res.json) responses are
// cached -- an error response is never stored.
export function cacheResponse(ttlMs) {
  return (req, res, next) => {
    const key = req.originalUrl;
    const cached = store.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return res.json(cached.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.set(key, { body, expiresAt: Date.now() + ttlMs });
      }
      return originalJson(body);
    };
    next();
  };
}
