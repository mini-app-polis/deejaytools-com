import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { ContractViolation } from "./contract";

/** How many times a failed query is tried again before its error is shown. */
const MAX_RETRIES = 2;

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
 * on a retry; a network error or a 5xx may not. The exception is
 * USER_NOT_SYNCED, which clears once the first account sync lands.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isNotSynced(error)) return failureCount < MAX_NOT_SYNCED_RETRIES;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  if (error instanceof ContractViolation) return false;
  return failureCount < MAX_RETRIES;
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
        retryDelay: (failureCount, error) =>
          isNotSynced(error) ? NOT_SYNCED_RETRY_DELAY_MS : Math.min(1000 * 2 ** failureCount, 30_000),
        // Long enough that screens reading the same list on one visit share
        // one request; short enough that coming back later refetches.
        staleTime: 30_000,
      },
    },
  });
}

export const queryClient = createQueryClient();
