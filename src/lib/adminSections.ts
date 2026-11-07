/**
 * The admin sections, in display order. The order also drives the
 * navbar dropdown and any future iteration over admin pages.
 *
 * Each admin section is its own route (`/admin/<section>`); the value
 * here is the URL slug and the corresponding Radix `<TabsContent value=...>`
 * identifier in the section's component. Keeping them in one constant keeps the route,
 * the param parsing, and the rendering in lock-step.
 *
 * Kept apart from AdminPage, which is loaded lazily, so what lists the
 * sections (the e2e accessibility scan among them) need not load the page.
 * It imports nothing, for the same reason.
 */
export const ADMIN_SECTIONS = [
  "events",
  "sessions",
  "songs",
  "registrations",
  "users",
  "runs",
  "test-checkin",
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/** Each admin section's name in the navbar. */
export const ADMIN_SECTION_LABELS: Record<AdminSection, string> = {
  events: "Events",
  sessions: "Sessions",
  songs: "Songs",
  registrations: "Registrations",
  users: "Users",
  runs: "Run History",
  "test-checkin": "Test Checkin",
};
