import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { ContractViolation } from "./contract";

/** How many times a failed query is tried again before its error is shown. */
const MAX_RETRIES = 2;

/** Retries for a 429 or 503, which the server sends to say "later", not "no". */
const MAX_THROTTLE_RETRIES = 4;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;
/** The longest a Retry-After is honoured, so one odd header can't park a query. */
const RETRY_AFTER_CAP_MS = 60_000;

function isThrottle(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 429 || error.status === 503);
}

/**
 * How many times, and how often, a query that answered USER_NOT_SYNCED is
 * tried again: on a brand-new account the first reads can arrive before
 * AuthSync has created the users row, which happens within moments.
 */
const MAX_NOT_SYNCED_RETRIES = 5;
const NOT_SYNCED_RETRY_DELAY_MS = 1_000;

function isNotSynced(error: unknown): boolean {
  return error instanceof ApiError && error.code === "USER_NOT_SYNCED";
}

/**
 * Whether a failed query is worth trying again. A 4xx (validation, auth,
 * not-found) and a response that broke its contract will answer the same way
 * on a retry; a network error or a 5xx may not. The exceptions are
 * USER_NOT_SYNCED, which clears once the first account sync lands, and a 429
 * or 503, the server asking to come back later, which gets more tries.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isNotSynced(error)) return failureCount < MAX_NOT_SYNCED_RETRIES;
  if (isThrottle(error)) return failureCount < MAX_THROTTLE_RETRIES;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  if (error instanceof ContractViolation) return false;
  return failureCount < MAX_RETRIES;
}

/**
 * How long to wait before retry number `failureCount`. USER_NOT_SYNCED waits a
 * fixed short delay, since the sync lands within moments. Otherwise: exponential backoff, at
 * least the server's Retry-After, plus up to a second of jitter so clients that
 * were refused together don't come back together.
 */
export function retryDelay(failureCount: number, error: unknown): number {
  if (isNotSynced(error)) return NOT_SYNCED_RETRY_DELAY_MS;
  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** failureCount, BACKOFF_CAP_MS);
  const asked = isThrottle(error) ? Math.min(error.retryAfterMs ?? 0, RETRY_AFTER_CAP_MS) : 0;
  return Math.max(backoff, asked) + Math.random() * BACKOFF_BASE_MS;
}

/**
 * Server state for the whole app (ADR-0003): one client, created once and
 * provided in `main.tsx`, so every route and guard shares one cache.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        // Long enough that screens reading the same list on one visit share
        // one request; short enough that coming back later refetches.
        staleTime: 30_000,
      },
    },
  });
}

export const queryClient = createQueryClient();
