/**
 * Fixed-deadline request timeout middleware for Hono.
 *
 * Races the downstream handler against a timer. If the handler has not
 * resolved within `timeoutMs` milliseconds the middleware returns a 503 with
 * a `request_timeout` error code and the in-flight handler promise continues
 * in the background (JS promises are not cancellable).
 *
 * Usage:
 *   app.use("/v1/*", timeoutMiddleware(10_000)); // 10 s hard deadline
 */

import { error } from "common-typescript-utils";
import type { Context, MiddlewareHandler, Next } from "hono";

/**
 * Sentinel error class used internally so the catch block can distinguish
 * a deadline expiry from a genuine handler error.
 */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * @param timeoutMs  Maximum milliseconds a handler may run before a 503 is
 *                   returned to the client.
 */
export function timeoutMiddleware(timeoutMs: number): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
    });

    try {
      await Promise.race([next(), deadline]);
    } catch (err) {
      if (err instanceof TimeoutError) {
        return c.json(
          error("request_timeout", `Request timed out after ${timeoutMs}ms`),
          503
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}
