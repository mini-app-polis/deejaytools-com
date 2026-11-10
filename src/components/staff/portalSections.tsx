import CheckinForSection from "@/components/staff/CheckinForSection";
import DriveFolderSection from "@/components/staff/DriveFolderSection";
import EventDetailsSection from "@/components/staff/EventDetailsSection";
import EventSessionsSection from "@/components/staff/EventSessionsSection";
import EventStaffSection from "@/components/staff/EventStaffSection";
import EventSubmissionsSection from "@/components/staff/EventSubmissionsSection";
import RegistrationsPanel from "@/components/registrations/RegistrationsPanel";
import LiveQueueSection from "@/components/staff/LiveQueueSection";
import RunHistorySection from "@/components/staff/RunHistorySection";
import UploadForSection from "@/components/staff/UploadForSection";
import type { PortalSection } from "@/components/staff/StaffPortal";

import { PORTAL_SECTION_LINKS } from "@/lib/portalSectionLinks";
import type { ApiEvent } from "@/schemas";

/** What each portal section renders, by slug; the staff pages render the same. */
export const SECTION_RENDER: Record<string, PortalSection["render"]> = {
  // The registration list, which every staff role keeps; the admin's notes
  // on it stay with the admin.
  registrations: (event) => <RegistrationsPanel event={event} showNotes={false} />,
  submissions: (event) => <EventSubmissionsSection event={event} />,
  queue: (event) => <LiveQueueSection event={event} />,
  sessions: (event) => <EventSessionsSection event={event} />,
  runs: (event) => <RunHistorySection event={event} />,
  "checkin-for": (event) => <CheckinForSection event={event} />,
  "upload-for": (event) => <UploadForSection event={event} />,
  drive: (event) => <DriveFolderSection event={event} />,
  event: (event: ApiEvent, setEvent) => <EventDetailsSection event={event} onUpdated={setEvent} />,
  staff: (event) => <EventStaffSection event={event} />,
};

function sections(role: keyof typeof PORTAL_SECTION_LINKS): PortalSection[] {
  return PORTAL_SECTION_LINKS[role].map(({ slug, label }) => ({ slug, label, render: SECTION_RENDER[slug] }));
}

/** The coordinator portal: the event's registration list, and its entries, read-only. */
export const COORDINATOR_SECTIONS: PortalSection[] = sections("coordinator");

/** The DJ portal: running the event's floor trials and its music, plus the coordinator's sections. */
export const DJ_SECTIONS: PortalSection[] = sections("dj");

/** The event-manager portal: everything the DJ has, plus the event itself and its staff. */
export const EVENT_MANAGER_SECTIONS: PortalSection[] = sections("event-manager");
