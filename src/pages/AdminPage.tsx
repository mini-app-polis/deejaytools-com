import { useParams } from "react-router-dom";
import AdminEventsSection from "@/components/admin/AdminEventsSection";
import AdminRunsSection from "@/components/admin/AdminRunsSection";
import AdminSessionsSection from "@/components/admin/AdminSessionsSection";
import AdminSongsSection from "@/components/admin/AdminSongsSection";
import AdminTestCheckinSection from "@/components/admin/AdminTestCheckinSection";
import AdminUsersSection from "@/components/admin/AdminUsersSection";
import { Tabs } from "@/components/ui/tabs";

/**
 * The admin sections, in display order. The order also drives the
 * navbar dropdown and any future iteration over admin pages.
 *
 * Each admin section is its own route (`/admin/<section>`); the value
 * here is the URL slug and the corresponding Radix `<TabsContent value=...>`
 * identifier in the section's component. Keeping them in one constant keeps the route,
 * the param parsing, and the rendering in lock-step.
 */
export const ADMIN_SECTIONS = [
  "events",
  "sessions",
  "runs",
  "songs",
  "test-checkin",
  "users",
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

const DEFAULT_ADMIN_SECTION: AdminSection = "events";

function isAdminSection(s: string | undefined): s is AdminSection {
  return !!s && (ADMIN_SECTIONS as readonly string[]).includes(s);
}

export default function AdminPage() {
  // The URL drives which section is shown. An unknown / missing slug
  // collapses to the default rather than rendering nothing, so a
  // user typing /admin/foo doesn't see a blank page.
  const { section: rawSection } = useParams<{ section: string }>();
  const section: AdminSection = isAdminSection(rawSection)
    ? rawSection
    : DEFAULT_ADMIN_SECTION;

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">Admin</h1>

      {/* Admin sections are their own routes (`/admin/<section>`) reached
          via the navbar dropdown; there is no in-page tab strip. Radix's
          <Tabs> wrapper selects the section: Radix hides every TabsContent
          whose `value` doesn't match the controlled `value` prop. Each
          section renders its own TabsContent and dialogs, and stays
          mounted so its state holds across a section switch. */}
      <Tabs value={section}>
        <AdminEventsSection />
        <AdminSessionsSection />
        <AdminRunsSection />
        <AdminSongsSection />
        <AdminTestCheckinSection />
        <AdminUsersSection />
      </Tabs>
    </div>
  );
}
