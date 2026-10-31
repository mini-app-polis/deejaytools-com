import { useEffect, useState } from "react";
import { bareJsonTransport } from "@/api/bareTransport";
import { call, endpoints } from "@/api/endpoints";
import type { ApiVersion } from "@/schemas";

const base = import.meta.env.VITE_API_URL ?? "";

/**
 * The API's version, fetched once from `GET /version` (public, unversioned,
 * not in the envelope) and checked against its contract schema. Null while
 * loading and whenever it cannot be read — an API without the route, a
 * network error, a non-JSON answer, a body that breaks the contract — so the
 * nav simply leaves it out rather than showing an error.
 */
export function useApiVersion(): ApiVersion | null {
  const [apiVersion, setApiVersion] = useState<ApiVersion | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const v = await call(bareJsonTransport(base, { signal: controller.signal }), endpoints.meta.version);
        // In report mode a contract mismatch comes back as received; show
        // only a version that is really there.
        if (typeof v?.version === "string" && v.version) {
          setApiVersion({ version: v.version, commit: typeof v.commit === "string" && v.commit ? v.commit : null });
        }
      } catch {
        // Unreachable, not JSON, or a contract violation: leave it out.
      }
    })();
    return () => controller.abort();
  }, []);

  return apiVersion;
}
