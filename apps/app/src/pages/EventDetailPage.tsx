import { SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { ApiEvent, ApiEventDivisionEntities, ApiSession } from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICKABLE_CARD_CLASS } from "@/lib/clickable";
import { countFloorTrials, floorTrialBucket, formatFloorTrials } from "@/lib/floorTrials";
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr } from "@/lib/sessionFormat";
import { compareSessionChrono } from "@/lib/chronoSort";
import { cn } from "@/lib/utils";

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

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApiClient();
  const { isSignedIn } = useAuth();
  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [sessions, setSessions] = useState<ApiSession[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get<ApiEvent>(`/v1/events/${id}`),
      api.get<ApiSession[]>(`/v1/sessions?event_id=${encodeURIComponent(id)}`),
    ])
      .then(([ev, sess]) => {
        setEvent(ev);
        setSessions(sess);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api, id]);

  if (!id) {
    return <p className="text-muted-foreground">Missing event id.</p>;
  }

  if (loading && !event) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!event) {
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
          </div>
          <div className="flex items-center gap-2">
            {event.status === "upcoming" && <Badge variant="default">upcoming</Badge>}
            {event.status === "active" && (
              <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
                active
              </Badge>
            )}
            {event.status === "completed" && <Badge variant="secondary">completed</Badge>}
            {event.status === "cancelled" && <Badge variant="destructive">cancelled</Badge>}
            {!["upcoming", "active", "completed", "cancelled"].includes(event.status) && (
              <Badge variant="outline">{event.status}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-base font-semibold">
          Sessions
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
                {sessionStatusBadge(sess.status)}
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

      <EnteredEntities eventId={id} isSignedIn={Boolean(isSignedIn)} />
    </div>
  );
}

/**
 * "1 entry · 2 songs" — both counts, always, because they diverge whenever a
 * competitor has more than one song in a division. A bare number next to a
 * division would read as either one depending on the reader.
 */
function countsLabel(entryCount: number, songCount: number): string {
  const entries = `${entryCount} ${entryCount === 1 ? "entry" : "entries"}`;
  const songs = `${songCount} ${songCount === 1 ? "song" : "songs"}`;
  return `${entries} · ${songs}`;
}

/**
 * Who has music in for this event, grouped by division.
 *
 * Laid out like the manager Event Songs view — collapsible division sections,
 * one row per competitor — but where that view names the song, this one shows
 * only a count. Multiple songs from the same entity in the same division are
 * one row: enough to see the field, never enough to learn a routine.
 */
function EnteredEntities({ eventId, isSignedIn }: { eventId: string; isSignedIn: boolean }) {
  const api = useApiClient();
  const [divisions, setDivisions] = useState<ApiEventDivisionEntities[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleDivision = (division: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(division)) next.delete(division);
      else next.add(division);
      return next;
    });

  useEffect(() => {
    // The endpoint is requireAuth — signed out there is nothing to fetch, and a
    // 401 toast would be noise on a page that otherwise renders fine.
    if (!isSignedIn) {
      setDivisions(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<ApiEventDivisionEntities[]>(`/v1/events/${encodeURIComponent(eventId)}/entities`)
      .then((rows) => {
        if (!cancelled) setDivisions(rows);
      })
      .catch((e: Error) => {
        if (!cancelled) toast.error(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, eventId, isSignedIn]);

  // An entity entered in two divisions is two rows but one competitor, so the
  // heading counts distinct entities rather than summing the section counts.
  // Songs do sum: the same couple's Classic and Masters songs are both songs.
  const totals =
    divisions === null
      ? null
      : {
          entries: new Set(divisions.flatMap((d) => d.entities.map((e) => e.entity_key))).size,
          songs: divisions.reduce(
            (sum, d) => sum + d.entities.reduce((n, e) => n + e.song_count, 0),
            0
          ),
        };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">
        Entered
        {totals !== null && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {countsLabel(totals.entries, totals.songs)}
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
        {loading && divisions === null && <Skeleton className="h-24 w-full" />}
        {divisions?.length === 0 && (
          <p className="text-sm text-muted-foreground">No music submitted for this event yet.</p>
        )}
        {divisions && divisions.length > 0 && (
          <div className={cn("space-y-6", loading && "opacity-60")}>
            {divisions.map(({ division, entities }) => {
              const isCollapsed = collapsed.has(division);
              return (
                <section key={division} className="space-y-2">
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
                    <span className="text-xs font-normal text-muted-foreground/70">
                      {countsLabel(
                        entities.length,
                        entities.reduce((n, e) => n + e.song_count, 0)
                      )}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-2">
                      {entities.map((entity) => (
                        <div
                          key={entity.entity_key}
                          className="flex items-baseline justify-between gap-4 rounded-lg bg-white/[0.06] px-4 py-3 text-sm"
                        >
                          <span className="font-medium min-w-0 truncate">{entity.label}</span>
                          <span className="text-muted-foreground text-right shrink-0">
                            {entity.song_count} {entity.song_count === 1 ? "song" : "songs"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </SignedIn>
    </div>
  );
}
