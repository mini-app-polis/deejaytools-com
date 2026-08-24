import type { ApiEvent, ApiEventSongSubmission, ApiSong } from "@deejaytools/schemas";
import { OPEN_EVENT_LABEL, isOpenEvent } from "@deejaytools/schemas";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { partitionSubmittableSongs } from "@/lib/submittableSongs";
import { buildFilledSlots, slotKeyForSong } from "@/lib/entitySlots";

function songLabel(s: ApiSong): string {
  return (
    s.processed_filename?.trim() ||
    s.display_name?.trim() ||
    s.routine_name?.trim() ||
    "Untitled song"
  );
}

function eventOptionLabel(e: ApiEvent): string {
  return `${e.name} · ${e.start_date}`;
}

export default function EventSubmissionsPage() {
  const api = useApiClient();

  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [songs, setSongs] = useState<ApiSong[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedEventId, setSelectedEventId] = useState("");
  const [submissions, setSubmissions] = useState<ApiEventSongSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [busySongId, setBusySongId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<ApiEvent[]>("/v1/events").catch(() => [] as ApiEvent[]),
      api.get<ApiSong[]>("/v1/songs").catch(() => [] as ApiSong[]),
    ])
      .then(([evs, songRows]) => {
        if (cancelled) return;
        // The Open never accepts songs here — it has its own submission page,
        // so it is filtered out of this list and pointed to by the banner below.
        setEvents(evs.filter((e) => e.status !== "completed" && !isOpenEvent(e.name)));
        setSongs(songRows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!selectedEventId) {
      setSubmissions([]);
      return;
    }
    let cancelled = false;
    setSubmissionsLoading(true);
    api
      .get<ApiEventSongSubmission[]>(
        `/v1/event-song-submissions?event_id=${encodeURIComponent(selectedEventId)}`
      )
      .catch(() => [] as ApiEventSongSubmission[])
      .then((rows) => {
        if (!cancelled) setSubmissions(rows);
      })
      .finally(() => {
        if (!cancelled) setSubmissionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, selectedEventId]);

  const submissionBySongId = useMemo(() => {
    const map = new Map<string, ApiEventSongSubmission>();
    for (const s of submissions) map.set(s.song_id, s);
    return map;
  }, [submissions]);

  const filledSlots = useMemo(
    () => buildFilledSlots(submissions, songs),
    [submissions, songs]
  );

  const { submittable: eligibleSongs, hiddenLegacyCount } = useMemo(
    () => partitionSubmittableSongs(songs, (id) => submissionBySongId.has(id)),
    [songs, submissionBySongId]
  );

  const orphanedSubmissions = useMemo(() => {
    const songIds = new Set(songs.map((s) => s.id));
    return submissions.filter((sub) => !songIds.has(sub.song_id));
  }, [submissions, songs]);

  const handleAdd = async (songId: string) => {
    if (!selectedEventId) return;
    setBusySongId(songId);
    try {
      await api.post<ApiEventSongSubmission>("/v1/event-song-submissions", {
        event_id: selectedEventId,
        song_id: songId,
      });
      const rows = await api
        .get<ApiEventSongSubmission[]>(
          `/v1/event-song-submissions?event_id=${encodeURIComponent(selectedEventId)}`
        )
        .catch(() => [] as ApiEventSongSubmission[]);
      setSubmissions(rows);
      toast.success("Song added to event.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add song.");
    } finally {
      setBusySongId(null);
    }
  };

  const handleRemove = async (submission: ApiEventSongSubmission) => {
    setBusySongId(submission.song_id);
    try {
      await api.del(`/v1/event-song-submissions/${submission.id}`);
      setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));
      toast.success("Song removed from event.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove song.");
    } finally {
      setBusySongId(null);
    }
  };

  if (loading) {
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
        <Button variant="ghost" size="sm" className="px-0 mb-2" asChild>
          <Link to="/my-content">← Back to My Content</Link>
        </Button>
        <h1 className="page-title text-2xl">Event submissions</h1>
      </div>

      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Submitting for {OPEN_EVENT_LABEL}?</CardTitle>
          <CardDescription>
            {OPEN_EVENT_LABEL} doesn&apos;t accept songs through this page — it has its own
            submission page with additional checks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="sm" asChild>
            <Link to="/open-submissions">Go to {OPEN_EVENT_LABEL} submissions →</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submit songs to an event</CardTitle>
          <CardDescription>
            Choose an upcoming event, then add songs from your library.{" "}
            <Link
              to="/how-it-works/submitting-music#event-submission-required"
              className="text-primary hover:underline"
            >
              About event submissions →
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming events are available right now.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="event-submissions-event">Event</Label>
              <Select value={selectedEventId || undefined} onValueChange={setSelectedEventId}>
                <SelectTrigger id="event-submissions-event">
                  <SelectValue placeholder="Select an event" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {eventOptionLabel(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!selectedEventId && events.length > 0 && (
            <p className="text-sm text-muted-foreground">Select an event to manage submissions.</p>
          )}

          {selectedEventId && songs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              You have no songs yet.{" "}
              <Link to="/songs/add" className="underline">
                Add a song
              </Link>{" "}
              first.
            </p>
          )}

          {selectedEventId && songs.length > 0 && eligibleSongs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Your songs are all legacy catalog rows. They were imported without an audio file, so
              they can&apos;t be submitted to an event.{" "}
              <Link to="/songs/add" className="underline">
                Upload the routine as a new song
              </Link>{" "}
              first.
            </p>
          )}

          {selectedEventId && eligibleSongs.length > 0 && (
            <div className={`space-y-3${submissionsLoading ? " opacity-60" : ""}`}>
              {eligibleSongs.map((song) => {
                const existing = submissionBySongId.get(song.id);
                const blockedBySongId = existing ? null : filledSlots.get(slotKeyForSong(song));
                const blocked = !!blockedBySongId && blockedBySongId !== song.id;
                const blockingSong = blockedBySongId
                  ? songs.find((s) => s.id === blockedBySongId)
                  : undefined;
                const busy = busySongId === song.id;
                return (
                  <div
                    key={song.id}
                    className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-sm break-all">{songLabel(song)}</p>
                      {song.division && (
                        <p className="text-xs text-muted-foreground">Division {song.division}</p>
                      )}
                      {blocked && (
                        <p className="text-xs text-muted-foreground">
                          Already submitted for this division:{" "}
                          {blockingSong ? songLabel(blockingSong) : "another song"}. Remove it first
                          to submit this one.
                        </p>
                      )}
                    </div>
                    {existing ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        disabled={busy || submissionsLoading}
                        onClick={() => void handleRemove(existing)}
                      >
                        {busy ? "Removing…" : "Remove"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        className="shrink-0"
                        disabled={busy || submissionsLoading || blocked}
                        onClick={() => void handleAdd(song.id)}
                      >
                        {busy ? "Adding…" : "Add"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {selectedEventId && orphanedSubmissions.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Submitted songs that are no longer in your library. They still count against this
                event, so remove them if they should not be entered.
              </p>
              {orphanedSubmissions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-sm break-all">{sub.song_label}</p>
                    {sub.division && (
                      <p className="text-xs text-muted-foreground">Division {sub.division}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    disabled={busySongId === sub.song_id || submissionsLoading}
                    onClick={() => void handleRemove(sub)}
                  >
                    {busySongId === sub.song_id ? "Removing…" : "Remove"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {selectedEventId && hiddenLegacyCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {hiddenLegacyCount} legacy {hiddenLegacyCount === 1 ? "song is" : "songs are"} hidden.
              Legacy catalog rows have no uploaded audio file and can&apos;t be submitted to an
              event.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
