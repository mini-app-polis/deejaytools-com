import { useParams } from "react-router-dom";
import AdminEventsSection from "@/components/admin/AdminEventsSection";
import AdminRegistrationsSection from "@/components/admin/AdminRegistrationsSection";
import AdminRunsSection from "@/components/admin/AdminRunsSection";
import AdminSessionsSection from "@/components/admin/AdminSessionsSection";
import AdminSongsSection from "@/components/admin/AdminSongsSection";
import AdminTestCheckinSection from "@/components/admin/AdminTestCheckinSection";
import AdminUsersSection from "@/components/admin/AdminUsersSection";
import { Tabs } from "@/components/ui/tabs";
import { ADMIN_SECTIONS, type AdminSection } from "@/lib/adminSections";

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
          mounted so its state holds across a section switch; `open`
          keeps its queries from running while it is hidden. */}
      <Tabs value={section}>
        <AdminEventsSection open={section === "events"} />
        <AdminSessionsSection open={section === "sessions"} />
        <AdminRunsSection open={section === "runs"} />
        <AdminSongsSection open={section === "songs"} />
        <AdminRegistrationsSection open={section === "registrations"} />
        <AdminTestCheckinSection open={section === "test-checkin"} />
        <AdminUsersSection open={section === "users"} />
      </Tabs>
    </div>
  );
}
