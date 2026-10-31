import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useApiClient } from "./client";
import { call, type CallArgs, type Endpoint } from "./endpoints";
import { queryKey, type KeyedEndpoint } from "./queryKeys";

type QueryOptions<R> = Omit<UseQueryOptions<R, Error>, "queryKey" | "queryFn">;

// Params are required exactly when the endpoint's params type does not allow
// `void` — the same rule `call()` uses.
export type EndpointQueryArgs<P, R> = [void] extends [P]
  ? [opts?: { params?: P } & QueryOptions<R>]
  : [opts: { params: P } & QueryOptions<R>];

/**
 * Read an endpoint through the shared query cache. The key comes from
 * `queryKey()` and the request from `call()`, so the response is validated
 * against the catalog's schema like any other call.
 */
export function useEndpointQuery<P, R>(ep: Endpoint<P, void, R>, ...args: EndpointQueryArgs<P, R>) {
  const api = useApiClient();
  const { params, ...options } = (args[0] ?? {}) as { params?: P } & QueryOptions<R>;
  return useQuery<R, Error>({
    ...options,
    queryKey: queryKey(ep, params),
    queryFn: () => call(api, ep, ...([{ params }] as CallArgs<P, void>)),
  });
}

/** What a mutation is called with: the same `{ params, body }` `call()` takes. */
export type EndpointVariables<P, B> = CallArgs<P, B>[0];

type MutationOptions<P, B, R> = Omit<
  UseMutationOptions<R, Error, EndpointVariables<P, B>>,
  "mutationFn"
> & {
  /** Endpoints whose cached reads this mutation changes; invalidated on success. */
  invalidates?: readonly KeyedEndpoint<never>[];
};

/**
 * Change something through an endpoint. On success every query of the
 * endpoints listed in `invalidates` is refetched, whatever its params.
 */
export function useEndpointMutation<P, B, R>(ep: Endpoint<P, B, R>, options: MutationOptions<P, B, R> = {}) {
  const api = useApiClient();
  const client = useQueryClient();
  const { invalidates = [], onSuccess, ...rest } = options;
  return useMutation<R, Error, EndpointVariables<P, B>>({
    ...rest,
    mutationFn: (variables) => call(api, ep, ...([variables] as CallArgs<P, B>)),
    onSuccess: async (...successArgs) => {
      await Promise.all(invalidates.map((e) => client.invalidateQueries({ queryKey: queryKey(e) })));
      await onSuccess?.(...successArgs);
    },
  });
}
