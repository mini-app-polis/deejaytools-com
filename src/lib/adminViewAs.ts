import { eventPortalPath, EVENT_STAFF_ROLES } from "@/lib/eventRoles";
import { PORTAL_SECTION_LINKS } from "@/lib/portalSectionLinks";
import type { EventStaffRole } from "@/schemas";

/**
 * The staff portal section that is each admin page's lesser-permission
 * version, by the admin page's path. Admin pages with none (users, the song
 * library, test check-ins, the guide) are not listed.
 */
const STAFF_VERSION: Record<string, string> = {
  "/admin/registrations": "registrations",
  "/manager/event-songs": "submissions",
  "/manager/active-sessions": "queue",
  "/admin/sessions": "sessions",
  "/admin/runs": "runs",
  "/manager/upload-for": "upload-for",
  "/manager/checkin-for": "checkin-for",
  "/admin/events": "event",
};

export type ViewAsLink = { role: EventStaffRole; to: string };

/**
 * For an admin on `pathname`: the same page as each staff role that has it
 * sees it on `eventId`, least role first. Empty when the page has no staff
 * version.
 */
export function viewAsLinks(pathname: string, eventId: string): ViewAsLink[] {
  const slug = STAFF_VERSION[pathname.replace(/\/+$/, "")];
  if (!slug) return [];
  return EVENT_STAFF_ROLES.filter((role) => PORTAL_SECTION_LINKS[role].some((s) => s.slug === slug)).map((role) => ({
    role,
    to: `${eventPortalPath(eventId, role)}/${slug}`,
  }));
}

/** Whether `pathname` is an admin page with a staff version. */
export function hasStaffVersion(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") in STAFF_VERSION;
}

/** The portal path segment of each staff role, and back. */
const SEGMENT_ROLE: Record<string, EventStaffRole> = {
  coordinator: "coordinator",
  dj: "dj",
  manage: "event-manager",
};

export type EventViewAs = {
  eventId: string;
  /** The role whose portal is open, when on one. */
  current: EventStaffRole | null;
  links: ViewAsLink[];
};

/**
 * For an admin on an event's page (`/events/:id`) or in one of its portals
 * (`/events/:id/<portal>[/<section>]`): that event as each staff role sees
 * it. From a portal section, a role that has the same section opens it;
 * one that does not opens its portal. Null on any other page.
 */
export function eventViewAs(pathname: string): EventViewAs | null {
  const path = pathname.replace(/\/+$/, "");
  const page = /^\/events\/([^/]+)$/.exec(path);
  const portal = /^\/events\/([^/]+)\/(coordinator|dj|manage)(?:\/([^/]+))?$/.exec(path);
  if (!page && !portal) return null;
  const eventId = decodeURIComponent((page ?? portal)![1]);
  const current = portal ? SEGMENT_ROLE[portal[2]] : null;
  const section = portal?.[3];
  return {
    eventId,
    current,
    links: EVENT_STAFF_ROLES.map((role) => {
      const base = eventPortalPath(eventId, role);
      const has = section && PORTAL_SECTION_LINKS[role].some((s) => s.slug === section);
      return { role, to: has ? `${base}/${section}` : base };
    }),
  };
}
