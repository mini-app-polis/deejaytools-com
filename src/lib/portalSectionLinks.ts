import type { EventStaffRole } from "@/schemas";

/**
 * Each staff portal's sections, in tab order: the URL slug
 * (`/events/:eventId/<portal>/<slug>`) and the tab's name.
 *
 * Kept apart from the portals, which load lazily, so the navbar can link to
 * every section without loading them. It imports only types, for the same
 * reason. The portals render these lists (components/staff/portalSections).
 */
export type PortalSectionLink = { slug: string; label: string };

const COORDINATOR: PortalSectionLink[] = [
  { slug: "registrations", label: "Registrations" },
  { slug: "submissions", label: "Submissions" },
];

const DJ: PortalSectionLink[] = [
  { slug: "queue", label: "Live queue" },
  { slug: "sessions", label: "Sessions" },
  { slug: "runs", label: "Run history" },
  { slug: "checkin-for", label: "Check in for" },
  { slug: "upload-for", label: "Upload for" },
  ...COORDINATOR,
  { slug: "drive", label: "Drive folder" },
];

const EVENT_MANAGER: PortalSectionLink[] = [
  ...DJ,
  { slug: "event", label: "Event" },
  { slug: "staff", label: "Staff" },
];

export const PORTAL_SECTION_LINKS: Record<EventStaffRole, readonly PortalSectionLink[]> = {
  coordinator: COORDINATOR,
  dj: DJ,
  "event-manager": EVENT_MANAGER,
};
