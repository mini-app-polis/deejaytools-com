import type { ApiEventSongSubmission, ApiMyCheckin } from "@/schemas";
import { isOpenEvent } from "@/schemas";
import { songLabel, songPieces } from "@/lib/songLabel";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { compareEventChrono } from "@/lib/chronoSort";
import { formatSessionTitle, formatTimeOnly } from "@/lib/sessionFormat";

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

function sessionStatusBadge(status: string) {
  if (status === "checkin_open") return <Badge variant="default">check-in open</Badge>;
  if (status === "in_progress")
    return (
      <Badge className="bg-primary text-primary-foreground border-transparent">in progress</Badge>
    );
  return <Badge variant="outline">{status}</Badge>;
}

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

// A stable empty list while a query has no data, so memos over it hold.
const NO_ROWS: readonly never[] = [];

export default function MyContentPage() {
  const { hash } = useLocation();

  // Deep links such as /my-content#checkins arrive from the help pages. This page is
  // one scrolling document (no tabs), so scroll the matching section into view.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [hash]);

  // ── Songs ────────────────────────────────────────────────────────────────────
  const songsQuery = useEndpointQuery(endpoints.songs.list);
  const songs = songsQuery.data ?? NO_ROWS;
  const songsLoading = songsQuery.isFetching;
  const [pendingDeleteSongId, setPendingDeleteSongId] = useState<string | null>(null);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const removeSong = useEndpointMutation(endpoints.songs.remove, {
    invalidates: [endpoints.songs.list, endpoints.eventSongSubmissions.list],
  });

  // ── Check-ins ────────────────────────────────────────────────────────────────
  const checkinsQuery = useEndpointQuery(endpoints.checkins.mine);
  const checkins = checkinsQuery.data ?? null;
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [pendingWithdrawId, setPendingWithdrawId] = useState<string | null>(null);
  // Entries behind a withdrawn one move up, so positions and queues refetch.
  const withdrawCheckin = useEndpointMutation(endpoints.checkins.withdraw, {
    invalidates: [endpoints.checkins.mine, endpoints.queue.active, endpoints.queue.waiting],
  });

  // ── Events / submissions ─────────────────────────────────────────────────────
  const eventsQuery = useEndpointQuery(endpoints.events.list);
  const submissionsQuery = useEndpointQuery(endpoints.eventSongSubmissions.list);
  const availableEvents = useMemo(
    () => (eventsQuery.data ?? NO_ROWS).filter((e) => e.status !== "completed"),
    [eventsQuery.data]
  );
  const eventSubmissions = submissionsQuery.data ?? NO_ROWS;
  const eventsLoading = eventsQuery.isLoading || submissionsQuery.isLoading;
  const eventsError = eventsQuery.error ?? submissionsQuery.error;

  const sessionsQuery = useEndpointQuery(endpoints.sessions.list);
  const activeSessions = useMemo(
    () =>
      sessionsQuery.data?.filter((s) => s.status === "checkin_open" || s.status === "in_progress") ??
      null,
    [sessionsQuery.data]
  );

  const handleWithdraw = async (checkinId: string) => {
    setWithdrawingId(checkinId);
    try {
      await withdrawCheckin.mutateAsync({ params: { id: checkinId } });
      setPendingWithdrawId(null);
      toast.success("Withdrawn from queue.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to withdraw.");
      setPendingWithdrawId(null);
    } finally {
      setWithdrawingId(null);
    }
  };

  const submissionsByEventId = useMemo(() => {
    const map = new Map<string, ApiEventSongSubmission[]>();
    for (const s of eventSubmissions) {
      const list = map.get(s.event_id) ?? [];
      list.push(s);
      map.set(s.event_id, list);
    }
    return map;
  }, [eventSubmissions]);

  const sortedAvailableEvents = useMemo(
    () => availableEvents.slice().sort(compareEventChrono),
    [availableEvents]
  );

  const eventsWithSongs = useMemo(
    () => sortedAvailableEvents.filter((e) => (submissionsByEventId.get(e.id)?.length ?? 0) > 0),
    [sortedAvailableEvents, submissionsByEventId]
  );

  // A shortcut to The Open's submission page while it is accepting songs. With
  // more than one Open event, /open-submissions forwards to the picker.
  const openSubmissionsHref = useMemo(() => {
    const open = availableEvents.filter((e) => isOpenEvent(e.name));
    if (open.length === 0) return null;
    return open.length === 1 ? `/event-submissions/${open[0].id}` : "/open-submissions";
  }, [availableEvents]);

  const eventNameById = useMemo(
    () => new Map(availableEvents.map((e) => [e.id, e.name])),
    [availableEvents]
  );

  const sortedActiveSessions = useMemo(
    () =>
      (activeSessions ?? [])
        .slice()
        .sort((a, b) => a.floor_trial_starts_at - b.floor_trial_starts_at),
    [activeSessions]
  );

  // ── Songs actions ─────────────────────────────────────────────────────────────

  const handleDeleteSong = async (id: string) => {
    setDeletingSongId(id);
    try {
      await removeSong.mutateAsync({ params: { id } });
      setPendingDeleteSongId(null);
      toast.success("Song removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete song.");
      setPendingDeleteSongId(null);
    } finally {
      setDeletingSongId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">My Content</h1>

      {sessionsQuery.error && !sessionsQuery.data && (
        <QueryError
          what="active floor trials"
          error={sessionsQuery.error}
          onRetry={() => void sessionsQuery.refetch()}
        />
      )}

      {checkinsQuery.error && !checkinsQuery.data && (
        <QueryError what="your check-ins" error={checkinsQuery.error} onRetry={() => void checkinsQuery.refetch()} />
      )}

      {sortedActiveSessions.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-3 border-b">
            <h2 id="active-floor-trials" className="font-semibold scroll-mt-24">
              Active Floor Trials
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {sortedActiveSessions.map((s) => {
              const eventName = s.event_id ? eventNameById.get(s.event_id) ?? null : null;
              return (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
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
                    <p className="font-medium text-sm">
                      {formatSessionTitle(s, s.event_timezone)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Floor trial: {formatTimeOnly(s.floor_trial_starts_at, s.event_timezone)} –{" "}
                      {formatTimeOnly(s.floor_trial_ends_at, s.event_timezone)}
                    </p>
                  </div>
                  <Button asChild size="sm" className="shrink-0 w-full sm:w-auto">
                    <Link to={`/sessions/${s.id}`}>Go To Session</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Check-ins section (only when checked in somewhere) ── */}
      {checkins && checkins.length > 0 && (
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
            <div className="space-y-3">
              {checkins.map((ci) => (
                <div key={ci.id} className="flex items-start gap-3">
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
                          onClick={() => setPendingWithdrawId(ci.id)}
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
                </div>
              ))}
            </div>
        </div>
      </div>
      )}

      {/* ── Events section ── */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
          <h2 id="events" className="font-semibold scroll-mt-24">
            Events
          </h2>
          <div className="flex flex-wrap justify-end gap-2">
            {openSubmissionsHref && (
              <Button size="sm" asChild>
                <Link to={openSubmissionsHref}>Submit to The Open</Link>
              </Button>
            )}
            <Button size="sm" asChild>
              <Link to="/event-submissions">Submit songs</Link>
            </Button>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {eventsError && !(eventsQuery.data && submissionsQuery.data) ? (
            <QueryError
              what="your event songs"
              error={eventsError}
              onRetry={() => {
                if (eventsQuery.error) void eventsQuery.refetch();
                if (submissionsQuery.error) void submissionsQuery.refetch();
              }}
            />
          ) : eventsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : eventsWithSongs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven&apos;t added songs to any events yet.{" "}
              <Link to="/event-submissions" className="underline">
                Submit songs to an event
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              {eventsWithSongs.map((event) => {
                const subs = submissionsByEventId.get(event.id) ?? [];
                return (
                  <div
                    key={event.id}
                    className="rounded-lg border-2 border-primary/40 bg-card px-4 py-3 text-sm space-y-2 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-medium">{event.name}</p>
                        <p className="text-xs text-muted-foreground">{event.start_date}</p>
                      </div>
                      {eventStatusBadge(event.status)}
                    </div>
                    <ul className="space-y-1 border-t border-border pt-2">
                      {subs.map((s) => (
                        <li key={s.id} className="text-sm">
                          <span className="font-medium">{s.song_label}</span>
                          {s.division && (
                            <span className="text-muted-foreground"> · {s.division}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-1">
                      {event.status === "active" && (
                        <Button asChild size="sm" className="w-full sm:w-auto">
                          <Link to={`/events/${event.id}`}>Go to event</Link>
                        </Button>
                      )}
                      <Button asChild size="sm" className="w-full sm:w-auto">
                        <Link to={`/event-submissions/${event.id}`}>Edit songs</Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Songs section ── */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
          <h2 id="songs" className="font-semibold scroll-mt-24">
            Songs
          </h2>
          <Button size="sm" asChild>
            <Link to="/songs/add">Add song</Link>
          </Button>
        </div>
        <div className="p-4 space-y-4">
          <div className={`space-y-3${songsLoading ? " opacity-60" : ""}`}>
            {songsLoading && songs.length === 0 && <Skeleton className="h-40 w-full" />}
            {songsQuery.error && !songsQuery.data && (
              <QueryError what="your songs" error={songsQuery.error} onRetry={() => void songsQuery.refetch()} />
            )}
            {songsQuery.data && songs.length === 0 && !songsLoading && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No songs yet.{" "}
                <Link to="/songs/add" className="underline">
                  Add a song
                </Link>
                .
              </p>
            )}
            {songs.map((s) => {
              const partnerName = s.partnership_label?.trim() || null;
              const driveUrl = s.drive_file_id
                ? `https://drive.google.com/file/d/${s.drive_file_id}/view`
                : null;
              // Legacy rows have no Drive file (and never will). Show a
              // disabled placeholder so the user understands this song is
              // metadata-only, not a playback link that's broken.
              const isLegacy = s.is_legacy;
              return (
                <div key={s.id} className="rounded-lg border-2 border-primary/40 bg-card p-4 space-y-2 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm leading-snug break-words flex-1">
                      {songLabel(s)}
                    </p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {s.shared_with_me && (
                    <Badge variant="outline">Shared with you</Badge>
                  )}
                  {s.original_filename?.trim() && (
                    <p className="font-mono text-xs text-muted-foreground leading-snug break-all">
                      <span className="text-muted-foreground text-xs not-italic">Uploaded: </span>
                      {s.original_filename}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {s.division && (
                      <span>
                        <span className="text-muted-foreground text-xs">Division </span>
                        {s.division}
                      </span>
                    )}
                    {partnerName && (
                      <span>
                        <span className="text-muted-foreground text-xs">Entered as </span>
                        {partnerName}
                      </span>
                    )}
                    {s.routine_name && (
                      <span>
                        <span className="text-muted-foreground text-xs">Routine </span>
                        {s.routine_name}
                      </span>
                    )}
                    {s.personal_descriptor && (
                      <span>
                        <span className="text-muted-foreground text-xs">Descriptor </span>
                        {s.personal_descriptor}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1">
                    {isLegacy ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled
                        title="This song was imported from the legacy catalog and has no uploaded audio file."
                      >
                        Legacy Song
                      </Button>
                    ) : driveUrl ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        asChild
                      >
                        <a
                          href={driveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open song in Google Drive to check playback"
                        >
                          Open in Google Drive
                        </a>
                      </Button>
                    ) : null}
                    {/* Only the owner may delete; a shared song is the partner's. */}
                    {!s.shared_with_me && (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => setPendingDeleteSongId(s.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Withdraw confirm dialog ── */}
      {(() => {
        const pendingCheckin = checkins?.find((c) => c.id === pendingWithdrawId);
        return (
          <Dialog
            open={!!pendingWithdrawId}
            onOpenChange={(open: boolean) => { if (!open) setPendingWithdrawId(null); }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Withdraw from queue?</DialogTitle>
                <DialogDescription>
                  {pendingCheckin
                    ? <>You will be removed from the <span className="font-medium">{pendingCheckin.divisionName}</span> queue. This cannot be undone.</>
                    : "You will be removed from the queue. This cannot be undone."
                  }
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={!!withdrawingId}
                  onClick={() => setPendingWithdrawId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!!withdrawingId}
                  onClick={() => { if (pendingWithdrawId) void handleWithdraw(pendingWithdrawId); }}
                >
                  {withdrawingId ? "Withdrawing…" : "Withdraw"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Song delete confirm dialog ── */}
      {(() => {
        const pendingSong = songs.find((s) => s.id === pendingDeleteSongId);
        return (
          <Dialog
            open={!!pendingDeleteSongId}
            onOpenChange={(open: boolean) => { if (!open) setPendingDeleteSongId(null); }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this song?</DialogTitle>
                <DialogDescription>
                  {pendingSong && songPieces(pendingSong)
                    ? <>This will permanently remove <span className="font-medium break-words">{songPieces(pendingSong)}</span>. This cannot be undone.</>
                    : "This will permanently remove the song. This cannot be undone."
                  }
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={!!deletingSongId}
                  onClick={() => setPendingDeleteSongId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!!deletingSongId}
                  onClick={() => { if (pendingDeleteSongId) void handleDeleteSong(pendingDeleteSongId); }}
                >
                  {deletingSongId ? "Removing…" : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
