import { SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/clerk-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import SessionCard from "@/components/SessionCard";
import SubmissionTimelineChart from "@/components/staff/SubmissionTimelineChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMe } from "@/hooks/useAuthMe";
import { useDivisions } from "@/hooks/useDivisions";
import { useEventSlugs } from "@/hooks/useEventSlugs";
import { EVENT_ROLE_LABELS, eventPortalPath, richestEventRole } from "@/lib/eventRoles";
import {
  likelyOnFile,
  missingByDivision,
  percentComplete,
  progressByDivision,
  reconcileRegistrations,
  registrationName,
  sameLabel,
  type MissingCount,
  type Progress,
  type ReconciledRegistration,
} from "@/lib/eventRegistrations";
import { eventPagePath, looksLikeEventId, resolveEventSegment } from "@/lib/eventSlug";
import { countFloorTrials, floorTrialBucket, formatFloorTrials } from "@/lib/floorTrials";
import { compareSessionChrono } from "@/lib/chronoSort";
import { buildTimelineChart } from "@/lib/submissionTimeline";
import { cn } from "@/lib/utils";
import { isOpenEvent } from "@/schemas";

/**
 * The event a URL segment names, and whether it is still being worked out.
 * The segment is a readable slug (lib/eventSlug) or the event's id: an id
 * is used at once; anything else waits for the event list, and is used as
 * an id when no event has it as its slug (or the list cannot load).
 */
function useEventFromSegment(segment: string | undefined) {
  const { slugs, loading } = useEventSlugs();
  if (!segment) return { eventId: null, slugs, resolving: false };
  if (looksLikeEventId(segment)) return { eventId: segment, slugs, resolving: false };
  if (loading) return { eventId: null, slugs, resolving: true };
  const eventId = (slugs && resolveEventSegment(segment, slugs)) ?? segment;
  return { eventId, slugs, resolving: false };
}

export default function EventDetailPage() {
  const { id: segment } = useParams<{ id: string }>();
  const { isSignedIn } = useAuth();
  const { eventId: id, slugs, resolving } = useEventFromSegment(segment);
  const navigate = useNavigate();
  const location = useLocation();

  // An event opened by id (or by an older slug) moves to its readable URL,
  // in place, so the address bar and anything shared from it read well.
  useEffect(() => {
    if (!id || !slugs) return;
    const slug = slugs.get(id);
    if (slug && slug !== segment) {
      navigate(`${eventPagePath(id, slugs)}${location.search}${location.hash}`, { replace: true });
    }
  }, [id, slugs, segment, navigate, location.search, location.hash]);

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

  if (!segment) {
    return <p className="text-muted-foreground">Missing event id.</p>;
  }

  if (resolving || !id || eventQuery.isLoading) {
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
      <Button variant="ghost" size="sm" className="-mb-4 px-0" asChild>
        <Link to="/events">← Events</Link>
      </Button>
      {/* The event's name, dates and status stay in view while the page
          scrolls, just under the site header (whose height NavBar keeps in
          --app-header-height: it grows with the staff and admin bars). A
          direct child of the page's own container: a sticky element sticks
          only within its parent, so inside a small wrapper it would scroll
          away with it. */}
      <div
        data-testid="event-header"
        className="sticky z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 border-b border-white/[0.07] bg-background/90 backdrop-blur-md"
        style={{ top: "var(--app-header-height, 3.5rem)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h1 className="page-title text-2xl leading-tight">{event.name}</h1>
            <p className="text-sm text-muted-foreground">
              {event.start_date === event.end_date
                ? event.start_date
                : `${event.start_date} – ${event.end_date}`}
            </p>
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
      <PortalLinks eventId={event.id} />

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
            <SessionCard key={sess.id} session={sess} eventTz={event.timezone} />
          ))}
        </div>
      </div>

      <SubmissionTimeline eventId={id} isSignedIn={Boolean(isSignedIn)} />

      <EnteredEntities
        eventId={id}
        eventName={event.name}
        isSignedIn={Boolean(isSignedIn)}
        signInPath={location.pathname}
      />
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
    <p className="-mt-3 text-sm">
      <Link to={eventPortalPath(eventId, own)} className="text-primary hover:underline">
        Open your {EVENT_ROLE_LABELS[own]} portal →
      </Link>
    </p>
  );
}

/**
 * Admins and this event's staff only: how much of the event's music is in,
 * day by day to the start, against earlier editions of its series (the
 * event's series is set on the admin Events page). Nothing for anyone else,
 * or while there is nothing to draw.
 */
function SubmissionTimeline({ eventId, isSignedIn }: { eventId: string; isSignedIn: boolean }) {
  const { isAdmin, eventRoles } = useAuthMe();
  const ready = isSignedIn && (isAdmin || richestEventRole(eventRoles, eventId) !== null);
  const timelineQuery = useEndpointQuery(endpoints.events.submissionTimeline, {
    params: { id: eventId },
    enabled: ready,
  });
  const timeline = ready ? timelineQuery.data : undefined;
  const chart = useMemo(() => (timeline ? buildTimelineChart(timeline) : null), [timeline]);
  if (!ready) return null;
  if (timelineQuery.error && !timeline) {
    return (
      <QueryError
        what="the submissions chart"
        error={timelineQuery.error}
        onRetry={() => void timelineQuery.refetch()}
      />
    );
  }
  if (!chart || !timeline || timeline.events.every((e) => e.submissions === 0)) return null;
  const earlier = chart.curves.length - 1;
  return (
    <section className="space-y-3" aria-labelledby="submission-timeline-heading">
      <h2 id="submission-timeline-heading" className="text-base font-semibold">
        Music submissions
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {chart.unit === "percent" ? "share of registrations" : "entries"} by day
          {earlier > 0 && ` · against ${earlier === 1 ? "last edition" : `${earlier} earlier editions`}`}
        </span>
      </h2>
      <SubmissionTimelineChart chart={chart} />
    </section>
  );
}

/** A registered entry still without its music, named for the event's staff. */
type Outstanding = {
  key: string;
  /** The entry's dancers as the registration list has them. */
  name: string;
  status: "missing" | "possible" | "missing-round";
  /** For "missing-round": the round with no song yet. */
  missingRound?: "prelims" | "finals";
  /** For "missing-round": the labels of the songs it has in, to mark its entered row. */
  labels: string[];
  /** Admins only: no music in, but likely has a song on file. */
  onFile: boolean;
};

type RegistrationCounts = {
  missing: ReadonlyMap<string | null, MissingCount>;
  /** Null when the counts are not shown: not staff, or no registration list. */
  progress: ReadonlyMap<string | null, Progress> | null;
  /** Entries still without music, by deejaytools division (null: not recognised). */
  outstanding: ReadonlyMap<string | null, Outstanding[]>;
};

const NO_COUNTS: RegistrationCounts = { missing: new Map(), progress: null, outstanding: new Map() };

function outstandingByDivision(
  rows: readonly ReconciledRegistration[],
  onFile: ReadonlyMap<string, unknown>
): Map<string | null, Outstanding[]> {
  const byDivision = new Map<string | null, Outstanding[]>();
  for (const r of rows) {
    if (r.status !== "missing" && r.status !== "possible" && r.status !== "missing-round") continue;
    const list = byDivision.get(r.division) ?? [];
    list.push({
      key: r.entry.id,
      name: registrationName(r.entry),
      status: r.status,
      ...(r.missingRound ? { missingRound: r.missingRound } : {}),
      labels: r.status === "missing-round" ? r.matches.map((m) => m.partnership_label) : [],
      onFile: onFile.has(r.entry.id),
    });
    byDivision.set(r.division, list);
  }
  return byDivision;
}

/**
 * Admins and this event's staff only: who on the event's registration list
 * (imported on the Registrations page) has no music in yet, per division,
 * and how far each division is from all having it, against the event's
 * submissions. Empty for everyone else, and for an event with no
 * registration list. Admins (not an admin viewing as a staff role) also get
 * which of those entries likely have a song on file.
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
  const songsOnFileQuery = useEndpointQuery(endpoints.admin.registrationSongsOnFile, {
    params: { eventId },
    enabled: enabled && isAdmin,
  });
  const { divisions } = useDivisions();
  const songsOnFile = enabled && isAdmin ? songsOnFileQuery.data : undefined;
  const registrations = ready ? registrationsQuery.data : undefined;
  const submissions = ready ? submissionsQuery.data : undefined;
  const roundsSplit = isOpenEvent(eventName);
  return useMemo(() => {
    if (!registrations || !submissions || registrations.length === 0) return NO_COUNTS;
    const { rows, unregistered } = reconcileRegistrations(registrations, submissions, divisions, roundsSplit);
    const onFile = likelyOnFile(rows, songsOnFile ?? []);
    return {
      missing: missingByDivision(rows, onFile),
      progress: progressByDivision(rows, unregistered),
      outstanding: outstandingByDivision(rows, onFile),
    };
  }, [registrations, submissions, songsOnFile, divisions, roundsSplit]);
}

/**
 * " · 21 total · 75% complete": the entries still competing on the
 * registration list plus those with music in that are not on it, and the
 * share of them with music in. Nothing when it is
 * not shown or has nothing to count.
 */
function ProgressLabel({ progress }: { progress: Progress | undefined }) {
  const percent = percentComplete(progress);
  if (!progress || percent === null) return null;
  return <>{` · ${progress.total} total · ${percent}% complete`}</>;
}

/** " · 2 missing · 1 possible · 1 likely on file", or nothing when nothing is outstanding. */
function MissingLabel({ count }: { count: MissingCount | undefined }) {
  if (!count) return null;
  return (
    <>
      {count.missing > 0 && <span className="text-destructive"> · {count.missing} missing</span>}
      {count.possible > 0 && <span className="text-amber-500 dark:text-amber-300"> · {count.possible} possible</span>}
      {count.onFile > 0 && <span className="text-sky-600 dark:text-sky-300"> · {count.onFile} likely on file</span>}
    </>
  );
}

const OUTSTANDING_BADGE: Record<Outstanding["status"], { label: (o: Outstanding) => string; className: string }> = {
  missing: { label: () => "Missing music", className: "border-destructive/50 text-destructive" },
  "missing-round": {
    label: (o) => (o.missingRound === "prelims" ? "Prelims missing" : "Finals missing"),
    className: "border-destructive/50 text-destructive",
  },
  possible: { label: () => "Possible match", className: "border-amber-500/50 text-amber-500 dark:text-amber-300" },
};

function OutstandingBadge({ entry }: { entry: Outstanding }) {
  const badge = OUTSTANDING_BADGE[entry.status];
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1">
      <Badge variant="outline" className={cn("text-xs font-normal", badge.className)}>
        {badge.label(entry)}
      </Badge>
      {entry.onFile && (
        <Badge variant="outline" className="text-xs font-normal border-sky-500/50 text-sky-600 dark:text-sky-300">
          Likely on file
        </Badge>
      )}
    </span>
  );
}

/** One row of a division's list: an entered competitor, or a registered one still missing music. */
type DivisionRow =
  | { kind: "entered"; key: string; label: string; flag?: Outstanding }
  | { kind: "outstanding"; key: string; label: string; entry: Outstanding };

/**
 * A division's rows, by name: everyone entered, and for the event's staff
 * everyone registered whose music is not in yet. An entry with only one of
 * its rounds in is its entered row, marked with the round still to come.
 */
function divisionRows(
  entities: readonly { entity_key: string; label: string }[],
  outstanding: readonly Outstanding[]
): DivisionRow[] {
  const flagged = new Set<string>();
  const rows: DivisionRow[] = entities.map((e) => {
    const flag = outstanding.find(
      (o) => o.status === "missing-round" && !flagged.has(o.key) && o.labels.some((l) => sameLabel(l, e.label))
    );
    if (flag) flagged.add(flag.key);
    return { kind: "entered", key: e.entity_key, label: e.label, ...(flag ? { flag } : {}) };
  });
  for (const o of outstanding) {
    if (!flagged.has(o.key)) rows.push({ kind: "outstanding", key: `reg:${o.key}`, label: o.name, entry: o });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/**
 * Who has music in for this event, grouped by division.
 *
 * Laid out like the manager Event Songs view — collapsible division sections,
 * one row per competitor — but where that view names the song, this one names
 * only the competitor. Multiple songs from the same entity in the same
 * division are one row: enough to see the field, never enough to learn a
 * routine. The event's staff (and admins) also see everyone on the
 * registration list still without music, by name, marked as missing.
 */
function EnteredEntities({
  eventId,
  eventName,
  isSignedIn,
  signInPath,
}: {
  eventId: string;
  eventName: string;
  isSignedIn: boolean;
  signInPath: string;
}) {
  // The endpoint is requireAuth — signed out there is nothing to fetch.
  const entitiesQuery = useEndpointQuery(endpoints.events.entities, {
    params: { id: eventId },
    enabled: isSignedIn,
  });
  const entered = isSignedIn ? (entitiesQuery.data ?? null) : null;
  const loading = entitiesQuery.isFetching;
  const { missing, progress, outstanding } = useMissingCounts(eventId, eventName, isSignedIn);
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
    (t, c) => ({ missing: t.missing + c.missing, possible: t.possible + c.possible, onFile: t.onFile + c.onFile }),
    { missing: 0, possible: 0, onFile: 0 }
  );
  // Divisions start collapsed: the headers' counts are the overview, and a
  // division opens to its rows.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allDivisions = divisions?.map((d) => d.division) ?? [];
  const allExpanded = allDivisions.length > 0 && allDivisions.every((d) => expanded.has(d));
  const noneExpanded = allDivisions.every((d) => !expanded.has(d));

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

  const unrecognisedNames = outstanding.get(null) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        {isSignedIn && allDivisions.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={allExpanded}
              onClick={() => setExpanded(new Set(allDivisions))}
            >
              Expand all
            </Button>
            <Button variant="outline" size="sm" disabled={noneExpanded} onClick={() => setExpanded(new Set())}>
              Collapse all
            </Button>
          </div>
        )}
      </div>

      <SignedOut>
        <div className="flex flex-wrap items-center gap-3">
          <SignInButton forceRedirectUrl={signInPath} signUpForceRedirectUrl={signInPath}>
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
              const rows = divisionRows(entities, outstanding.get(division) ?? []);
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
                  {!isCollapsed && rows.length === 0 && (
                    <p className="px-4 text-sm text-muted-foreground">Nothing submitted yet.</p>
                  )}
                  {!isCollapsed && rows.length > 0 && (
                    <div className="space-y-2">
                      {rows.map((row) => {
                        const flag = row.kind === "outstanding" ? row.entry : row.flag;
                        return (
                          <div
                            key={row.key}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm",
                              row.kind === "outstanding"
                                ? "border border-dashed border-white/15 bg-transparent"
                                : "bg-white/[0.06]"
                            )}
                          >
                            <span
                              className={cn(
                                "block min-w-0 truncate font-medium",
                                row.kind === "outstanding" && "text-muted-foreground"
                              )}
                            >
                              {row.label}
                            </span>
                            {flag && <OutstandingBadge entry={flag} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
            {unrecognised && (
              <div className="mb-6 break-inside-avoid space-y-2">
                <p className="text-xs text-muted-foreground">
                  Registrations in divisions not recognised
                  <ProgressLabel progress={progress?.get(null)} />
                  <MissingLabel count={unrecognised} />
                </p>
                {unrecognisedNames.length > 0 && (
                  <ul className="space-y-1">
                    {unrecognisedNames.map((o) => (
                      <li key={o.key} className="flex items-center justify-between gap-2 px-4 text-sm text-muted-foreground">
                        <span className="min-w-0 truncate">{o.name}</span>
                        <OutstandingBadge entry={o} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </SignedIn>
    </div>
  );
}
