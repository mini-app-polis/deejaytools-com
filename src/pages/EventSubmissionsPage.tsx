import type { ApiEvent, ApiEventSongSubmission, ApiSong } from "@/schemas";
import {
  DIVISIONS,
  ROUND_SPLIT_DIVISION,
  isOpenEvent,
  type Division,
  type SubmissionRound,
} from "@/schemas";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
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

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <Button variant="ghost" size="sm" className="px-0 mb-2" asChild>
        <Link to="/my-content">← Back to My Content</Link>
      </Button>
      <h1 className="page-title text-2xl">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/**
 * Song submissions, keyed off the URL:
 * - `/event-submissions` — pick an event; choosing one navigates to its page.
 * - `/event-submissions/:eventId` — submit songs to that one event and remove
 *   existing submissions. Every event uses the same form: pick a song,
 *   optionally override its division, and — for Classic at The Open only —
 *   choose which round(s) the entry occupies.
 */
export default function EventSubmissionsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  // Keyed so switching events starts from a clean form.
  return eventId ? <EventSubmissionForm key={eventId} eventId={eventId} /> : <EventPicker />;
}

function EventPicker() {
  const api = useApiClient();
  const navigate = useNavigate();
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    call(api, endpoints.events.list)
      .catch(() => [] as ApiEvent[])
      .then((evs) => {
        if (!cancelled) setEvents(evs.filter((e) => e.status !== "completed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader title="Event submissions" />

      <Card>
        <CardHeader>
          <CardTitle>Submit songs to an event</CardTitle>
          <CardDescription>
            Choose an upcoming event, then add songs from your library.{" "}
            <Link
              to="/how-it-works/submitting-music#event-submission-required"
              className="text-primary underline underline-offset-2"
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
              <Select onValueChange={(id) => navigate(`/event-submissions/${id}`)}>
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
              <p className="text-sm text-muted-foreground">Select an event to manage submissions.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventSubmissionForm({ eventId }: { eventId: string }) {
  const api = useApiClient();

  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [songs, setSongs] = useState<ApiSong[]>([]);
  const [loading, setLoading] = useState(true);

  const [submissions, setSubmissions] = useState<ApiEventSongSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [busySongId, setBusySongId] = useState<string | null>(null);

  const [selectedSongId, setSelectedSongId] = useState("");
  const [division, setDivision] = useState("");
  const [round, setRound] = useState<SubmissionRound>("prelims_and_finals");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      call(api, endpoints.events.list).catch(() => [] as ApiEvent[]),
      call(api, endpoints.songs.list).catch(() => [] as ApiSong[]),
    ])
      .then(([evs, songRows]) => {
        if (cancelled) return;
        setEvent(evs.find((e) => e.id === eventId && e.status !== "completed") ?? null);
        setSongs(songRows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, eventId]);

  useEffect(() => {
    let cancelled = false;
    setSubmissionsLoading(true);
    call(api, endpoints.eventSongSubmissions.list, { params: { eventId } })
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
  }, [api, eventId]);

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

  // Rounds are a Classic-at-The-Open affordance; the API refuses them elsewhere.
  const roundsAllowed = !!event && isOpenEvent(event.name);
  const showRoundField = roundsAllowed && division === ROUND_SPLIT_DIVISION;

  const handleSongChange = (songId: string) => {
    setSelectedSongId(songId);
    const song = songs.find((s) => s.id === songId);
    // A new song is a fresh entry: re-derive the division from it and drop any
    // override, rather than silently carrying the previous song's division.
    setDivision(song?.division?.trim() ?? "");
    // Round belongs to the division that was showing when it was chosen. Left
    // alone, a Finals Only pick survives a hop through a non-Classic song and
    // is posted for the next Classic song without ever being displayed.
    setRound("prelims_and_finals");
  };

  const handleDivisionChange = (value: string) => {
    setDivision(value);
    setRound("prelims_and_finals");
  };

  const resetForm = () => {
    setSelectedSongId("");
    setDivision("");
    setRound("prelims_and_finals");
  };

  const handleSubmit = async () => {
    if (!event || !selectedSongId || !division.trim()) return;
    setSubmitting(true);
    try {
      await call(api, endpoints.eventSongSubmissions.create, {
        body: {
          event_id: event.id,
          song_id: selectedSongId,
          // Chosen from the DIVISIONS picker, so a member of the enum.
          division: division as Division,
          ...(showRoundField ? { round } : {}),
        },
      });
      const rows = await call(api, endpoints.eventSongSubmissions.list, {
        params: { eventId: event.id },
      }).catch(() => [] as ApiEventSongSubmission[]);
      setSubmissions(rows);
      resetForm();
      toast.success(`Song added to ${event.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add song.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (submission: ApiEventSongSubmission) => {
    setBusySongId(submission.song_id);
    try {
      await call(api, endpoints.eventSongSubmissions.remove, { params: { id: submission.id } });
      setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));
      toast.success(event ? `Song removed from ${event.name}.` : "Song removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove song.");
    } finally {
      setBusySongId(null);
    }
  };

  if (loading) return <LoadingSkeleton />;

  if (!event) {
    return (
      <div className="space-y-6">
        <PageHeader title="Event submissions" />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event not open for submissions</CardTitle>
            <CardDescription>This event doesn&apos;t exist or has already finished.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" asChild>
              <Link to="/event-submissions">Choose another event</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canSubmit = !!selectedSongId && !!division.trim() && !submitting && !submissionsLoading;

  return (
    <div className="space-y-6">
      <PageHeader title={event.name} subtitle={event.start_date} />

      <Card>
        <CardHeader>
          <CardTitle>Submit a song</CardTitle>
          <CardDescription>
            {roundsAllowed
              ? "Choose a song, division, and round below."
              : "Choose a song and division below."}{" "}
            <Link
              to="/how-it-works/submitting-music#event-submission-required"
              className="text-primary underline underline-offset-2"
            >
              About event submissions →
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {songs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              You have no songs yet.{" "}
              <Link to="/songs/add" className="underline">
                Add a song
              </Link>{" "}
              first.
            </p>
          )}

          {songs.length > 0 && eligibleSongs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Your songs are all legacy catalog rows. They were imported without an audio file, so
              they can&apos;t be submitted to an event.{" "}
              <Link to="/songs/add" className="underline">
                Upload the routine as a new song
              </Link>{" "}
              first.
            </p>
          )}

          {eligibleSongs.length > 0 && songsForSelect.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Every song in your library is already submitted to this event.
            </p>
          )}

          {songsForSelect.length > 0 && (
            <div
              className={`space-y-4 rounded-lg border px-4 py-4${submissionsLoading ? " opacity-60" : ""}`}
            >
              <div className="space-y-2">
                <Label htmlFor="event-submissions-song">Song</Label>
                <Select value={selectedSongId || undefined} onValueChange={handleSongChange}>
                  <SelectTrigger id="event-submissions-song">
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
                <Label htmlFor="event-submissions-division">Division</Label>
                <Select
                  value={division || undefined}
                  onValueChange={handleDivisionChange}
                  disabled={!selectedSongId}
                >
                  <SelectTrigger id="event-submissions-division">
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

          {submissions.length > 0 && (
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
                          {roundsAllowed &&
                            submission.division === ROUND_SPLIT_DIVISION &&
                            ` · ${roundDisplayLabel(submission.round)}`}
                        </p>
                      )}
                      {!song && (
                        <p className="text-xs text-muted-foreground">
                          No longer in your library. It still counts against this event, so remove
                          it if it should not be entered.
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

          {hiddenLegacyCount > 0 && (
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

/**
 * `/open-submissions` predates per-event pages. It now forwards to The Open's
 * event page when exactly one is open, and to the event picker otherwise.
 */
export function OpenSubmissionsRedirect() {
  const api = useApiClient();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    call(api, endpoints.events.list)
      .catch(() => [] as ApiEvent[])
      .then((evs) => {
        if (cancelled) return;
        const open = evs.filter((e) => e.status !== "completed" && isOpenEvent(e.name));
        setTarget(open.length === 1 ? `/event-submissions/${open[0].id}` : "/event-submissions");
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return target ? <Navigate to={target} replace /> : <LoadingSkeleton />;
}
