import CheckinForSection from "@/components/staff/CheckinForSection";
import DriveFolderSection from "@/components/staff/DriveFolderSection";
import EventDetailsSection from "@/components/staff/EventDetailsSection";
import EventSessionsSection from "@/components/staff/EventSessionsSection";
import EventStaffSection from "@/components/staff/EventStaffSection";
import EventSubmissionsSection from "@/components/staff/EventSubmissionsSection";
import LiveQueueSection from "@/components/staff/LiveQueueSection";
import RunHistorySection from "@/components/staff/RunHistorySection";
import UploadForSection from "@/components/staff/UploadForSection";
import type { PortalSection } from "@/components/staff/StaffPortal";

/** The coordinator portal: the event's entries, read-only. */
export const COORDINATOR_SECTIONS: PortalSection[] = [
  { slug: "submissions", label: "Submissions", render: (event) => <EventSubmissionsSection event={event} /> },
];

/** The DJ portal: running the event's floor trials and its music. */
export const DJ_SECTIONS: PortalSection[] = [
  { slug: "queue", label: "Live queue", render: (event) => <LiveQueueSection event={event} /> },
  { slug: "sessions", label: "Sessions", render: (event) => <EventSessionsSection event={event} /> },
  { slug: "runs", label: "Run history", render: (event) => <RunHistorySection event={event} /> },
  { slug: "checkin-for", label: "Check in for", render: (event) => <CheckinForSection event={event} /> },
  { slug: "upload-for", label: "Upload for", render: (event) => <UploadForSection event={event} /> },
  ...COORDINATOR_SECTIONS,
  { slug: "drive", label: "Drive folder", render: (event) => <DriveFolderSection event={event} /> },
];

/** The event-manager portal: everything the DJ has, plus the event itself and its staff. */
export const EVENT_MANAGER_SECTIONS: PortalSection[] = [
  ...DJ_SECTIONS,
  {
    slug: "event",
    label: "Event",
    render: (event, setEvent) => <EventDetailsSection event={event} onUpdated={setEvent} />,
  },
  { slug: "staff", label: "Staff", render: (event) => <EventStaffSection event={event} /> },
];
