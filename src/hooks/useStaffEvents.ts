import { useEffect, useMemo, useState } from "react";
import type { ApiEvent, ApiEventRole, EventStaffRole } from "@/schemas";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
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
 * Fetches nothing for a caller with no event roles.
 */
export function useStaffEvents(eventRoles: readonly ApiEventRole[]) {
  const api = useApiClient();
  const staff = useMemo(() => staffEventsOf(eventRoles), [eventRoles]);
  const hasRoles = staff.length > 0;
  const [events, setEvents] = useState<ApiEvent[] | null>(null);

  useEffect(() => {
    if (!hasRoles) return;
    let cancelled = false;
    call(api, endpoints.events.list)
      .then((rows) => {
        if (!cancelled) setEvents(rows);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, hasRoles]);

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

  return { items, loading: hasRoles && events === null };
}
