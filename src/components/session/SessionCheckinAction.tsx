import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { formatDateTimeShort } from "@/lib/sessionFormat";
import type { ApiMyCheckin, ApiZonedSession } from "@/schemas";

/**
 * The check-in button with its status: where the caller's entries stand in
 * line, or when check-in opens or that it has closed; Sign in for a visitor.
 * Where the caller stands comes from their own check-ins (/v1/checkins/mine),
 * which are read fresh: the public queue lists can be a few seconds old at
 * the edge, and the caller's own place must show as soon as they check in.
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
  myPlaces,
}: {
  id: string;
  session: ApiZonedSession;
  now: number;
  canCheckIn: boolean;
  checkinWindowOpen: boolean;
  openCheckin: () => void;
  /** The caller's live check-ins in this session, from /v1/checkins/mine. */
  myPlaces: readonly ApiMyCheckin[];
}) {
  return (
    <>
      <SignedIn>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!canCheckIn} onClick={openCheckin} size="lg">
            Check in
          </Button>
          {myPlaces.length > 0 ? (
            // Show one line per partnership currently in queue.
            <div className="flex flex-col gap-0.5">
              {myPlaces.map((place) => (
                <p key={place.queueEntryId} className="text-sm">
                  <span className="font-medium">#{place.overallPosition} in queue</span>
                  <span className="text-muted-foreground">
                    {" "}({place.queueType === "non_priority" ? "standard" : place.queueType}
                    {place.divisionName ? `, ${place.divisionName}` : ""}
                    {myPlaces.length > 1 && place.entityLabel && place.entityLabel !== "—"
                      ? ` · ${place.entityLabel}`
                      : ""}
                    )
                  </span>
                  {!place.canWithdraw && (
                    <span className="text-muted-foreground"> · checked in by your partner</span>
                  )}
                </p>
              ))}
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
