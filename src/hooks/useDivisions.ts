import { useCallback } from "react";
import { useEndpointQuery } from "@/api/queries";
import { endpoints } from "@/api/endpoints";

export type DivisionList = {
  /** The divisions in their display groups, in order; empty until loaded. */
  groups: readonly (readonly string[])[];
  /** Every division in display order; empty until loaded. */
  divisions: readonly string[];
  loading: boolean;
  /** Set when the list could not be loaded. */
  error: string | null;
  /** Tries the load again after a failure. */
  retry: () => void;
};

// Stable empty values, so callers that memoise on them do not recompute.
const NO_GROUPS: readonly (readonly string[])[] = [];
const NO_DIVISIONS: readonly string[] = [];

/**
 * The competition divisions, read from GET /v1/divisions through the shared
 * query client: one fetch per page load, shared by every caller. The list is
 * public and the same for everyone, so it is safe to read before sign-in. A
 * failed load is not kept, so the next caller to mount tries again.
 */
export function useDivisions(): DivisionList {
  const { data, error, isFetching, refetch } = useEndpointQuery(endpoints.divisions.list, { staleTime: Infinity });

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const failed = error !== null && !isFetching;
  return {
    groups: data?.groups ?? NO_GROUPS,
    divisions: data?.divisions ?? NO_DIVISIONS,
    loading: data === undefined && !failed,
    error: failed ? error.message || "Could not load the divisions" : null,
    retry,
  };
}
