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

/**
 * Dedicated submission page for The Open.
 *
 * Mirrors EventSubmissionsPage, but the event set is filtered down to events
 * that `isOpenEvent()` recognises — the generic page filters those same events
 * out, so the two pages partition the event list between them. When there is
 * exactly one Open event (the normal case) it is selected automatically and no
 * picker is shown.
 *
 * Legacy catalog rows are hidden from the song list, same as on the generic
 * page — see partitionSubmittableSongs().
 *
 * This is where The Open's remaining submission protections will live.
 */
export default function OpenSubmissionsPage() {
  const api = useApiClient();

  const [openEvents, setOpenEvents] = useState<ApiEvent[]>([]);
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
        const open = evs.filter((e) => e.status !== "completed" && isOpenEvent(e.name));
        setOpenEvents(open);
        setSongs(songRows);
        // The normal case is a single Open event — skip the picker entirely.
        if (open.length === 1) setSelectedEventId(open[0].id);
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

  const selectedEvent = useMemo(
    () => openEvents.find((e) => e.id === selectedEventId) ?? null,
    [openEvents, selectedEventId]
  );

  const submissionBySongId = useMemo(() => {
    const map = new Map<string, ApiEventSongSubmission>();
    for (const s of submissions) map.set(s.song_id, s);
    return map;
  }, [submissions]);

  const { submittable: eligibleSongs, hiddenLegacyCount } = useMemo(
    () => partitionSubmittableSongs(songs, (id) => submissionBySongId.has(id)),
    [songs, submissionBySongId]
  );

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
      toast.success(`Song added to ${OPEN_EVENT_LABEL}.`);
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
      toast.success(`Song removed from ${OPEN_EVENT_LABEL}.`);
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
        <h1 className="page-title text-2xl">{OPEN_EVENT_LABEL} submissions</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submit songs to {OPEN_EVENT_LABEL}</CardTitle>
          <CardDescription>
            {OPEN_EVENT_LABEL} has its own submission page. Add songs from your library below.{" "}
            <Link
              to="/how-it-works/submitting-music#event-submission-required"
              className="text-primary hover:underline"
            >
              About event submissions →
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {openEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {OPEN_EVENT_LABEL} isn&apos;t accepting submissions right now.{" "}
              <Link to="/event-submissions" className="underline">
                Submit to another event
              </Link>
              .
            </p>
          ) : openEvents.length > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="open-submissions-event">Event</Label>
              <Select value={selectedEventId || undefined} onValueChange={setSelectedEventId}>
                <SelectTrigger id="open-submissions-event">
                  <SelectValue placeholder="Select an event" />
                </SelectTrigger>
                <SelectContent>
                  {openEvents.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {eventOptionLabel(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            selectedEvent && (
              <p className="text-sm text-muted-foreground">
                Submitting to{" "}
                <span className="font-medium text-foreground">
                  {eventOptionLabel(selectedEvent)}
                </span>
                .
              </p>
            )
          )}

          {!selectedEventId && openEvents.length > 1 && (
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
                        disabled={busy || submissionsLoading}
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
