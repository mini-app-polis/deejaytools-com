import { useMemo } from "react";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import { eventPagePath, eventSlugs } from "@/lib/eventSlug";

/**
 * Every event's readable slug (lib/eventSlug), from the public event list
 * the events pages already load, and a path builder that uses them. Until
 * the list loads, `pathFor` links by id, which still opens the event.
 */
export function useEventSlugs() {
  const eventsQuery = useEndpointQuery(endpoints.events.list);
  const events = eventsQuery.data;
  const slugs = useMemo(() => (events ? eventSlugs(events) : null), [events]);
  const pathFor = useMemo(
    () => (eventId: string) => eventPagePath(eventId, slugs ?? undefined),
    [slugs]
  );
  return { slugs, pathFor, loading: eventsQuery.isLoading, error: eventsQuery.error };
}
