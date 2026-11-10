import { EVENT_STAFF_ROLES, richestEventRole } from "@/lib/eventRoles";
import { PORTAL_SECTION_LINKS, type PortalSectionLink } from "@/lib/portalSectionLinks";
import type { ApiEventRole, EventStaffRole } from "@/schemas";

/**
 * The staff pages: one page per portal section (`/staff/<slug>`), where the
 * caller picks one of the events they may open it for, as an admin picks an
 * event on an admin page.
 *
 * Imports only plain modules and types, so the navbar can link the pages
 * without loading them.
 */

/** A staff page's path, optionally on one event. */
export function staffPagePath(slug: string, eventId?: string): string {
  const path = `/staff/${encodeURIComponent(slug)}`;
  return eventId ? `${path}?event=${encodeURIComponent(eventId)}` : path;
}

/** True when `role`'s portal has the section `slug`. */
export function roleHasSection(role: EventStaffRole, slug: string): boolean {
  return PORTAL_SECTION_LINKS[role].some((s) => s.slug === slug);
}

/** Every staff page, in the richest portal's order. */
export const ALL_STAFF_PAGES: readonly PortalSectionLink[] = PORTAL_SECTION_LINKS["event-manager"];

/** The staff roles `roles` holds on any event, least to richest. */
export function rolesHeld(roles: readonly ApiEventRole[]): EventStaffRole[] {
  return EVENT_STAFF_ROLES.filter((role) => roles.some((r) => r.role === role));
}

/** The staff pages any role in `roles` opens, in the richest portal's order. */
export function staffPagesFor(roles: readonly ApiEventRole[]): PortalSectionLink[] {
  const held = rolesHeld(roles);
  return ALL_STAFF_PAGES.filter((page) => held.some((role) => roleHasSection(role, page.slug)));
}

/** The events on which `roles` opens the staff page `slug`: each event's richest role has it. */
export function eventsForStaffPage(roles: readonly ApiEventRole[], slug: string): string[] {
  const ids = [...new Set(roles.map((r) => r.event_id))];
  return ids.filter((id) => {
    const role = richestEventRole(roles, id);
    return role !== null && roleHasSection(role, slug);
  });
}
