import { Link } from "react-router-dom";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import SessionCard from "@/components/SessionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { FLOOR_TRIAL_SECTIONS, floorTrialSection, type FloorTrialSection } from "@/lib/floorTrials";
import { cn } from "@/lib/utils";
import type { ApiSession } from "@/schemas";

/**
 * This page lists what a competitor can still turn up to, in three sections
 * that are always shown, so an empty one says so rather than disappearing:
 *
 * - Active: check-in open or running now.
 * - Soon: not started yet, at an event that is on now.
 * - Scheduled: not started, at an event still to come.
 *
 * Completed and cancelled trials are excluded — they are still counted on
 * the events page, which summarises an event's whole schedule rather than
 * listing what to do next. Sourced from floorTrialSection, built on the same
 * floorTrialBucket the events pages use, so the pages cannot drift.
 */
const SECTION_TEXT: Record<FloorTrialSection, { title: string; empty: string }> = {
  active: { title: "Active", empty: "No floor trials are open or running right now." },
  soon: { title: "Soon", empty: "Nothing else is coming up at the events on now." },
  scheduled: { title: "Scheduled", empty: "No floor trials are scheduled at upcoming events." },
};

export default function FloorTrialsPage() {
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list);
  const eventsQuery = useEndpointQuery(endpoints.events.list);
  const sessions = sessionsQuery.data ?? null;
  const events = eventsQuery.data ?? [];
  const loading = sessionsQuery.isFetching || eventsQuery.isFetching;
  // The list needs both: the sessions, and their events' names, timezones
  // and status (which decides Soon from Scheduled).
  const loadError =
    (!sessionsQuery.data && sessionsQuery.error) || (!eventsQuery.data && eventsQuery.error) || null;

  const eventById = new Map(events.map((e) => [e.id, e]));
  const bySection = new Map<FloorTrialSection, ApiSession[]>(FLOOR_TRIAL_SECTIONS.map((s) => [s, []]));
  for (const s of sessions ?? []) {
    const event = s.event_id ? eventById.get(s.event_id) : undefined;
    const section = floorTrialSection(s.status, event?.status);
    if (section) bySection.get(section)!.push(s);
  }
  for (const list of bySection.values()) list.sort((a, b) => a.floor_trial_starts_at - b.floor_trial_starts_at);
  const nothingListed = [...bySection.values()].every((l) => l.length === 0);

  if (sessionsQuery.isLoading || eventsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-2xl">Floor Trials</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Active, starting soon and scheduled sessions, sorted by start time.
          Check-in opening times vary by session — tap a session to check in or
          watch its queue.{" "}
          <Link to="/how-it-works" className="text-primary underline underline-offset-2">
            How this works →
          </Link>
        </p>
      </div>

      {loadError ? (
        <QueryError
          what="floor trials"
          error={loadError}
          onRetry={() => {
            if (sessionsQuery.error) void sessionsQuery.refetch();
            if (eventsQuery.error) void eventsQuery.refetch();
          }}
        />
      ) : (
        <div className={cn("space-y-8", loading && "opacity-60")}>
          {FLOOR_TRIAL_SECTIONS.map((section) => {
            const list = bySection.get(section)!;
            const headingId = `floor-trials-${section}`;
            return (
              <section key={section} aria-labelledby={headingId} className="space-y-3">
                <h2 id={headingId} className="text-base font-semibold">
                  {SECTION_TEXT[section].title}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{list.length}</span>
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{SECTION_TEXT[section].empty}</p>
                ) : (
                  /* Same card grid as the events list: one column on mobile,
                     two from sm, three from lg. The cards carry a resting
                     border and surface rather than only showing their edges
                     on hover — in a grid the boundary between neighbouring
                     cards has to be visible without the cursor. */
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((s) => {
                      const event = s.event_id ? eventById.get(s.event_id) : undefined;
                      return (
                        <SessionCard
                          key={s.id}
                          session={s}
                          eventName={event?.name ?? null}
                          eventTz={event?.timezone ?? null}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {nothingListed && (
            <p className="text-sm text-muted-foreground text-center">
              <Link to="/how-it-works/floor-trials" className="text-primary underline underline-offset-2">
                Learn when sessions appear →
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
