import { Link } from "react-router-dom";
import { TabsContent } from "@/components/ui/tabs";
import LiveQueueSection from "@/components/staff/LiveQueueSection";

/**
 * The manager Active Sessions section: the staff live queue over today's
 * sessions across all events. The chosen session comes from ManagerPage
 * because this TabsContent unmounts the queue on a tab switch, and the
 * manager expects to come back to the session they were running.
 */
export default function ManagerActiveSessionsSection({
  sessionId,
  onSessionIdChange,
}: {
  sessionId: string;
  onSessionIdChange: (id: string) => void;
}) {
  return (
    <TabsContent value="active-sessions" className="mt-4 space-y-5">
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium text-foreground">New to the booth?</span>{" "}
          <span className="text-muted-foreground">
            Read the operations guide for button meanings and session setup.
          </span>
        </p>
        <Link
          to="/manager/guide"
          className="text-sm font-medium text-primary hover:underline shrink-0"
        >
          Open guide →
        </Link>
      </div>
      <LiveQueueSection
        today
        sessionId={sessionId}
        onSessionIdChange={onSessionIdChange}
        selectorClassName="w-full sm:w-72"
      />
    </TabsContent>
  );
}
