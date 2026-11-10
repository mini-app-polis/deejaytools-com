import { eventPortalPath } from "@/lib/eventRoles";
import { PORTAL_SECTION_LINKS } from "@/lib/portalSectionLinks";
import { roleHasSection, staffPagePath } from "@/lib/staffPages";
import type { ViewAs } from "@/lib/viewAs";

/** The staff page that is each admin page's lesser-permission version. */
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
const STAFF_PAGE = /^\/staff\/([^/]+)$/;

/**
 * Where an admin lands on starting (or switching) a view-as: the page that
 * role would see in place of the current one. No event is involved: the
 * staff pages pick their own.
 *
 * - An admin page with a staff version opens that staff page, where the role
 *   has it (Registrations → the Registrations staff page).
 * - A staff page stays where the role has it; a portal keeps its event, and
 *   its section where the role has it.
 * - Anything else the role cannot open goes to the role's first staff page,
 *   or its portal on the same event.
 * - A dancer goes from any admin or staff page to the events list.
 * - Pages everyone sees stay as they are.
 */
export function viewAsDestination(pathname: string, view: ViewAs): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const isAdminPage = path.startsWith("/admin") || path.startsWith("/manager");
  const portal = PORTAL.exec(path);
  const staffPage = STAFF_PAGE.exec(path);

  if (view.role === "dancer") return isAdminPage || portal || staffPage ? "/events" : path;

  const role = view.role;
  const first = staffPagePath(PORTAL_SECTION_LINKS[role][0].slug);
  const has = (slug: string | undefined) => !!slug && roleHasSection(role, slug);
  if (isAdminPage) {
    const slug = STAFF_VERSION[path];
    return has(slug) ? staffPagePath(slug) : first;
  }
  if (staffPage) return has(decodeURIComponent(staffPage[1])) ? path : first;
  if (portal) {
    const base = eventPortalPath(decodeURIComponent(portal[1]), role);
    return has(portal[3]) ? `${base}/${portal[3]}` : base;
  }
  return path;
}
