import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { ApiEvent, ApiSession } from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICKABLE_CARD_CLASS } from "@/lib/clickable";
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr } from "@/lib/sessionFormat";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = new Set(["scheduled", "checkin_open", "in_progress"]);

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

export default function FloorTrialsPage() {
  const api = useApiClient();
  const [sessions, setSessions] = useState<ApiSession[] | null>(null);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchData = () => {
      setLoading(true);
      Promise.all([
        api.get<ApiSession[]>("/v1/sessions"),
        api.get<ApiEvent[]>("/v1/events"),
      ])
        .then(([s, e]) => {
          if (cancelled) return;
          setSessions(s);
          setEvents(e);
        })
        .catch((err: Error) => !cancelled && toast.error(err.message))
        .finally(() => !cancelled && setLoading(false));
    };

    fetchData();
    const intervalId = setInterval(fetchData, 10_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [api]);

  // Show active and upcoming sessions only — completed and cancelled sessions
  // are not relevant to regular users. Sort by start time ascending.
  const todaySessions = (sessions ?? [])
    .filter((s) => ACTIVE_STATUSES.has(s.status))
    .slice()
    .sort((a, b) => a.floor_trial_starts_at - b.floor_trial_starts_at);

  const eventNameById = new Map(events.map((e) => [e.id, e.name]));
  const eventTimezoneById = new Map(events.map((e) => [e.id, e.timezone]));

  if (loading && sessions === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title text-2xl">Floor Trials</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upcoming and active sessions, sorted by start time. Check-in opening
          times vary by session — tap a session to check in or watch its
          queue.{" "}
          <Link to="/how-it-works" className="text-primary hover:underline">
            How this works →
          </Link>
        </p>
      </div>

      {todaySessions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No upcoming sessions right now.
        </p>
      ) : (
        <div className={`space-y-3${loading ? " opacity-60" : ""}`}>
          {todaySessions.map((s) => {
            const eventName = s.event_id ? eventNameById.get(s.event_id) ?? null : null;
            const eventTz = s.event_id ? eventTimezoneById.get(s.event_id) ?? null : null;
            return (
              // The whole card is the click target — wrapping the Card in a
              // Link makes any tap or click on the row navigate, matching the
              // "Tap a session…" instruction in the page subtitle. The inner
              // "Open session →" element is kept as a visual affordance.
              <Link
                key={s.id}
                to={`/sessions/${s.id}`}
                className={cn("block rounded-xl border border-transparent", CLICKABLE_CARD_CLASS)}
              >
                <Card className="bg-transparent border-transparent shadow-none">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {eventName && (
                        <Badge
                          variant="outline"
                          className="border-primary/40 bg-primary/10 text-primary font-medium"
                        >
                          {eventName}
                        </Badge>
                      )}
                      {sessionStatusBadge(s.status)}
                    </div>
                    <CardTitle className="text-base mt-1.5 flex flex-wrap items-center gap-2">
                      {formatSessionTitle(s, eventTz)}
                      {eventTz && (
                        <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                          {formatTimezoneAbbr(eventTz, s.floor_trial_starts_at)}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p>Open: {formatTimeOnly(s.checkin_opens_at, eventTz)}</p>
                    <p>
                      Floor trial: {formatTimeOnly(s.floor_trial_starts_at, eventTz)} –{" "}
                      {formatTimeOnly(s.floor_trial_ends_at, eventTz)}
                    </p>
                    <Separator className="my-2" />
                    <p className="text-sm font-medium text-primary">Open session →</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
