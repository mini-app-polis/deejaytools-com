import { useQuery } from "@tanstack/react-query";
import { bareJsonTransport } from "@/api/bareTransport";
import { call, endpoints } from "@/api/endpoints";
import { queryKey } from "@/api/queryKeys";
import type { ApiVersion } from "@/schemas";

const base = import.meta.env.VITE_API_URL ?? "";

/** GET /version, or null when it cannot be read. Never throws. */
async function fetchVersion(signal: AbortSignal): Promise<ApiVersion | null> {
  try {
    const v = await call(bareJsonTransport(base, { signal }), endpoints.meta.version);
    // In report mode a contract mismatch comes back as received; show
    // only a version that is really there.
    if (typeof v?.version === "string" && v.version) {
      return { version: v.version, commit: typeof v.commit === "string" && v.commit ? v.commit : null };
    }
  } catch {
    // Unreachable, not JSON, or a contract violation: leave it out.
  }
  return null;
}

/**
 * The API's version, fetched once per page load from `GET /version` (public,
 * unversioned, not in the envelope) through the shared query client, and
 * checked against its contract schema. Null while loading and whenever it
 * cannot be read — an API without the route, a network error, a non-JSON
 * answer, a body that breaks the contract — so the nav simply leaves it out
 * rather than showing an error.
 */
export function useApiVersion(): ApiVersion | null {
  const { data } = useQuery({
    queryKey: queryKey(endpoints.meta.version),
    queryFn: ({ signal }) => fetchVersion(signal),
    staleTime: Infinity,
  });
  return data ?? null;
}
