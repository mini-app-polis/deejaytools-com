/**
 * Process-local TTL cache for hot read-only responses.
 *
 * Designed for single-instance deployments (Railway). Stores typed values
 * directly — no JSON round-trip overhead — so callers get back the exact
 * shape they put in. Because cached entries are shared, callers must treat
 * them as read-only (don't mutate a value returned from `get`).
 *
 * A background interval sweeps expired entries every 30 s so memory stays
 * bounded even if `invalidatePrefix` is never called.
 */

type CacheEntry<T> = { data: T; expiresAt: number };

export class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly pruneInterval: ReturnType<typeof setInterval>;

  constructor(pruneIntervalMs = 30_000) {
    this.pruneInterval = setInterval(() => this.prune(), pruneIntervalMs);
    // Don't hold the event-loop open just for housekeeping.
    this.pruneInterval.unref?.();
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  /** Remove all entries whose key starts with `prefix`. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

/** Singleton cache shared across all route modules. */
export const responseCache = new TtlCache();

/**
 * TTLs (ms) used by endpoint category.
 *
 * Queue entries: short so that position changes feel responsive to dancers.
 * Session base data: slightly longer — heavier query, changes less often.
 */
export const CACHE_TTL = {
  QUEUE: 3_000,
  SESSION: 5_000,
} as const;
