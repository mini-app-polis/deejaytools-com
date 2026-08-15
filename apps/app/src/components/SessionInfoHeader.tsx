import { useEffect, useState } from "react";
import type { ApiSession } from "@deejaytools/schemas";
import { Badge } from "@/components/ui/badge";
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr } from "@/lib/sessionFormat";

function derivedStatus(s: ApiSession, now: number): string {
  if (now < s.checkin_opens_at) return "scheduled";
  if (now <= s.floor_trial_ends_at) return "open";
  return "ended";
}

function derivedStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return <Badge variant="secondary">{status}</Badge>;
    case "open":
      return (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
          {status}
        </Badge>
      );
    case "ended":
      return <Badge variant="outline">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function SessionInfoHeader({
  session,
  showTitle = true,
}: {
  session: ApiSession;
  showTitle?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-3">
      {showTitle && session.event_name && (
        <h2 className="page-title text-2xl">{session.event_name}</h2>
      )}

      {/* Status badge (+ title + timezone when showTitle) */}
      <div className="flex items-center gap-3 flex-wrap">
        {derivedStatusBadge(derivedStatus(session, now))}
        {showTitle && (
          <h1 className="page-title text-2xl">
            {formatSessionTitle(session, session.event_timezone)}
          </h1>
        )}
        {showTitle && session.event_timezone && (
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground self-center">
            {formatTimezoneAbbr(session.event_timezone, session.floor_trial_starts_at)}
          </Badge>
        )}
      </div>

      {/* Open / Start / End times */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="border-yellow-500/40 bg-yellow-500/15 text-foreground font-normal"
        >
          <span className="opacity-70 mr-1">Open:</span>
          {formatTimeOnly(session.checkin_opens_at, session.event_timezone)}
        </Badge>
        <Badge
          variant="outline"
          className="border-emerald-500/40 bg-emerald-500/15 text-foreground font-normal"
        >
          <span className="opacity-70 mr-1">Start:</span>
          {formatTimeOnly(session.floor_trial_starts_at, session.event_timezone)}
        </Badge>
        <Badge
          variant="outline"
          className="border-red-500/40 bg-red-500/15 text-foreground font-normal"
        >
          <span className="opacity-70 mr-1">End:</span>
          {formatTimeOnly(session.floor_trial_ends_at, session.event_timezone)}
        </Badge>
      </div>

      {/* Priority / Standard divisions */}
      {session.divisions && session.divisions.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {(() => {
            const priorityDivs = session.divisions
              .filter((d) => d.is_priority)
              .map((d) => d.division_name);
            const standardDivs = session.divisions
              .filter((d) => !d.is_priority)
              .map((d) => d.division_name);
            return (
              <>
                {priorityDivs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-amber-500 dark:text-amber-400 font-medium uppercase tracking-wide mr-1">
                      Priority:
                    </span>
                    {priorityDivs.map((d) => (
                      <Badge
                        key={d}
                        variant="outline"
                        className="border-amber-500/30 text-amber-600 dark:text-amber-300 font-normal"
                      >
                        {d}
                      </Badge>
                    ))}
                  </div>
                )}
                {standardDivs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-sky-500 dark:text-sky-400 font-medium uppercase tracking-wide mr-1">
                      Standard:
                    </span>
                    {standardDivs.map((d) => (
                      <Badge
                        key={d}
                        variant="outline"
                        className="border-sky-500/30 text-sky-600 dark:text-sky-300 font-normal"
                      >
                        {d}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Active cap + priority run limit */}
      <div className="text-xs text-muted-foreground space-y-0.5 pt-0.5">
        {(() => {
          const limit =
            (session.divisions ?? []).find(
              (d) => d.priority_run_limit != null && d.priority_run_limit > 0
            )?.priority_run_limit ?? null;
          return limit != null ? (
            <p>
              Priority runs: <span className="text-foreground">{limit}</span>
            </p>
          ) : null;
        })()}
        {(session.active_priority_max != null || session.active_non_priority_max != null) && (
          <p>
            Active cap:{" "}
            <span className="text-foreground">{session.active_priority_max ?? "—"}</span> priority ·{" "}
            <span className="text-foreground">{session.active_non_priority_max ?? "—"}</span> standard
          </p>
        )}
      </div>
    </div>
  );
}
