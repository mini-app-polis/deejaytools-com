import { useAuth } from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import type { ApiAuthMe, ApiEventRole } from "@/schemas";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
import { queryKey } from "@/api/queryKeys";
import { waitForAuthSync } from "@/lib/authSyncStatus";

/** Re-exported alias so callers can import `AuthMe` from this module. */
export type AuthMe = ApiAuthMe;

type ApiClient = ReturnType<typeof useApiClient>;

// One shared empty list, so callers that depend on eventRoles see a stable value.
const NO_EVENT_ROLES: ApiEventRole[] = [];

// Stands in for the Clerk user id when Clerk does not report one.
const SIGNED_IN = "signed-in";

function isNotSynced(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "USER_NOT_SYNCED";
}

/**
 * GET /v1/auth/me. On a brand-new account it can arrive before AuthSync has
 * created the users row and answer USER_NOT_SYNCED; then it waits for the
 * sync to settle and asks once more. A failure is toasted here, once per
 * request however many callers share it.
 */
async function fetchMe(api: ApiClient): Promise<ApiAuthMe> {
  try {
    try {
      return await call(api, endpoints.auth.me);
    } catch (e) {
      if (!isNotSynced(e)) throw e;
      await waitForAuthSync();
      return await call(api, endpoints.auth.me);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load profile";
    toast.error(message);
    throw e instanceof Error ? e : new Error(message);
  }
}

/**
 * The signed-in caller's GET /v1/auth/me as a query on the shared client,
 * keyed `["auth.me", userId]` so one account's record is never shown to
 * another. Disabled while signed out (and when `enabled` is false). Fetched
 * once per page load: it is refetched only when invalidated, which every
 * change to the caller's profile or event roles does through the prefix
 * `queryKey(endpoints.auth.me)`. Not retried, so a failure is toasted once.
 */
export function useAuthMeQuery({ enabled = true }: { enabled?: boolean } = {}) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const api = useApiClient();
  const owner = isLoaded && isSignedIn ? (userId ?? SIGNED_IN) : null;
  const query = useQuery<ApiAuthMe, Error>({
    queryKey: queryKey(endpoints.auth.me, undefined, owner ?? undefined),
    queryFn: () => fetchMe(api),
    enabled: owner !== null && enabled,
    staleTime: Infinity,
    retry: false,
    // A caller mounted after a failure shows it (with its retry) rather than
    // asking again on its own.
    retryOnMount: false,
  });
  return { ...query, isLoaded, owner };
}

/**
 * The signed-in caller's users row from GET /v1/auth/me, shared by every
 * caller.
 *
 * `loading` is true until the first answer (or while signed-in state is
 * unknown); after a failure it is false and `error` says why, so a guard can
 * offer `reload()` instead of waiting forever. A mutation that changes the
 * caller's record lists `endpoints.auth.me` in its `invalidates`; `reload()`
 * does the same by hand, and every caller updates.
 */
export function useAuthMe() {
  const client = useQueryClient();
  const { data, error, isPending, isFetching, isLoaded, owner } = useAuthMeQuery();

  const reload = useCallback(async () => {
    if (owner !== null) await client.invalidateQueries({ queryKey: queryKey(endpoints.auth.me) });
  }, [client, owner]);

  const me = owner !== null ? (data ?? null) : null;

  return {
    me,
    loading: !isLoaded || (owner !== null && (isPending || (isFetching && me === null))),
    // A retry in flight is not yet a failure.
    error: owner !== null && error && !isFetching ? error.message : null,
    reload,
    isAdmin: me?.role === "admin",
    /** The caller's per-event staff roles; empty when none or signed out. */
    eventRoles: me?.event_roles ?? NO_EVENT_ROLES,
  };
}
