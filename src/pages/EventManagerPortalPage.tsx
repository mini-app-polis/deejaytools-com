import StaffPortal from "@/components/staff/StaffPortal";
import { EVENT_MANAGER_SECTIONS } from "@/components/staff/portalSections";

/** An event's event-manager portal, at /events/:eventId/manage/:section. */
export default function EventManagerPortalPage() {
  return <StaffPortal roleLabel="Event manager" portalSegment="manage" sections={EVENT_MANAGER_SECTIONS} />;
}
