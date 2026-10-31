import { useState } from "react";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import type { ApiQueueEntry } from "@/schemas";

/** How often a staff live queue refreshes on its own while a session is open. */
export const LIVE_QUEUE_POLL_MS = 8000;

// Stable empty lists while a queue has not loaded.
const NO_ENTRIES: readonly ApiQueueEntry[] = [];

/**
 * A session's three queues for its staff — the active slots (with check-in
 * notes) and both waiting queues — polled every LIVE_QUEUE_POLL_MS while
 * `sessionId` is set. A background refresh never brings a skeleton back;
 * `refreshFailed` says when the last one failed, so the screen can say its
 * queues may be out of date. A refresh someone asked for says why it failed.
 */
export function useLiveQueues(sessionId: string) {
  const options = { params: { sessionId }, enabled: !!sessionId, refetchInterval: LIVE_QUEUE_POLL_MS };
  const activeQuery = useEndpointQuery(endpoints.queue.activeStaff, options);
  const priorityQuery = useEndpointQuery(endpoints.queue.priority, options);
  const nonPriorityQuery = useEndpointQuery(endpoints.queue.nonPriority, options);
  const queries = [activeQuery, priorityQuery, nonPriorityQuery];
  const [refreshing, setRefreshing] = useState(false);

  const loaded = queries.every((q) => q.data !== undefined);
  const error = queries.find((q) => q.error)?.error ?? null;
  return {
    active: activeQuery.data ?? NO_ENTRIES,
    priority: priorityQuery.data ?? NO_ENTRIES,
    nonPriority: nonPriorityQuery.data ?? NO_ENTRIES,
    /** The first load, or a refresh asked for with `refresh`. */
    loading: queries.some((q) => q.isLoading) || refreshing,
    /** When all three queues were last loaded; null until they have been. */
    updatedAt: loaded ? Math.min(...queries.map((q) => q.dataUpdatedAt)) : null,
    refreshFailed: error !== null,
    /** Set when a queue failed and none of its entries have loaded. */
    loadError: loaded ? null : error,
    refresh: async () => {
      setRefreshing(true);
      try {
        const results = await Promise.all(queries.map((q) => q.refetch()));
        const failed = results.find((r) => r.error)?.error;
        if (failed) toast.error(failed.message);
      } finally {
        setRefreshing(false);
      }
    },
  };
}
