import StaffPortal from "@/components/staff/StaffPortal";
import { DJ_SECTIONS } from "@/components/staff/portalSections";

/** An event's DJ portal, at /events/:eventId/dj/:section. */
export default function DjPortalPage() {
  return <StaffPortal roleLabel="DJ" portalSegment="dj" sections={DJ_SECTIONS} />;
}
