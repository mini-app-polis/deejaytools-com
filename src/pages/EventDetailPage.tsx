import { SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/clerk-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import SessionStatusBadge from "@/components/SessionStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMe } from "@/hooks/useAuthMe";
import { useDivisions } from "@/hooks/useDivisions";
import { CLICKABLE_CARD_CLASS } from "@/lib/clickable";
import { EVENT_ROLE_LABELS, eventPortalPath, richestEventRole } from "@/lib/eventRoles";
import {
  missingByDivision,
  percentComplete,
  progressByDivision,
  reconcileRegistrations,
  type MissingCount,
  type Progress,
} from "@/lib/eventRegistrations";
import { countFloorTrials, floorTrialBucket, formatFloorTrials } from "@/lib/floorTrials";
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr } from "@/lib/sessionFormat";
import { compareSessionChrono } from "@/lib/chronoSort";
import { cn } from "@/lib/utils";
import { isOpenEvent } from "@/schemas";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isSignedIn } = useAuth();

  // The event and its sessions load independently: a sessions failure keeps
  // the event on screen and shows the error in the sessions section. Each is
  // keyed by :id, so another event's details never show under this URL.
  const eventQuery = useEndpointQuery(endpoints.events.get, { params: { id: id ?? "" }, enabled: !!id });
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list, {
    params: { eventId: id ?? "" },
    enabled: !!id,
  });
  const event = eventQuery.data ?? null;
  const sessions = sessionsQuery.data ?? null;
  const sessionsError = sessionsQuery.error && !sessions ? sessionsQuery.error.message : null;
  const loading = eventQuery.isFetching || sessionsQuery.isFetching;

  if (!id) {
    return <p className="text-muted-foreground">Missing event id.</p>;
  }

  if (eventQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!event) {
    // An ApiError carries the HTTP status; a 404 is an answer, not a failure.
    const notFound = (eventQuery.error as { status?: number } | null)?.status === 404;
    if (eventQuery.error && !notFound) {
      return <QueryError what="the event" error={eventQuery.error} onRetry={() => void eventQuery.refetch()} />;
    }
    return <p className="text-muted-foreground">Event not found.</p>;
  }

  const trialCounts = countFloorTrials(sessions ?? []);
  const listedSessions = sessions
    ?.filter((sess) => {
      const bucket = floorTrialBucket(sess.status);
      return bucket === "active" || bucket === "upcoming";
    })
    .sort(compareSessionChrono);

  return (
    <div className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
      <div>
        <Button variant="ghost" size="sm" className="mb-2 px-0" asChild>
          <Link to="/events">← Events</Link>
        </Button>
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="page-title text-2xl">{event.name}</h1>
            <p className="text-sm text-muted-foreground">
              {event.start_date === event.end_date
                ? event.start_date
                : `${event.start_date} – ${event.end_date}`}
            </p>
            <PortalLinks eventId={event.id} />
          </div>
          <div className="flex items-center gap-2">
            {event.status === "upcoming" && <Badge variant="default">upcoming</Badge>}
            {event.status === "active" && (
              <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
                active
              </Badge>
            )}
            {event.status === "completed" && <Badge variant="secondary">completed</Badge>}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-base font-semibold">
          Sessions{" "}
          {sessions !== null && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {formatFloorTrials(trialCounts)}
            </span>
          )}
        </h2>
        {/* Only what a competitor can still turn up to is listed — the same rule
            as the Floor Trials page. Completed and cancelled trials stay in the
            heading's tally so the schedule is not silently understated, but
            they are not cards anyone can act on. */}
        {sessionsError !== null && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load this event&apos;s sessions: {sessionsError}
          </p>
        )}
        {listedSessions?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {sessions && sessions.length > 0
              ? "No upcoming sessions for this event."
              : "No sessions for this event."}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listedSessions?.map((sess) => (
            // Whole-card click target — same card treatment as FloorTrialsPage.
            // The inner "Open session →" line stays as a visual affordance.
            <Link
              key={sess.id}
              to={`/sessions/${sess.id}`}
              className={cn(
                "flex h-full flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm",
                CLICKABLE_CARD_CLASS
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <SessionStatusBadge status={sess.status} />
              </div>
              <p className="flex flex-wrap items-center gap-2 font-medium text-base leading-snug transition-colors group-hover:text-primary">
                {formatSessionTitle(sess, event.timezone)}
                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                  {formatTimezoneAbbr(event.timezone, sess.floor_trial_starts_at)}
                </Badge>
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Check-in opens: {formatTimeOnly(sess.checkin_opens_at, event.timezone)}</p>
                <p>
                  Floor trial: {formatTimeOnly(sess.floor_trial_starts_at, event.timezone)} –{" "}
                  {formatTimeOnly(sess.floor_trial_ends_at, event.timezone)}
                </p>
              </div>
              <div className="mt-auto pt-1">
                <Separator className="mb-2" />
                <p className="text-sm font-medium text-primary">Open session →</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <EnteredEntities eventId={id} eventName={event.name} isSignedIn={Boolean(isSignedIn)} />
    </div>
  );
}

/** "1 entry" or "3 entries": the page counts couples, not their songs. */
function entriesLabel(entryCount: number): string {
  return `${entryCount} ${entryCount === 1 ? "entry" : "entries"}`;
}

/**
 * The event's staff get a link to their own portal here. An admin opens any
 * portal from the view-as row under the Admin bar instead.
 */
function PortalLinks({ eventId }: { eventId: string }) {
  const { eventRoles } = useAuthMe();
  const own = richestEventRole(eventRoles, eventId);
  if (!own) return null;
  return (
    <p className="mt-1 text-sm">
      <Link to={eventPortalPath(eventId, own)} className="text-primary hover:underline">
        Open your {EVENT_ROLE_LABELS[own]} portal →
      </Link>
    </p>
  );
}

type RegistrationCounts = {
  missing: ReadonlyMap<string | null, MissingCount>;
  /** Null when the counts are not shown: not staff, or no registration list. */
  progress: ReadonlyMap<string | null, Progress> | null;
};

const NO_COUNTS: RegistrationCounts = { missing: new Map(), progress: null };

/**
 * Admins and this event's staff only: how many registered entries per
 * division have no music in yet, and how far each division is from all
 * having it, from the event's registration list (imported on the admin
 * Registrations page) against its submissions. Counts, never names. Empty
 * for everyone else, and for an event with no registration list.
 */
function useMissingCounts(eventId: string, eventName: string, enabled: boolean) {
  const { isAdmin, eventRoles } = useAuthMe();
  const ready = enabled && (isAdmin || richestEventRole(eventRoles, eventId) !== null);
  const registrationsQuery = useEndpointQuery(endpoints.events.registrations, {
    params: { id: eventId },
    enabled: ready,
  });
  const submissionsQuery = useEndpointQuery(endpoints.events.songSubmissions, {
    params: { id: eventId },
    enabled: ready,
  });
  const { divisions } = useDivisions();
  const registrations = ready ? registrationsQuery.data : undefined;
  const submissions = ready ? submissionsQuery.data : undefined;
  const roundsSplit = isOpenEvent(eventName);
  return useMemo(() => {
    if (!registrations || !submissions || registrations.length === 0) return NO_COUNTS;
    const { rows } = reconcileRegistrations(registrations, submissions, divisions, roundsSplit);
    return { missing: missingByDivision(rows), progress: progressByDivision(rows) };
  }, [registrations, submissions, divisions, roundsSplit]);
}

/**
 * " · 21 total · 75% complete": the entries still competing on the
 * registration list, and the share of them with music in. Nothing when it is
 * not shown or has nothing to count.
 */
function ProgressLabel({ progress }: { progress: Progress | undefined }) {
  const percent = percentComplete(progress);
  if (!progress || percent === null) return null;
  return <>{` · ${progress.total} total · ${percent}% complete`}</>;
}

/** " · 2 missing · 1 possible", or nothing when nothing is outstanding. */
function MissingLabel({ count }: { count: MissingCount | undefined }) {
  if (!count) return null;
  return (
    <>
      {count.missing > 0 && <span className="text-destructive"> · {count.missing} missing</span>}
      {count.possible > 0 && <span className="text-amber-500 dark:text-amber-300"> · {count.possible} possible</span>}
    </>
  );
}

/**
 * Who has music in for this event, grouped by division.
 *
 * Laid out like the manager Event Songs view — collapsible division sections,
 * one row per competitor — but where that view names the song, this one names
 * only the competitor. Multiple songs from the same entity in the same
 * division are one row: enough to see the field, never enough to learn a
 * routine.
 */
function EnteredEntities({
  eventId,
  eventName,
  isSignedIn,
}: {
  eventId: string;
  eventName: string;
  isSignedIn: boolean;
}) {
  // The endpoint is requireAuth — signed out there is nothing to fetch.
  const entitiesQuery = useEndpointQuery(endpoints.events.entities, {
    params: { id: eventId },
    enabled: isSignedIn,
  });
  const entered = isSignedIn ? (entitiesQuery.data ?? null) : null;
  const loading = entitiesQuery.isFetching;
  const { missing, progress } = useMissingCounts(eventId, eventName, isSignedIn);
  const { divisions: divisionOrder } = useDivisions();

  // Divisions on the registration list are listed even when nobody in them
  // has submitted yet, in the divisions' display order.
  const divisions = useMemo(() => {
    if (entered === null) return null;
    const known = new Set(entered.map((d) => d.division));
    const listed = new Set([...missing.keys(), ...(progress?.keys() ?? [])]);
    const extra = [...listed]
      .filter((d): d is string => d !== null && !known.has(d))
      .map((division) => ({ division, entities: [] as (typeof entered)[number]["entities"] }));
    if (extra.length === 0) return entered;
    const rank = (d: string) => {
      const i = divisionOrder.indexOf(d);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...entered, ...extra].sort((a, b) => rank(a.division) - rank(b.division));
  }, [entered, missing, progress, divisionOrder]);
  const unrecognised = missing.get(null);
  const missingTotal = [...missing.values()].reduce(
    (t, c) => ({ missing: t.missing + c.missing, possible: t.possible + c.possible }),
    { missing: 0, possible: 0 }
  );
  // Divisions start collapsed: the headers' counts are the overview, and a
  // division opens to its rows.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleDivision = (division: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(division)) next.delete(division);
      else next.add(division);
      return next;
    });

  // An entity entered in two divisions is two rows but one competitor, so the
  // heading counts distinct entities rather than summing the section counts.
  const totalEntries =
    divisions === null
      ? null
      : new Set(divisions.flatMap((d) => d.entities.map((e) => e.entity_key))).size;
  // Registrations are per division, so the event's progress sums them.
  const progressTotal =
    progress === null
      ? undefined
      : [...progress.values()].reduce(
          (t, p) => ({ complete: t.complete + p.complete, total: t.total + p.total }),
          { complete: 0, total: 0 }
        );

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">
        Entered{" "}
        {totalEntries !== null && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {entriesLabel(totalEntries)}
            <ProgressLabel progress={progressTotal} />
            <MissingLabel count={missingTotal} />
          </span>
        )}
      </h2>

      <SignedOut>
        <div className="flex flex-wrap items-center gap-3">
          <SignInButton
            forceRedirectUrl={`/events/${eventId}`}
            signUpForceRedirectUrl={`/events/${eventId}`}
          >
            <Button size="sm">Sign in to see who&apos;s entered</Button>
          </SignInButton>
          <p className="text-sm text-muted-foreground">
            The entry list is visible to signed-in competitors.
          </p>
        </div>
      </SignedOut>

      <SignedIn>
        {entitiesQuery.error && divisions === null && (
          <QueryError
            what="who's entered"
            error={entitiesQuery.error}
            onRetry={() => void entitiesQuery.refetch()}
          />
        )}
        {loading && divisions === null && <Skeleton className="h-24 w-full" />}
        {divisions?.length === 0 && (
          <p className="text-sm text-muted-foreground">No music submitted for this event yet.</p>
        )}
        {divisions && divisions.length > 0 && (
          // Two columns from md up. CSS columns rather than a grid so a long
          // division does not leave a gap beside a short one.
          <div className={cn("md:columns-2 md:gap-6", loading && "opacity-60")}>
            {divisions.map(({ division, entities }) => {
              const isCollapsed = !expanded.has(division);
              return (
                <section key={division} className="mb-6 space-y-2 break-inside-avoid">
                  <button
                    type="button"
                    onClick={() => toggleDivision(division)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <span
                      className={cn(
                        "text-[10px] text-muted-foreground transition-transform",
                        isCollapsed ? "" : "rotate-90"
                      )}
                    >
                      ▶
                    </span>
                    <span className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                      {division}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {entriesLabel(entities.length)}
                      <ProgressLabel progress={progress?.get(division)} />
                      <MissingLabel count={missing.get(division)} />
                    </span>
                  </button>
                  {!isCollapsed && entities.length === 0 && (
                    <p className="px-4 text-sm text-muted-foreground">Nothing submitted yet.</p>
                  )}
                  {!isCollapsed && entities.length > 0 && (
                    <div className="space-y-2">
                      {entities.map((entity) => (
                        <div
                          key={entity.entity_key}
                          className="rounded-lg bg-white/[0.06] px-4 py-3 text-sm"
                        >
                          <span className="block font-medium min-w-0 truncate">{entity.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            {unrecognised && (
              <p className="mb-6 break-inside-avoid text-xs text-muted-foreground">
                Registrations in divisions not recognised
                <ProgressLabel progress={progress?.get(null)} />
                <MissingLabel count={unrecognised} />
              </p>
            )}
          </div>
        )}
      </SignedIn>
    </div>
  );
}
