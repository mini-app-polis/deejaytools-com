import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatSessionTitle } from "@/lib/sessionFormat";
import type { ApiMyCheckin } from "@/schemas";

function queueStatusBadge(checkin: ApiMyCheckin) {
  if (checkin.queueType === "active") {
    return (
      <Badge className="bg-primary text-primary-foreground border-transparent">
        Active queue
      </Badge>
    );
  }
  if (checkin.queueType === "priority") {
    return (
      <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
        Priority queue
      </Badge>
    );
  }
  if (checkin.queueType === "non_priority") {
    return (
      <Badge className="bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/30">
        Standard queue
      </Badge>
    );
  }
  return <Badge variant="secondary">In queue</Badge>;
}

/**
 * My Content's Check-ins: each of the dancer's live entries, where it stands
 * in line, and Withdraw, or why only their partner may withdraw it.
 */
export default function MyCheckinsSection({
  checkins,
  onWithdraw,
}: {
  checkins: readonly ApiMyCheckin[];
  /** Asks to withdraw the check-in with this id. */
  onWithdraw: (checkinId: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
        <h2 id="checkins" className="font-semibold scroll-mt-24">
          Check-ins
        </h2>
        <Link
          to="/how-it-works/the-queue"
          className="text-xs text-muted-foreground hover:underline shrink-0"
        >
          Learn more →
        </Link>
      </div>
      <div className="p-4 space-y-3">
          <ul aria-labelledby="checkins" className="space-y-3">
            {checkins.map((ci) => (
              <li key={ci.id} className="flex items-start gap-3">
                {/* Entry card */}
                <div className="flex-1 min-w-0 rounded-lg border px-4 py-3 text-sm space-y-2">
                  {/* Position + queue type */}
                  <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-border/40">
                    <div>
                      <p className="text-sm font-medium">
                        This entry is{" "}
                        <span className="text-foreground font-semibold">#{ci.overallPosition}</span>{" "}
                        in line
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(ci.runCount ?? 0) === 0
                          ? "No runs yet this session"
                          : (ci.runCount ?? 0) === 1
                          ? "1 run this session"
                          : `${ci.runCount} runs this session`}
                      </p>
                    </div>
                    <div className="shrink-0">{queueStatusBadge(ci)}</div>
                  </div>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      {ci.eventName && (
                        <p className="text-xs text-muted-foreground">{ci.eventName}</p>
                      )}
                      <p className="font-medium">
                        {formatSessionTitle(
                          { floor_trial_starts_at: ci.sessionFloorTrialStartsAt },
                          ci.eventTimezone
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-0.5 border-t border-border/40 pt-2">
                    <p>
                      <span className="text-muted-foreground">Division </span>
                      {ci.divisionName}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Dancer </span>
                      {ci.entityLabel}
                    </p>
                    {ci.songDisplayName && (
                      <p>
                        <span className="text-muted-foreground">Song </span>
                        {ci.songDisplayName}
                      </p>
                    )}
                    {ci.notes && (
                      <p className="text-muted-foreground italic">Note: {ci.notes}</p>
                    )}
                  </div>

                  {/* Withdraw — the API refuses it for a check-in the partner made. */}
                  <div className="pt-2 border-t border-border/40 mt-1">
                    {ci.canWithdraw ? (
                      <Button
                        type="button" size="sm" variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive-strong hover:text-destructive-foreground"
                        onClick={() => onWithdraw(ci.id)}
                      >
                        Withdraw from queue
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Your partner checked this partnership in. Only they can withdraw it.
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
      </div>
    </div>
  );
}
