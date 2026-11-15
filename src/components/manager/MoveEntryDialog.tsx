import { useState } from "react";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDivisions } from "@/hooks/useDivisions";
import { roundDisplayLabel } from "@/lib/submissionRounds";
import {
  ROUND_SPLIT_DIVISION,
  SUBMISSION_ROUNDS,
  type ApiAdminEventSongSubmission,
  type SubmissionRound,
} from "@/schemas";

/** The reads a move changes: the event's lists of entries and the dancers' own. */
const MOVE_INVALIDATES = [
  endpoints.admin.eventSongSubmissions,
  endpoints.events.songSubmissions,
  endpoints.events.entities,
  endpoints.eventSongSubmissions.list,
] as const;

/**
 * The admin's move of one event entry to another division of the same event,
 * for an entry submitted under the wrong one. Only this event's entry moves:
 * the song keeps its own division, its Drive copy follows on the API's Drive
 * queue, and the dancer is not told. The API refuses a move while the entry
 * is checked in under its division, or when the partnership already has a
 * song in the new one; its message is shown as it is.
 */
export default function MoveEntryDialog({
  submission,
  roundsAllowed,
  onClose,
}: {
  submission: ApiAdminEventSongSubmission;
  /** The event splits Classic into rounds (The Open). */
  roundsAllowed: boolean;
  onClose: () => void;
}) {
  const { divisions } = useDivisions();
  const current = submission.division?.trim() ?? "";
  const choices = divisions.filter((d) => d !== current);
  const [division, setDivision] = useState("");
  const [round, setRound] = useState<SubmissionRound>("prelims_and_finals");
  const move = useEndpointMutation(endpoints.admin.moveEventSongSubmission, { invalidates: MOVE_INVALIDATES });
  const withRound = roundsAllowed && division === ROUND_SPLIT_DIVISION;

  const submit = async () => {
    try {
      await move.mutateAsync({
        params: { id: submission.id },
        body: { division, ...(withRound && round !== "prelims_and_finals" ? { round } : {}) },
      });
      toast.success(`Moved ${submission.partnership_label} to ${division}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {submission.partnership_label}</DialogTitle>
          <DialogDescription>
            {submission.song_label}, entered in {current || "no division"}. It moves to another division of this
            event only: the song keeps its own division, its Drive copy moves with it, and the dancer is not
            notified.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="move-entry-division">New division</Label>
            <Select value={division || undefined} onValueChange={setDivision}>
              <SelectTrigger id="move-entry-division">
                <SelectValue placeholder="Select a division" />
              </SelectTrigger>
              <SelectContent>
                {choices.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {withRound && (
            <div className="space-y-1">
              <Label htmlFor="move-entry-round">Rounds</Label>
              <Select value={round} onValueChange={(v) => setRound(v as SubmissionRound)}>
                <SelectTrigger id="move-entry-round">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBMISSION_ROUNDS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roundDisplayLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!division || move.isPending} onClick={() => void submit()}>
            {move.isPending ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
