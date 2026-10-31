import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { ApiAuthMe, ApiEventRole } from "@/schemas";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
import { waitForAuthSync } from "@/lib/authSyncStatus";

/** Re-exported alias so callers can import `AuthMe` from this module. */
export type AuthMe = ApiAuthMe;

type ApiClient = ReturnType<typeof useApiClient>;

// One shared empty list, so callers that depend on eventRoles see a stable value.
const NO_EVENT_ROLES: ApiEventRole[] = [];

// Stands in for the Clerk user id when Clerk does not report one.
const SIGNED_IN = "signed-in";

// ---------------------------------------------------------------------------
// The shared record. Every useAuthMe caller (the nav bar, the guards, the
// pages) reads this one store, so GET /v1/auth/me is fetched once per page
// load however many are mounted, a failure is reported once, and reload()
// updates them all.
// ---------------------------------------------------------------------------

type AuthMeState = {
  /** Whose record this is: the Clerk user id, or null when signed out. */
  owner: string | null;
  me: ApiAuthMe | null;
  /** True while a request is out and there is no record to show yet. */
  loading: boolean;
  /** Why the last request failed; null once one succeeds. */
  error: string | null;
};

const SIGNED_OUT: AuthMeState = { owner: null, me: null, loading: false, error: null };

let state: AuthMeState = SIGNED_OUT;
const listeners = new Set<() => void>();
// Only the newest request may write its answer: an older one finishing late
// (a reload overtaking the first load) must not overwrite it.
let latestRequest = 0;

function setState(next: AuthMeState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getState(): AuthMeState {
  return state;
}

function isNotSynced(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "USER_NOT_SYNCED";
}

/**
 * GET /v1/auth/me. On a brand-new account it can arrive before AuthSync has
 * created the users row and answer USER_NOT_SYNCED; then it waits for the
 * sync to settle and asks once more.
 */
async function fetchMe(api: ApiClient): Promise<ApiAuthMe> {
  try {
    return await call(api, endpoints.auth.me);
  } catch (e) {
    if (!isNotSynced(e)) throw e;
    await waitForAuthSync();
    return call(api, endpoints.auth.me);
  }
}

function request(api: ApiClient, owner: string): Promise<void> {
  const id = ++latestRequest;
  const kept = state.owner === owner ? state.me : null;
  setState({ owner, me: kept, loading: kept === null, error: null });
  return fetchMe(api).then(
    (me) => {
      if (id !== latestRequest) return;
      setState({ owner, me, loading: false, error: null });
    },
    (e: unknown) => {
      if (id !== latestRequest) return;
      const message = e instanceof Error ? e.message : "Failed to load profile";
      toast.error(message);
      setState({ owner, me: state.owner === owner ? state.me : null, loading: false, error: message });
    }
  );
}

/** Loads the record for `owner` unless it is already loaded, loading or failed. */
function ensureLoaded(api: ApiClient, owner: string): void {
  if (state.owner === owner) return;
  void request(api, owner);
}

function clear(): void {
  latestRequest++;
  if (state !== SIGNED_OUT) setState(SIGNED_OUT);
}

/** Forgets the shared record. For tests only. */
export function resetAuthMeCache(): void {
  latestRequest++;
  state = SIGNED_OUT;
}

/**
 * The signed-in caller's users row from GET /v1/auth/me, shared by every
 * caller.
 *
 * `loading` is true until the first answer (or while signed-in state is
 * unknown); after a failure it is false and `error` says why, so a guard can
 * offer `reload()` instead of waiting forever. Call `reload()` after a change
 * that affects the caller's record — their profile, their event roles, an
 * event they are staff of — and every caller updates.
 */
export function useAuthMe() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const api = useApiClient();
  const shared = useSyncExternalStore(subscribe, getState, getState);
  const owner = isLoaded && isSignedIn ? (userId ?? SIGNED_IN) : null;

  useEffect(() => {
    if (!isLoaded) return;
    if (owner === null) clear();
    else ensureLoaded(api, owner);
  }, [api, isLoaded, owner]);

  const reload = useCallback(async () => {
    if (owner !== null) await request(api, owner);
  }, [api, owner]);

  // Until the effect has started this owner's load, the store may still hold
  // nothing, or a previous account's record: neither is this caller's.
  const current = owner !== null && shared.owner === owner;
  const me = current ? shared.me : null;

  return {
    me,
    loading: !isLoaded || (owner !== null && (!current || shared.loading)),
    error: current ? shared.error : null,
    reload,
    isAdmin: me?.role === "admin",
    /** The caller's per-event staff roles; empty when none or signed out. */
    eventRoles: me?.event_roles ?? NO_EVENT_ROLES,
  };
}
