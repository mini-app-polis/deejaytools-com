import { useEffect, useState } from "react";
import type { ApiDivisions } from "@/schemas";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";

type ApiClient = ReturnType<typeof useApiClient>;

export type DivisionList = {
  /** The divisions in their display groups, in order; empty until loaded. */
  groups: readonly (readonly string[])[];
  /** Every division in display order; empty until loaded. */
  divisions: readonly string[];
  loading: boolean;
  /** Set when the list could not be loaded. */
  error: string | null;
};

// Stable empty values, so callers that memoise on them do not recompute.
const NO_GROUPS: readonly (readonly string[])[] = [];
const NO_DIVISIONS: readonly string[] = [];

// One fetch per page load, shared by every caller. The list is public and the
// same for everyone, so it is safe to read before sign-in. A failed load is
// forgotten, so the next caller tries again.
let pending: Promise<ApiDivisions> | null = null;
let loaded: ApiDivisions | null = null;

function loadDivisions(api: ApiClient): Promise<ApiDivisions> {
  if (!pending) {
    pending = call(api, endpoints.divisions.list).then(
      (list) => {
        loaded = list;
        return list;
      },
      (e: unknown) => {
        pending = null;
        throw e;
      }
    );
  }
  return pending;
}

/** Forgets the shared list. For tests only. */
export function resetDivisionsCache(): void {
  pending = null;
  loaded = null;
}

/** The competition divisions, read from GET /v1/divisions. */
export function useDivisions(): DivisionList {
  const api = useApiClient();
  const [list, setList] = useState<ApiDivisions | null>(loaded);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (list) return;
    let cancelled = false;
    loadDivisions(api)
      .then((l) => {
        if (!cancelled) setList(l);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the divisions");
      });
    return () => {
      cancelled = true;
    };
  }, [api, list]);

  return {
    groups: list?.groups ?? NO_GROUPS,
    divisions: list?.divisions ?? NO_DIVISIONS,
    loading: list === null && error === null,
    error,
  };
}
