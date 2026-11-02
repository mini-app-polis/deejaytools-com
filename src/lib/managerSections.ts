/**
 * The manager sections, in display order (the navbar's), each its own route
 * (`/manager/<section>`).
 *
 * Kept apart from ManagerPage, which is loaded lazily, so what lists the
 * sections (the e2e accessibility scan among them) need not load the page.
 * It imports nothing, for the same reason.
 */
export const MANAGER_SECTIONS = ["active-sessions", "event-songs", "upload-for", "checkin-for", "guide"] as const;
export type ManagerSection = (typeof MANAGER_SECTIONS)[number];

/** Each manager section's name in the navbar. */
export const MANAGER_SECTION_LABELS: Record<ManagerSection, string> = {
  "active-sessions": "Active Sessions",
  "event-songs": "Event Songs",
  "upload-for": "Upload For",
  "checkin-for": "CheckIn For",
  guide: "Guide",
};
