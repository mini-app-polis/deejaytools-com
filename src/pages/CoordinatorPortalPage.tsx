import StaffPortal from "@/components/staff/StaffPortal";
import { COORDINATOR_SECTIONS } from "@/components/staff/portalSections";

/** An event's coordinator portal, at /events/:eventId/coordinator. */
export default function CoordinatorPortalPage() {
  return <StaffPortal roleLabel="Coordinator" portalSegment="coordinator" sections={COORDINATOR_SECTIONS} />;
}
