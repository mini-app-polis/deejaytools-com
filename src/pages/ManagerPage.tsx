import { useState } from "react";
import { useParams } from "react-router-dom";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import ManagerActiveSessionsSection from "@/components/manager/ManagerActiveSessionsSection";
import ManagerCheckinForSection from "@/components/manager/ManagerCheckinForSection";
import ManagerEventSongsSection from "@/components/manager/ManagerEventSongsSection";
import ManagerGuideSection from "@/components/manager/ManagerGuideSection";
import ManagerUploadForSection from "@/components/manager/ManagerUploadForSection";

export const MANAGER_SECTIONS = ["active-sessions", "event-songs", "upload-for", "checkin-for", "guide"] as const;
export type ManagerSection = (typeof MANAGER_SECTIONS)[number];
const DEFAULT_MANAGER_SECTION: ManagerSection = "active-sessions";

function isManagerSection(s: string | undefined): s is ManagerSection {
  return !!s && (MANAGER_SECTIONS as readonly string[]).includes(s);
}

export default function ManagerPage() {
  const { section: rawSection } = useParams<{ section: string }>();
  const section: ManagerSection = isManagerSection(rawSection)
    ? rawSection
    : DEFAULT_MANAGER_SECTION;

  // Kept here, not in the section, so a chosen session survives a tab switch.
  const [lqSessionId, setLqSessionId] = useState("");

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">Manager</h1>

      {/* Each section is its own route (`/manager/<section>`); Radix shows
          only the TabsContent whose value matches. The sections below render
          their own TabsContent and stay mounted, so their state holds across
          a switch to another section and back. */}
      <Tabs value={section}>
        <TabsContent value="guide" className="mt-4">
          <ManagerGuideSection />
        </TabsContent>
        <ManagerActiveSessionsSection sessionId={lqSessionId} onSessionIdChange={setLqSessionId} />
        <ManagerEventSongsSection open={section === "event-songs"} />
        <ManagerUploadForSection />
        <ManagerCheckinForSection />
      </Tabs>
    </div>
  );
}
