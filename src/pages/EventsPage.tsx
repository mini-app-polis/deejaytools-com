import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { EventStatus } from "@/schemas";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import LinkCard from "@/components/LinkCard";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { compareEventChrono } from "@/lib/chronoSort";
import { formatEventDateRange, parseCalendarDate } from "@/lib/eventDates";
import { eventPagePath, eventSlugs } from "@/lib/eventSlug";
import { countFloorTrialsByEvent, formatFloorTrials } from "@/lib/floorTrials";
import { formatTimezoneAbbr } from "@/lib/sessionFormat";
import type { FloorTrialCounts } from "@/lib/floorTrials";
import { cn } from "@/lib/utils";

/** Shared empty tally for events that have no sessions at all. */
const EMPTY_TRIALS: FloorTrialCounts = { active: 0, upcoming: 0, completed: 0, cancelled: 0 };

function eventStatusBadge(status: EventStatus) {
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
  }
}


export default function EventsPage() {
  // Sessions are fetched alongside events purely to count each event's floor
  // trials. GET /v1/sessions is public and server-cached, and FloorTrialsPage
  // reads the same pair from the shared query cache, so this costs a cache hit
  // rather than a new per-event round trip.
  // Events and sessions load independently: a sessions failure keeps the
  // events listed, without floor-trial counts, and says why.
  const eventsQuery = useEndpointQuery(endpoints.events.list);
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list);
  const events = eventsQuery.data ?? null;
  // Readable /events/<name-year> links (lib/eventSlug).
  const slugs = useMemo(() => eventSlugs(events ?? []), [events]);
  const sessions = sessionsQuery.data ?? null;
  const sessionsError = sessionsQuery.error && !sessions ? sessionsQuery.error.message : null;
  const loading = eventsQuery.isFetching || sessionsQuery.isFetching;

  if (eventsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // This page answers "what is on right now, and what is coming up". Completed
  // events are dropped rather than sorted to the bottom — they
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
          <Link to="/how-it-works" className="text-primary underline underline-offset-2">
            How this works →
          </Link>
        </p>
      </div>

      {eventsQuery.error && !events && (
        <QueryError what="events" error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()} />
      )}

      {events && sessionsError !== null && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load floor trials, so counts are not shown: {sessionsError}
        </p>
      )}

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
            // The shared card (LinkCard): the same layout as the session cards
            // on Floor Trials and the event page, so the listings read as one design.
            <LinkCard
              key={ev.id}
              to={eventPagePath(ev.id, slugs)}
              badges={eventStatusBadge(ev.status)}
              title={ev.name}
              titleAside={
                ev.timezone && (
                  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    {formatTimezoneAbbr(ev.timezone, tzAnchor)}
                  </Badge>
                )
              }
              details={
                <>
                  <p>{formatEventDateRange(ev.start_date, ev.end_date)}</p>
                  {/* Held back until sessions land, so no card flashes "none
                      scheduled yet" on its way to the real numbers. */}
                  {sessions !== null && <p>Floor trials: {formatFloorTrials(trials)}</p>}
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
