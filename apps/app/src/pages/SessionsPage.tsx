import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CLICKABLE_CARD_CLASS, CLICKABLE_ROW_CLASS } from "@/lib/clickable";
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr } from "@/lib/sessionFormat";
import { compareSessionChrono } from "@/lib/chronoSort";
import { cn } from "@/lib/utils";

type SessionRow = {
  id: string;
  event_id: string | null;
  /** IANA timezone from the parent event. Null for standalone sessions. */
  event_timezone: string | null;
  name: string;
  date: string | null;
  status: string;
  checkin_opens_at: number;
  floor_trial_starts_at: number;
  floor_trial_ends_at: number;
};

function sessionStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return <Badge variant="secondary">{status}</Badge>;
    case "checkin_open":
      return <Badge variant="default">{status}</Badge>;
    case "in_progress":
      return (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
          {status}
        </Badge>
      );
    case "completed":
      return <Badge variant="outline">{status}</Badge>;
    case "cancelled":
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function SessionsPage() {
  const api = useApiClient();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    setLoading(true);
    api
      .get<SessionRow[]>("/v1/sessions")
      .then((rows) => on && setSessions(rows))
      .catch((e: Error) => on && toast.error(e.message))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, [api]);

  if (loading && !sessions) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Sort: active first, then upcoming (soonest first), then past (most recent first).
  const sortedSessions = sessions?.slice().sort(compareSessionChrono);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title text-2xl">Sessions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All floor trials. Active and upcoming first; past sessions at the bottom.
        </p>
      </div>

      {/* Mobile card list */}
      <div className={`sm:hidden space-y-3${loading ? " opacity-60" : ""}`}>
        {sortedSessions?.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No sessions yet.</p>
        )}
        {sortedSessions?.map((s) => (
          <Link
            key={s.id}
            to={`/sessions/${s.id}`}
            className={cn(
              "block rounded-lg border bg-card p-4 space-y-2 shadow-sm",
              CLICKABLE_CARD_CLASS
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-base leading-snug flex flex-wrap items-center gap-2">
                {formatSessionTitle(s, s.event_timezone)}
                {s.event_timezone && (
                  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    {formatTimezoneAbbr(s.event_timezone, s.floor_trial_starts_at)}
                  </Badge>
                )}
              </p>
              {sessionStatusBadge(s.status)}
            </div>
            <div className="text-sm text-muted-foreground space-y-0.5">
              <p>Open {formatTimeOnly(s.checkin_opens_at, s.event_timezone)}</p>
              <p>
                Floor trial {formatTimeOnly(s.floor_trial_starts_at, s.event_timezone)} – {formatTimeOnly(s.floor_trial_ends_at, s.event_timezone)}
              </p>
            </div>
            <p className="text-sm font-medium text-primary pt-1">Open →</p>
          </Link>
        ))}
      </div>

      {/* Desktop table */}
      <div className={`hidden sm:block${loading ? " opacity-60" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Open</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSessions?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No sessions yet.
                </TableCell>
              </TableRow>
            )}
            {sortedSessions?.map((s) => (
              // The whole row is the click target — matches EventsPage and the
              // mobile card layout above. Replaces the previous Open button
              // column, which was redundant with row navigation.
              <TableRow
                key={s.id}
                className={CLICKABLE_ROW_CLASS}
                onClick={() => navigate(`/sessions/${s.id}`)}
              >
                <TableCell className="font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {formatSessionTitle(s, s.event_timezone)}
                    {s.event_timezone && (
                      <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                        {formatTimezoneAbbr(s.event_timezone, s.floor_trial_starts_at)}
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>{sessionStatusBadge(s.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatTimeOnly(s.checkin_opens_at, s.event_timezone)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatTimeOnly(s.floor_trial_starts_at, s.event_timezone)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatTimeOnly(s.floor_trial_ends_at, s.event_timezone)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
