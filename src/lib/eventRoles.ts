import type { ApiEventRole, EventStaffRole } from "@/schemas";

/**
 * Per-event staff roles, ranked: each role can do everything the one before
 * it can, so a person holding several on one event gets the richest one's
 * portal, and a page that needs a role also admits the richer ones.
 */
const ROLE_RANK: Record<EventStaffRole, number> = {
  coordinator: 1,
  dj: 2,
  "event-manager": 3,
};

/** Every staff role, least to richest. */
export const EVENT_STAFF_ROLES: readonly EventStaffRole[] = ["coordinator", "dj", "event-manager"];

export const EVENT_ROLE_LABELS: Record<EventStaffRole, string> = {
  coordinator: "Coordinator",
  dj: "DJ",
  "event-manager": "Event manager",
};

/** The richest role `roles` holds on `eventId`, or null when it holds none. */
export function richestEventRole(roles: readonly ApiEventRole[], eventId: string): EventStaffRole | null {
  let best: EventStaffRole | null = null;
  for (const r of roles) {
    if (r.event_id !== eventId) continue;
    if (best === null || ROLE_RANK[r.role] > ROLE_RANK[best]) best = r.role;
  }
  return best;
}

/** True when `roles` holds `needed`, or a richer role, on `eventId`. */
export function holdsEventRole(
  roles: readonly ApiEventRole[],
  eventId: string,
  needed: EventStaffRole
): boolean {
  const best = richestEventRole(roles, eventId);
  return best !== null && ROLE_RANK[best] >= ROLE_RANK[needed];
}

/** Each event `roles` covers once, with its richest role, in first-seen order. */
export function staffEventsOf(roles: readonly ApiEventRole[]): ApiEventRole[] {
  const seen = new Set<string>();
  const out: ApiEventRole[] = [];
  for (const r of roles) {
    if (seen.has(r.event_id)) continue;
    seen.add(r.event_id);
    out.push({ event_id: r.event_id, role: richestEventRole(roles, r.event_id)! });
  }
  return out;
}

/** The portal a role opens on an event. */
export function eventPortalPath(eventId: string, role: EventStaffRole): string {
  const base = `/events/${encodeURIComponent(eventId)}`;
  switch (role) {
    case "coordinator":
      return `${base}/coordinator`;
    case "dj":
      return `${base}/dj`;
    case "event-manager":
      return `${base}/manage`;
  }
}

/**
 * The staff roles that change an event's sessions (create, edit, status,
 * divisions, delete) on it. Not the DJ: not every DJ on an event works its
 * floor trials. An admin changes them on every event.
 */
export const SESSION_EDITOR_ROLES: readonly EventStaffRole[] = ["event-manager"];

/** The staff roles that change an event's registration list on it. Not the DJ, who reads it. */
export const REGISTRATION_EDITOR_ROLES: readonly EventStaffRole[] = ["coordinator", "event-manager"];

/**
 * True when `roles` holds one of `wanted` on `eventId`. Unlike
 * holdsEventRole, a richer role does not stand in for a lesser one: a DJ is
 * richer than a coordinator but does not change the registration list.
 */
export function holdsAnyRoleOn(
  roles: readonly ApiEventRole[],
  eventId: string,
  wanted: readonly EventStaffRole[]
): boolean {
  return roles.some((r) => r.event_id === eventId && wanted.includes(r.role));
}
