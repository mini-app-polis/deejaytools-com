/**
 * Fixed-window rate limiter middleware for Hono.
 *
 * Each unique key gets its own counter that resets after `windowMs`.
 * Suitable for single-instance deployments; does not persist across
 * restarts or share state between multiple instances.
 *
 * Usage:
 *   app.use("*", rateLimitMiddleware(300, 60_000));   // 300 req / min per IP
 */

import { error } from "common-typescript-utils";
import type { Context, MiddlewareHandler, Next } from "hono";

type WindowEntry = { count: number; windowStart: number };

/**
 * @param limit     Max requests allowed per window.
 * @param windowMs  Window duration in milliseconds.
 * @param keyFn     Derives the bucket key from the request context.
 *                  Defaults to the best available client IP.
 */
export function rateLimitMiddleware(
  limit: number,
  windowMs: number,
  keyFn?: (c: Context) => string
): MiddlewareHandler {
  const windows = new Map<string, WindowEntry>();

  // Sweep expired windows periodically so memory stays bounded.
  const pruneInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, entry] of windows) {
      if (entry.windowStart < cutoff) windows.delete(key);
    }
  }, Math.max(windowMs, 10_000));
  pruneInterval.unref?.();

  const resolveKey =
    keyFn ??
    ((c: Context) =>
      // Respect Railway / Cloudflare proxy headers; fall back to raw IP.
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown");

  return async (c: Context, next: Next) => {
    const key = resolveKey(c);
    const now = Date.now();
    const entry = windows.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      windows.set(key, { count: 1, windowStart: now });
    } else if (entry.count >= limit) {
      const retryAfterSec = Math.ceil(
        (entry.windowStart + windowMs - now) / 1_000
      );
      c.header("Retry-After", String(retryAfterSec));
      return c.json(
        error("too_many_requests", "Rate limit exceeded. Please slow down."),
        429
      );
    } else {
      entry.count += 1;
    }

    await next();
  };
}
