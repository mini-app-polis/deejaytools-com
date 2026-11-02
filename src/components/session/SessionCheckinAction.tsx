import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { formatDateTimeShort } from "@/lib/sessionFormat";
import type { ApiQueueEntry, ApiSession } from "@/schemas";

/**
 * The check-in button with its status: where the caller's entries stand in
 * line, or when check-in opens or that it has closed; Sign in for a visitor.
 * The page shows it above and below the queues, so the action is always
 * reachable, with the same text in both places.
 */
export default function SessionCheckinAction({
  id,
  session,
  now,
  canCheckIn,
  checkinWindowOpen,
  openCheckin,
  userQueueEntries,
  active,
  priorityWaiting,
  partnerCheckedInEntityIds,
}: {
  id: string;
  session: ApiSession;
  now: number;
  canCheckIn: boolean;
  checkinWindowOpen: boolean;
  openCheckin: () => void;
  userQueueEntries: readonly ApiQueueEntry[];
  active: readonly ApiQueueEntry[];
  priorityWaiting: readonly ApiQueueEntry[];
  partnerCheckedInEntityIds: ReadonlySet<string>;
}) {
  return (
    <>
      <SignedIn>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!canCheckIn} onClick={openCheckin} size="lg">
            Check in
          </Button>
          {userQueueEntries.length > 0 ? (
            // Show one line per partnership currently in queue.
            <div className="flex flex-col gap-0.5">
              {userQueueEntries.map((entry) => {
                const pos = (() => {
                  const isInActive = active.some((r) => r.queueEntryId === entry.queueEntryId);
                  if (isInActive) return { subQueue: "active" as const, overall: entry.position };
                  if (entry.subQueue === "priority")
                    return { subQueue: "priority" as const, overall: active.length + entry.position };
                  return {
                    subQueue: "standard" as const,
                    overall: active.length + priorityWaiting.length + entry.position,
                  };
                })();
                return (
                  <p key={entry.queueEntryId} className="text-sm">
                    <span className="font-medium">#{pos.overall} in queue</span>
                    <span className="text-muted-foreground">
                      {" "}({pos.subQueue}
                      {entry.divisionName ? `, ${entry.divisionName}` : ""}
                      {userQueueEntries.length > 1 && entry.entityLabel && entry.entityLabel !== "—"
                        ? ` · ${entry.entityLabel}`
                        : ""}
                      )
                    </span>
                    {((entry.entityPairId != null &&
                      partnerCheckedInEntityIds.has(entry.entityPairId)) ||
                      (entry.entityManagedPartnershipId != null &&
                        partnerCheckedInEntityIds.has(entry.entityManagedPartnershipId))) && (
                      <span className="text-muted-foreground"> · checked in by your partner</span>
                    )}
                  </p>
                );
              })}
            </div>
          ) : !canCheckIn && !checkinWindowOpen ? (
            <p className="text-sm text-muted-foreground">
              {now < session.checkin_opens_at
                ? `Check-in opens ${formatDateTimeShort(session.checkin_opens_at, session.event_timezone)}`
                : "Check-in closed"}
            </p>
          ) : null}
        </div>
      </SignedIn>
      <SignedOut>
        <div className="flex flex-wrap items-center gap-3">
          <SignInButton
            forceRedirectUrl={id ? `/sessions/${id}` : "/my-content"}
            signUpForceRedirectUrl={id ? `/sessions/${id}` : "/my-content"}
          >
            <Button size="lg">Sign in to check in</Button>
          </SignInButton>
          <p className="text-sm text-muted-foreground">
            Sign in to check in or upload a song.
          </p>
        </div>
      </SignedOut>
    </>
  );
}
