import { eventPortalPath } from "@/lib/eventRoles";
import { PORTAL_SECTION_LINKS } from "@/lib/portalSectionLinks";
import type { ViewAs } from "@/lib/viewAs";

/**
 * Where an admin lands on starting (or switching) a view-as: the page that
 * role would see in place of the current one. `eventId` is the event to land
 * on when the current page is about none (the soonest, say); a page about an
 * event keeps its own.
 *
 * - An admin page with a staff version opens that section of the role's
 *   portal for the event (Registrations → its Registrations tab).
 * - A portal keeps its event, and its section where the role has it, else
 *   opens the role's portal; an event's page stays.
 * - Any other admin page, which the role cannot open, goes to the role's
 *   portal (a dancer: the event's page).
 * - Pages everyone sees stay as they are.
 */

/** The staff portal section that is each admin page's lesser-permission version. */
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

const PORTAL = /^\/events\/([^/]+)\/(coordinator|dj|manage)(?:\/([^/]+))?$/;
const EVENT_PAGE = /^\/events\/([^/]+)$/;

/** The event the current page is about, if it is an event's page or portal. */
export function eventOfPath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "");
  const m = EVENT_PAGE.exec(path) ?? PORTAL.exec(path);
  return m ? decodeURIComponent(m[1]) : null;
}

export function viewAsDestination(pathname: string, view: ViewAs, eventId: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const event = eventOfPath(path) ?? eventId;
  const eventPage = `/events/${encodeURIComponent(event)}`;
  const isAdminPage = path.startsWith("/admin") || path.startsWith("/manager");
  const portal = PORTAL.exec(path);
  const onEventPage = EVENT_PAGE.exec(path);

  if (view.role === "dancer") {
    if (isAdminPage || portal) return eventPage;
    if (onEventPage) return eventPage;
    return path;
  }

  const role = view.role;
  const base = eventPortalPath(event, role);
  const has = (slug: string | undefined) => !!slug && PORTAL_SECTION_LINKS[role].some((s) => s.slug === slug);
  if (isAdminPage) {
    const slug = STAFF_VERSION[path];
    return has(slug) ? `${base}/${slug}` : base;
  }
  if (portal) return has(portal[3]) ? `${base}/${portal[3]}` : base;
  if (onEventPage) return eventPage;
  return path;
}
