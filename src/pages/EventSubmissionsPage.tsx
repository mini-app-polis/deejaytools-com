import type { ApiListedEventSongSubmission } from "@/schemas";
import { ROUND_SPLIT_DIVISION, SUBMISSION_ROUNDS, isOpenEvent, type SubmissionRound } from "@/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { useDivisions } from "@/hooks/useDivisions";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import EventPicker from "@/components/dancer/EventPicker";
import EventSubmissionsList from "@/components/dancer/EventSubmissionsList";
import {
  LoadError,
  LoadingSkeleton,
  PageHeader,
  errorMessage,
} from "@/components/dancer/eventSubmissionsShared";
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
import { partitionSubmittableSongs } from "@/lib/submittableSongs";
import { songLabel } from "@/lib/songLabel";

// A stable empty list while a query has no data, so memos over it hold.
const NO_ROWS: readonly never[] = [];

const ROUND_OPTIONS: { value: SubmissionRound; label: string }[] = [
  { value: "prelims_and_finals", label: "Prelims & Finals" },
  { value: "prelims_only", label: "Prelims Only" },
  { value: "finals_only", label: "Finals Only" },
];

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

// Submit stays disabled until a song and a division are picked, so a refused
// submit has nothing to say.
const submissionSchema = z.object({
  songId: z.string().min(1),
  division: z.string().refine((d) => d.trim() !== ""),
  round: z.enum(SUBMISSION_ROUNDS),
});
type SubmissionForm = z.infer<typeof submissionSchema>;
const EMPTY_SUBMISSION: SubmissionForm = { songId: "", division: "", round: "prelims_and_finals" };

function EventSubmissionForm({ eventId }: { eventId: string }) {
  const { divisions, error: divisionsError, retry: retryDivisions } = useDivisions();
  const eventsQuery = useEndpointQuery(endpoints.events.list);
  const songsQuery = useEndpointQuery(endpoints.songs.list);
  const event = useMemo(
    () => eventsQuery.data?.find((e) => e.id === eventId && e.status !== "completed") ?? null,
    [eventsQuery.data, eventId]
  );
  const songs = songsQuery.data ?? NO_ROWS;
  const loading = eventsQuery.isLoading || songsQuery.isLoading;
  const loadFailure = eventsQuery.error ?? songsQuery.error;
  const loadError = loadFailure && !(eventsQuery.data && songsQuery.data) ? errorMessage(loadFailure) : null;

  const submissionsQuery = useEndpointQuery(endpoints.eventSongSubmissions.list, { params: { eventId } });
  const submissions = submissionsQuery.data ?? NO_ROWS;
  const submissionsLoading = submissionsQuery.isFetching;
  // While set, the list on screen is not the real one: submitting is blocked
  // so a song already entered is not entered twice.
  const submissionsError = submissionsQuery.error ? errorMessage(submissionsQuery.error) : null;
  const retrySubmissions = () => void submissionsQuery.refetch();
  const [busySongId, setBusySongId] = useState<string | null>(null);

  const {
    handleSubmit: validate,
    reset,
    setValue,
    watch,
    formState: { isSubmitting: submitting },
  } = useForm<SubmissionForm>({ resolver: zodResolver(submissionSchema), defaultValues: EMPTY_SUBMISSION });
  const selectedSongId = watch("songId");
  const division = watch("division");
  const round = watch("round");
  const setRound = (r: SubmissionRound) => setValue("round", r);

  const submissionReads = [endpoints.eventSongSubmissions.list, endpoints.events.songSubmissions];
  const createSubmission = useEndpointMutation(endpoints.eventSongSubmissions.create, {
    invalidates: submissionReads,
  });
  const removeSubmission = useEndpointMutation(endpoints.eventSongSubmissions.remove, {
    invalidates: submissionReads,
  });

  const submissionBySongId = useMemo(() => {
    const map = new Map<string, ApiListedEventSongSubmission>();
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
    setValue("songId", songId);
    const song = songs.find((s) => s.id === songId);
    // A new song is a fresh entry: re-derive the division from it and drop any
    // override, rather than silently carrying the previous song's division.
    setValue("division", song?.division?.trim() ?? "");
    // Round belongs to the division that was showing when it was chosen. Left
    // alone, a Finals Only pick survives a hop through a non-Classic song and
    // is posted for the next Classic song without ever being displayed.
    setRound("prelims_and_finals");
  };

  const handleDivisionChange = (value: string) => {
    setValue("division", value);
    setRound("prelims_and_finals");
  };

  const submit = async ({ songId, division, round }: SubmissionForm) => {
    if (!event) return;
    try {
      await createSubmission.mutateAsync({
        body: {
          event_id: event.id,
          song_id: songId,
          division,
          ...(showRoundField ? { round } : {}),
        },
      });
      reset(EMPTY_SUBMISSION);
      toast.success(`Song added to ${event.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add song.");
    }
  };

  const handleRemove = async (submission: ApiListedEventSongSubmission) => {
    setBusySongId(submission.song_id);
    try {
      await removeSubmission.mutateAsync({ params: { id: submission.id } });
      toast.success(event ? `Song removed from ${event.name}.` : "Song removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove song.");
    } finally {
      setBusySongId(null);
    }
  };

  if (loading) return <LoadingSkeleton />;

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Event submissions" />
        <LoadError
          what="this event and your songs"
          message={loadError}
          onRetry={() => {
            if (eventsQuery.error) void eventsQuery.refetch();
            if (songsQuery.error) void songsQuery.refetch();
          }}
        />
      </div>
    );
  }

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

  const canSubmit =
    !!selectedSongId &&
    !!division.trim() &&
    !submitting &&
    !submissionsLoading &&
    !submissionsError;

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
              All your songs came over from the old catalog without an audio file, so they
              can&apos;t be submitted to an event.{" "}
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
                {divisionsError && (
                  <LoadError what="the divisions" message={divisionsError} onRetry={retryDivisions} />
                )}
                <Select
                  value={division || undefined}
                  onValueChange={handleDivisionChange}
                  disabled={!selectedSongId}
                >
                  <SelectTrigger id="event-submissions-division">
                    <SelectValue placeholder="Select a division" />
                  </SelectTrigger>
                  <SelectContent>
                    {divisions.map((d) => (
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

              <Button type="button" disabled={!canSubmit} onClick={() => void validate(submit)()}>
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          )}

          {submissionsError && (
            <LoadError
              what="your submissions to this event"
              message={submissionsError}
              onRetry={retrySubmissions}
            />
          )}

          {!submissionsError && submissions.length > 0 && (
            <EventSubmissionsList
              submissions={submissions}
              songs={songs}
              loading={submissionsLoading}
              busySongId={busySongId}
              showRounds={roundsAllowed}
              onRemove={(submission) => void handleRemove(submission)}
            />
          )}

          {hiddenLegacyCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {hiddenLegacyCount} legacy {hiddenLegacyCount === 1 ? "song is" : "songs are"} hidden.
              Songs from the old catalog have no audio file and can&apos;t be submitted to an
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
  const eventsQuery = useEndpointQuery(endpoints.events.list);
  // A failed load forwards to the picker, which says what failed.
  let target: string | null = null;
  if (eventsQuery.data) {
    const open = eventsQuery.data.filter((e) => e.status !== "completed" && isOpenEvent(e.name));
    target = open.length === 1 ? `/event-submissions/${open[0].id}` : "/event-submissions";
  } else if (eventsQuery.error) {
    target = "/event-submissions";
  }

  return target ? <Navigate to={target} replace /> : <LoadingSkeleton />;
}
