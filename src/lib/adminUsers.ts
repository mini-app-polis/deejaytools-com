import { EVENT_STAFF_ROLES } from "@/lib/eventRoles";
import type { ApiAdminUser, EventStaffRole } from "@/schemas";

/**
 * The admin Users table: grouping each user's per-event staff roles by event,
 * and sorting the table by any of its columns.
 */

/** One event's staff roles for a user: "The Open: DJ, Event manager". */
export type EventRoles = { eventId: string; eventName: string; roles: EventStaffRole[] };

/**
 * A user's staff roles grouped by event, in the order the API gives them
 * (newest event first), each event's roles least to richest.
 */
export function rolesByEvent(user: Pick<ApiAdminUser, "staff_roles">): EventRoles[] {
  const byEvent = new Map<string, EventRoles>();
  for (const r of user.staff_roles) {
    const entry = byEvent.get(r.event_id) ?? { eventId: r.event_id, eventName: r.event_name, roles: [] };
    if (!entry.roles.includes(r.role)) entry.roles.push(r.role);
    byEvent.set(r.event_id, entry);
  }
  for (const entry of byEvent.values()) {
    entry.roles.sort((a, b) => EVENT_STAFF_ROLES.indexOf(a) - EVENT_STAFF_ROLES.indexOf(b));
  }
  return [...byEvent.values()];
}

export type UserSortKey =
  | "joined"
  | "name"
  | "email"
  | "roles"
  | "song_count"
  | "partner_count"
  | "event_count"
  | "managed_partnership_count"
  | "team_count";

export type SortDirection = "asc" | "desc";
export type UserSort = { key: UserSortKey; direction: SortDirection };

/** The table's order before any column is picked: as the API lists them, oldest account first. */
export const DEFAULT_USER_SORT: UserSort = { key: "joined", direction: "asc" };

/** The direction a column sorts in when first picked: counts and roles most first, text A to Z. */
export function firstDirection(key: UserSortKey): SortDirection {
  return key === "name" || key === "email" || key === "joined" ? "asc" : "desc";
}

/** Picking a column: the same column flips its direction; another starts at its first direction. */
export function nextUserSort(current: UserSort, key: UserSortKey): UserSort {
  if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: firstDirection(key) };
}

export function fullName(user: Pick<ApiAdminUser, "first_name" | "last_name">): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
}

/**
 * How much a user can do, for sorting by Roles: an admin above everyone,
 * then by their richest staff role on any event, then by how many events
 * they are on the staff of.
 */
function rolesWeight(user: ApiAdminUser): number {
  const richest = Math.max(0, ...user.staff_roles.map((r) => EVENT_STAFF_ROLES.indexOf(r.role) + 1));
  const events = new Set(user.staff_roles.map((r) => r.event_id)).size;
  return (user.role === "admin" ? 10_000 : 0) + richest * 1_000 + events;
}

const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

function compareBy(key: UserSortKey, a: ApiAdminUser, b: ApiAdminUser): number {
  switch (key) {
    case "joined":
      return a.created_at - b.created_at;
    case "name": {
      // Users with no name sort after everyone named, whichever way round.
      const an = fullName(a);
      const bn = fullName(b);
      if (!an || !bn) return 0;
      return text(an, bn);
    }
    case "email":
      return text(a.email, b.email);
    case "roles":
      return rolesWeight(a) - rolesWeight(b);
    default:
      return a[key] - b[key];
  }
}

/**
 * `users` in `sort`'s order, a new array. Ties keep the oldest account
 * first, so the order is stable from one refresh to the next. With
 * "name", users with no name go last in either direction.
 */
export function sortUsers(users: readonly ApiAdminUser[], sort: UserSort): ApiAdminUser[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...users].sort((a, b) => {
    if (sort.key === "name") {
      const missing = Number(!fullName(a)) - Number(!fullName(b));
      if (missing !== 0) return missing;
    }
    return sign * compareBy(sort.key, a, b) || a.created_at - b.created_at || text(a.id, b.id);
  });
}
