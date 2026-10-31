import type { Transport } from "./endpoints";

/** A response from a bare transport that was not 2xx. */
export class BareStatusError extends Error {
  constructor(readonly status: number) {
    super(`Request failed: ${status}`);
    this.name = "BareStatusError";
  }
}

/**
 * A GET-only transport for the endpoints declared `envelope: false`: it
 * returns the JSON body as it is, unauthenticated, where the API client
 * unwraps `{data}` and sends the Clerk token. Pass it to `call()`, which
 * validates the body against the endpoint's schema.
 */
export function bareJsonTransport(baseUrl: string, init: { signal?: AbortSignal } = {}): Transport {
  const unsupported = (): never => {
    throw new Error("bareJsonTransport supports GET only");
  };
  return {
    get: async <T>(path: string): Promise<T> => {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { Accept: "application/json" },
        signal: init.signal,
      });
      if (!res.ok) throw new BareStatusError(res.status);
      return (await res.json()) as T;
    },
    post: async () => unsupported(),
    patch: async () => unsupported(),
    put: async () => unsupported(),
    del: async () => unsupported(),
  };
}
