import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";
import { ContractViolation } from "./contract";

/** How many times a failed query is tried again before its error is shown. */
const MAX_RETRIES = 2;

/**
 * Whether a failed query is worth trying again. A 4xx (validation, auth,
 * not-found) and a response that broke its contract will answer the same way
 * on a retry; a network error or a 5xx may not.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
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
        // Long enough that screens reading the same list on one visit share
        // one request; short enough that coming back later refetches.
        staleTime: 30_000,
      },
    },
  });
}

export const queryClient = createQueryClient();
