import ManagerGuideSection from "@/components/manager/ManagerGuideSection";

/**
 * The floor-trial operations guide, at /guide. Linked from the Event staff
 * bar for every staff role (coordinator, DJ, event manager), not from the
 * Admin bar. Signed-in only; the guide itself is reading, so it is not
 * gated on a role.
 */
export default function GuidePage() {
  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">Guide</h1>
      <ManagerGuideSection />
    </div>
  );
}
