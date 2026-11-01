import type { QueryKey } from "@tanstack/react-query";
import type { Endpoint } from "./endpoints";

/** The part of an endpoint a key is built from. */
export type KeyedEndpoint<P> = Pick<Endpoint<P, unknown, unknown>, "id" | "path">;

/**
 * The query key for an endpoint: `[endpoint.id]`, or `[endpoint.id, params]`
 * when the call has params. Keys are only ever built here, from the catalog,
 * so invalidating `queryKey(endpoints.sessions.list)` refreshes every variant
 * of that list (TanStack matches keys by prefix).
 *
 * `scope` names whose answer it is, for a read that answers differently per
 * signed-in user with the same params (`["auth.me", userId]`). It goes right
 * after the id, so `queryKey(ep)` still covers every scope.
 */
export function queryKey<P>(ep: KeyedEndpoint<P>, params?: P, scope?: string): QueryKey {
  const head = scope === undefined ? [ep.id] : [ep.id, scope];
  return params === undefined ? head : [...head, params];
}
