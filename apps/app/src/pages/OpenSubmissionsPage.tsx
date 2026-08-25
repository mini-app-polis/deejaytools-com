import type { ApiEvent, ApiEventSongSubmission, ApiSong } from "@deejaytools/schemas";
import {
  DIVISIONS,
  OPEN_EVENT_LABEL,
  ROUND_SPLIT_DIVISION,
  isOpenEvent,
  type SubmissionRound,
} from "@deejaytools/schemas";
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
import { ChoiceGroup } from "@/components/ui/choice-group";
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

const ROUND_OPTIONS: { value: SubmissionRound; label: string }[] = [
  { value: "prelims_and_finals", label: "Prelims & Finals" },
  { value: "prelims_only", label: "Prelims Only" },
  { value: "finals_only", label: "Finals Only" },
];

function songLabel(s: ApiSong): string {
  return (
    s.processed_filename?.trim() ||
    s.display_name?.trim() ||
    s.routine_name?.trim() ||
    "Untitled song"
  );
}

function roundDisplayLabel(round: SubmissionRound): string {
  switch (round) {
    case "prelims_only":
      return "Prelims only";
    case "finals_only":
      return "Finals only";
    default:
      return "Prelims & finals";
  }
}

function eventOptionLabel(e: ApiEvent): string {
  return `${e.name} · ${e.start_date}`;
}

/**
 * Dedicated submission page for The Open.
 *
 * Mirrors EventSubmissionsPage for listing and removing submissions, but uses
 * a form for adding: pick a song, optionally override its division, and for
 * Classic choose which round(s) the entry occupies.
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

  const [selectedSongId, setSelectedSongId] = useState("");
  const [division, setDivision] = useState("");
  const [divisionTouched, setDivisionTouched] = useState(false);
  const [round, setRound] = useState<SubmissionRound>("prelims_and_finals");
  const [submitting, setSubmitting] = useState(false);

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

  // Switching events must not leave a song/division/round chosen for the
  // previous one — selectedSongId can otherwise point at a song filtered out
  // of songsForSelect while canSubmit stays true.
  useEffect(() => {
    setSelectedSongId("");
    setDivision("");
    setDivisionTouched(false);
    setRound("prelims_and_finals");
  }, [selectedEventId]);

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

  const songsForSelect = useMemo(
    () => eligibleSongs.filter((s) => !submissionBySongId.has(s.id)),
    [eligibleSongs, submissionBySongId]
  );

  const showRoundField = division === ROUND_SPLIT_DIVISION;

  const handleSongChange = (songId: string) => {
    setSelectedSongId(songId);
    const song = songs.find((s) => s.id === songId);
    // A new song is a fresh entry: re-derive the division from it and drop any
    // override, rather than silently carrying the previous song's division.
    setDivisionTouched(false);
    setDivision(song?.division?.trim() ?? "");
    // Round belongs to the division that was showing when it was chosen. Left
    // alone, a Finals Only pick survives a hop through a non-Classic song and
    // is posted for the next Classic song without ever being displayed.
    setRound("prelims_and_finals");
  };

  const handleDivisionChange = (value: string) => {
    setDivisionTouched(true);
    setDivision(value);
    setRound("prelims_and_finals");
  };

  const resetForm = () => {
    setSelectedSongId("");
    setDivision("");
    setDivisionTouched(false);
    setRound("prelims_and_finals");
  };

  const handleSubmit = async () => {
    if (!selectedEventId || !selectedSongId || !division.trim()) return;
    setSubmitting(true);
    try {
      await api.post<ApiEventSongSubmission>("/v1/event-song-submissions", {
        event_id: selectedEventId,
        song_id: selectedSongId,
        division,
        ...(showRoundField ? { round } : {}),
      });
      const rows = await api
        .get<ApiEventSongSubmission[]>(
          `/v1/event-song-submissions?event_id=${encodeURIComponent(selectedEventId)}`
        )
        .catch(() => [] as ApiEventSongSubmission[]);
      setSubmissions(rows);
      resetForm();
      toast.success(`Song added to ${OPEN_EVENT_LABEL}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add song.");
    } finally {
      setSubmitting(false);
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

  const canSubmit =
    !!selectedEventId && !!selectedSongId && !!division.trim() && !submitting && !submissionsLoading;

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
            {OPEN_EVENT_LABEL} has its own submission page. Choose a song, division, and round
            below.{" "}
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

          {selectedEventId && songsForSelect.length > 0 && (
            <div className={`space-y-4 rounded-lg border px-4 py-4${submissionsLoading ? " opacity-60" : ""}`}>
              <div className="space-y-2">
                <Label htmlFor="open-submissions-song">Song</Label>
                <Select
                  key={selectedEventId}
                  value={selectedSongId || undefined}
                  onValueChange={handleSongChange}
                >
                  <SelectTrigger id="open-submissions-song">
                    <SelectValue placeholder="Select a song" />
                  </SelectTrigger>
                  <SelectContent>
                    {songsForSelect.map((song) => (
                      <SelectItem key={song.id} value={song.id}>
                        {songLabel(song)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="open-submissions-division">Division</Label>
                <Select
                  value={division || undefined}
                  onValueChange={handleDivisionChange}
                  disabled={!selectedSongId}
                >
                  <SelectTrigger id="open-submissions-division">
                    <SelectValue placeholder="Select a division" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIVISIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showRoundField && (
                <div className="space-y-2">
                  <Label>Round</Label>
                  <ChoiceGroup
                    options={ROUND_OPTIONS}
                    value={round}
                    onChange={setRound}
                    ariaLabel="Submission round"
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Choose Prelims Only or Finals Only if you want a different song for each round.
                    Most entrants submit one song for both.
                  </p>
                </div>
              )}

              <Button type="button" disabled={!canSubmit} onClick={() => void handleSubmit()}>
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          )}

          {selectedEventId && submissions.length > 0 && (
            <div className={`space-y-3 pt-2${submissionsLoading ? " opacity-60" : ""}`}>
              <p className="text-sm font-medium">Your submissions</p>
              {submissions.map((submission) => {
                const song = songs.find((s) => s.id === submission.song_id);
                const busy = busySongId === submission.song_id;
                return (
                  <div
                    key={submission.id}
                    className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-sm break-all">
                        {submission.song_label || (song ? songLabel(song) : submission.song_id)}
                      </p>
                      {submission.division && (
                        <p className="text-xs text-muted-foreground">
                          Division {submission.division}
                          {submission.division === ROUND_SPLIT_DIVISION &&
                            ` · ${roundDisplayLabel(submission.round)}`}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      disabled={busy || submissionsLoading}
                      onClick={() => void handleRemove(submission)}
                    >
                      {busy ? "Removing…" : "Remove"}
                    </Button>
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
