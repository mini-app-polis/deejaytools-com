import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { ApiEvent, ApiSession } from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { compareEventChrono } from "@/lib/chronoSort";
import { CLICKABLE_CARD_CLASS } from "@/lib/clickable";
import { formatEventDateRange, parseCalendarDate } from "@/lib/eventDates";
import { countFloorTrialsByEvent, formatFloorTrials } from "@/lib/floorTrials";
import { formatTimezoneAbbr } from "@/lib/sessionFormat";
import type { FloorTrialCounts } from "@/lib/floorTrials";
import { cn } from "@/lib/utils";

/** Shared empty tally for events that have no sessions at all. */
const EMPTY_TRIALS: FloorTrialCounts = { active: 0, upcoming: 0, completed: 0, cancelled: 0 };

function eventStatusBadge(status: string) {
  switch (status) {
    case "upcoming":
      return <Badge variant="default">{status}</Badge>;
    case "active":
      return (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
          {status}
        </Badge>
      );
    case "completed":
      return <Badge variant="secondary">{status}</Badge>;
    case "cancelled":
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}


export default function EventsPage() {
  const api = useApiClient();
  const [events, setEvents] = useState<ApiEvent[] | null>(null);
  // Sessions are fetched alongside events purely to count each event's floor
  // trials. GET /v1/sessions is public and server-cached, and FloorTrialsPage
  // already loads the same pair, so this costs a warm cache hit rather than a
  // new per-event round trip.
  const [sessions, setSessions] = useState<ApiSession[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<ApiEvent[]>("/v1/events"),
      api.get<ApiSession[]>("/v1/sessions"),
    ])
      .then(([evs, sess]) => {
        setEvents(evs);
        setSessions(sess);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api]);

  if (loading && !events) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // This page answers "what is on right now, and what is coming up". Completed
  // and cancelled events are dropped rather than sorted to the bottom — they
  // stay reachable by direct URL, they just don't belong in the listing.
  // Active first, then upcoming soonest-first.
  const sortedEvents = events
    ?.filter((ev) => ev.status === "active" || ev.status === "upcoming")
    .sort(compareEventChrono);

  const trialsByEvent = countFloorTrialsByEvent(sessions ?? []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title text-2xl">Events</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Everything current and upcoming on the platform — tap an event to see its
          sessions and who has music in.{" "}
          <Link to="/how-it-works" className="text-primary hover:underline">
            How this works →
          </Link>
        </p>
      </div>

      {sortedEvents?.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No current or upcoming events.
        </p>
      )}

      {/* Cards at every breakpoint — a handful of events with a name, a date
          range and a status has no columns worth aligning, and the card is
          already the shape used for sessions on Floor Trials and the event
          picker in Manager. */}
      <div
        className={cn(
          "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
          loading && "opacity-60 pointer-events-none"
        )}
      >
        {sortedEvents?.map((ev) => {
          // An event with no sessions has no map entry; the empty tally makes
          // it read "none scheduled yet" rather than dropping the line.
          const trials = trialsByEvent.get(ev.id) ?? EMPTY_TRIALS;
          // Local noon on the start date — a safe instant for resolving the
          // zone's DST abbreviation without touching a neighbouring day.
          const tzAnchor = parseCalendarDate(ev.start_date)?.getTime();
          return (
            // A real <Link>, not a button + navigate: middle-click, cmd-click
            // and "copy link address" all work, and the whole card is the target.
            <Link
              key={ev.id}
              to={`/events/${ev.id}`}
              className={cn(
                "flex h-full flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm",
                CLICKABLE_CARD_CLASS
              )}
            >
              {/* Badge row, then title, then label: value detail lines — the
                  same rhythm as the session cards on Floor Trials, so the two
                  public listings read as one design. */}
              <div className="flex flex-wrap items-center gap-2">{eventStatusBadge(ev.status)}</div>
              <p className="flex flex-wrap items-center gap-2 font-medium text-base leading-snug transition-colors group-hover:text-primary">
                {ev.name}
                {ev.timezone && (
                  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    {formatTimezoneAbbr(ev.timezone, tzAnchor)}
                  </Badge>
                )}
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Dates: {formatEventDateRange(ev.start_date, ev.end_date)}</p>
                {/* Held back until sessions land, so no card flashes "none
                    scheduled yet" on its way to the real numbers. */}
                {sessions !== null && <p>Floor trials: {formatFloorTrials(trials)}</p>}
              </div>
              {/* Pushed to the bottom so the affordance lines up across a row of
                  cards whose names wrap to different heights. */}
              <div className="mt-auto pt-1">
                <Separator className="mb-2" />
                <p className="text-sm font-medium text-primary">Open event →</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
