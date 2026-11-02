import { Button } from "@/components/ui/button";
import { songLabel } from "@/lib/songLabel";
import {
  ROUND_SPLIT_DIVISION,
  type ApiListedEventSongSubmission,
  type ApiSong,
  type SubmissionRound,
} from "@/schemas";

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

/**
 * The dancer's submissions to an event, each with Remove where they may
 * withdraw it, and a word on any whose song has left their library.
 */
export default function EventSubmissionsList({
  submissions,
  songs,
  loading,
  busySongId,
  showRounds,
  onRemove,
}: {
  submissions: readonly ApiListedEventSongSubmission[];
  songs: readonly ApiSong[];
  /** The list is refreshing: shown dimmed, and Remove waits. */
  loading: boolean;
  /** The song whose submission is being removed. */
  busySongId: string | null;
  /** Show each Classic entry's round: The Open only. */
  showRounds: boolean;
  onRemove: (submission: ApiListedEventSongSubmission) => void;
}) {
  return (
    <div className={`space-y-3 pt-2${loading ? " opacity-60" : ""}`}>
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
                  {showRounds &&
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
            {submission.can_withdraw && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive-strong hover:text-destructive-foreground"
                disabled={busy || loading}
                onClick={() => onRemove(submission)}
              >
                {busy ? "Removing…" : "Remove"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
