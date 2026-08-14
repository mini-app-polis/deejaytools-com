import type {
  ApiEvent,
  ApiEventSongSubmission,
  ApiMyCheckin,
  ApiSession,
  ApiSong,
} from "@deejaytools/schemas";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
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

export default function MyContentPage() {
  const api = useApiClient();

  // ── Songs state ──────────────────────────────────────────────────────────────
  const [songs, setSongs] = useState<ApiSong[]>([]);
  const [songsLoading, setSongsLoading] = useState(true);
  const [pendingDeleteSongId, setPendingDeleteSongId] = useState<string | null>(null);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);

  // ── Check-ins state ──────────────────────────────────────────────────────────
  const [checkins, setCheckins] = useState<ApiMyCheckin[] | null>(null);
  const [checkinsLoading, setCheckinsLoading] = useState(true);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [pendingWithdrawId, setPendingWithdrawId] = useState<string | null>(null);

  // ── Events / submissions state ────────────────────────────────────────────────
  const [availableEvents, setAvailableEvents] = useState<ApiEvent[]>([]);
  const [eventSubmissions, setEventSubmissions] = useState<ApiEventSongSubmission[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [activeSessions, setActiveSessions] = useState<ApiSession[] | null>(null);

  // ── Data loaders ─────────────────────────────────────────────────────────────

  const loadSongs = () => {
    setSongsLoading(true);
    api
      .get<ApiSong[]>("/v1/songs")
      .then(setSongs)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setSongsLoading(false));
  };

  const loadCheckins = () => {
    setCheckinsLoading(true);
    api
      .get<ApiMyCheckin[]>("/v1/checkins/mine")
      .then(setCheckins)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setCheckinsLoading(false));
  };

  const loadEventsSection = () => {
    setEventsLoading(true);
    Promise.all([
      api.get<ApiEvent[]>("/v1/events").catch(() => [] as ApiEvent[]),
      api
        .get<ApiEventSongSubmission[]>("/v1/event-song-submissions")
        .catch(() => [] as ApiEventSongSubmission[]),
    ])
      .then(([evs, subs]) => {
        setAvailableEvents(evs.filter((e) => e.status !== "completed"));
        setEventSubmissions(subs);
      })
      .finally(() => setEventsLoading(false));
  };

  const loadActiveSessions = () => {
    api
      .get<ApiSession[]>("/v1/sessions")
      .then((all) =>
        setActiveSessions(
          all.filter((s) => s.status === "checkin_open" || s.status === "in_progress")
        )
      )
      .catch(() => setActiveSessions([]));
  };

  const handleWithdraw = async (checkinId: string) => {
    setWithdrawingId(checkinId);
    try {
      await api.del(`/v1/checkins/${checkinId}`);
      setCheckins((prev) => prev?.filter((c) => c.id !== checkinId) ?? null);
      setPendingWithdrawId(null);
      toast.success("Withdrawn from queue.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to withdraw.");
      setPendingWithdrawId(null);
    } finally {
      setWithdrawingId(null);
    }
  };

  useEffect(() => {
    loadSongs();
    loadCheckins();
    loadEventsSection();
    loadActiveSessions();
  }, [api]);

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
      await api.del(`/v1/songs/${id}`);
      setSongs((prev) => prev.filter((s) => s.id !== id));
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

      {sortedActiveSessions.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold">Active Floor Trials</h2>
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
                    <Link to={`/sessions/${s.id}`}>Check in</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Check-ins section ── */}
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">Check-ins</h2>
        </div>
        <div className="p-4 space-y-3">
          {checkinsLoading && !checkins ? (
            <Skeleton className="h-40 w-full" />
          ) : checkins?.length === 0 ? (
            <p className="text-sm text-muted-foreground">You are not currently checked in anywhere.</p>
          ) : (
            <div className={`space-y-3${checkinsLoading ? " opacity-60" : ""}`}>
              {checkins?.map((ci) => (
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
                      {ci.songProcessedFilename && (
                        <p className="font-mono text-xs text-muted-foreground/70 truncate">
                          {ci.songProcessedFilename}
                        </p>
                      )}
                      {ci.notes && (
                        <p className="text-muted-foreground italic">Note: {ci.notes}</p>
                      )}
                    </div>

                    {/* Withdraw */}
                    <div className="pt-2 border-t border-border/40 mt-1">
                      <Button
                        type="button" size="sm" variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => setPendingWithdrawId(ci.id)}
                      >
                        Withdraw from queue
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Events section ── */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
          <h2 className="font-semibold">Events</h2>
          <Button size="sm" asChild>
            <Link to="/event-submissions">Add songs to an event</Link>
          </Button>
        </div>
        <div className="p-4 space-y-3">
          {eventsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : sortedAvailableEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events are available right now.</p>
          ) : (
            <div className="space-y-3">
              {sortedAvailableEvents.map((event) => {
                const subs = submissionsByEventId.get(event.id) ?? [];
                return (
                  <div key={event.id} className="rounded-lg border px-4 py-3 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-medium">{event.name}</p>
                        <p className="text-xs text-muted-foreground">{event.start_date}</p>
                      </div>
                      {eventStatusBadge(event.status)}
                    </div>
                    {subs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No songs added yet.</p>
                    ) : (
                      <ul className="space-y-1 border-t border-border/40 pt-2">
                        {subs.map((s) => (
                          <li key={s.id} className="text-sm">
                            <span className="font-medium">{s.song_label}</span>
                            {s.division && (
                              <span className="text-muted-foreground"> · {s.division}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
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
          <h2 className="font-semibold">Songs</h2>
          <Button size="sm" asChild>
            <Link to="/songs/add">Add song</Link>
          </Button>
        </div>
        <div className="p-4 space-y-4">
          <div className={`space-y-3${songsLoading ? " opacity-60" : ""}`}>
            {songsLoading && songs.length === 0 && <Skeleton className="h-40 w-full" />}
            {songs.length === 0 && !songsLoading && (
              <p className="text-sm text-muted-foreground py-4 text-center">No songs yet.</p>
            )}
            {songs.map((s) => {
              const partnerName = !s.partner_id
                ? null
                : [s.partner_first_name, s.partner_last_name].filter(Boolean).join(" ").trim() || null;
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
                    <p className="font-mono text-sm leading-snug break-all flex-1">
                      {s.processed_filename?.trim() ? s.processed_filename : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {s.original_filename?.trim() && (
                    <p className="font-mono text-xs text-muted-foreground/80 leading-snug break-all">
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
                        <span className="text-muted-foreground text-xs">Partner </span>
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
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={() => setPendingDeleteSongId(s.id)}
                    >
                      Delete
                    </Button>
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
                  {pendingSong?.processed_filename?.trim()
                    ? <>This will permanently remove <span className="font-mono break-all">{pendingSong.processed_filename}</span>. This cannot be undone.</>
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
