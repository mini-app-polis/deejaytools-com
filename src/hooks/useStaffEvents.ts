import { useMemo } from "react";
import type { ApiEvent, ApiEventRole, EventStaffRole } from "@/schemas";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import { staffEventsOf } from "@/lib/eventRoles";

export type StaffEvent = {
  eventId: string;
  /** The richest role the caller holds on the event: the portal it opens. */
  role: EventStaffRole;
  /** The event itself, or null until the events list loads (or when it is gone). */
  event: ApiEvent | null;
};

/**
 * The events the caller is on the staff of, each with the role whose portal
 * it opens, joined to the public events list for names and dates.
 *
 * Fetches nothing for a caller with no event roles. If the events list fails
 * to load, every staff event is still listed, without its event, and `error`
 * says why — a failure never hides the caller's portals.
 */
export function useStaffEvents(eventRoles: readonly ApiEventRole[]) {
  const staff = useMemo(() => staffEventsOf(eventRoles), [eventRoles]);
  const hasRoles = staff.length > 0;
  // The events list is shared with every other screen that reads it; an
  // event change invalidates it there.
  const eventsQuery = useEndpointQuery(endpoints.events.list, { enabled: hasRoles });
  const events = eventsQuery.data ?? null;

  const items = useMemo<StaffEvent[]>(() => {
    const byId = new Map((events ?? []).map((e) => [e.id, e]));
    return (
      staff
        .map((s) => ({ eventId: s.event_id, role: s.role, event: byId.get(s.event_id) ?? null }))
        // Once the list is in, an event missing from it (deleted since the
        // roles were read) has no portal to open.
        .filter((s) => events === null || s.event !== null)
    );
  }, [staff, events]);

  return {
    items,
    loading: hasRoles && eventsQuery.isLoading,
    error: hasRoles && !events ? eventsQuery.error : null,
    retry: () => void eventsQuery.refetch(),
  };
}
