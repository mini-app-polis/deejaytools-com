import { useEffect, useState } from "react";

const base = import.meta.env.VITE_API_URL ?? "";

/** What the API's public `GET /version` reports about the running deploy. */
export type ApiVersion = {
  /** Package version; only moves when the API releases. */
  version: string;
  /** Commit the deploy was built from; null outside Railway. */
  commit: string | null;
};

function parse(body: unknown): ApiVersion | null {
  if (typeof body !== "object" || body === null) return null;
  const { version, commit } = body as Record<string, unknown>;
  if (typeof version !== "string" || !version) return null;
  return { version, commit: typeof commit === "string" && commit ? commit : null };
}

/**
 * The API's version, fetched once from `GET /version` (public, unversioned,
 * not in the envelope). Null while loading and whenever it cannot be read —
 * an API without the route, a network error, a non-JSON answer — so the nav
 * simply leaves it out rather than showing an error.
 */
export function useApiVersion(): ApiVersion | null {
  const [apiVersion, setApiVersion] = useState<ApiVersion | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${base}/version`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!res.ok) return;
        setApiVersion(parse(await res.json()));
      } catch {
        // Unreachable or not JSON: leave it out.
      }
    })();
    return () => controller.abort();
  }, []);

  return apiVersion;
}
