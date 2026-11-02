import type { FormEvent } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "@/lib/formFields";
import { songLabel } from "@/lib/songLabel";
import type { ApiSong } from "@/schemas";

export const checkinSchema = z.object({
  songId: z.string().min(1, "Pick a song"),
  division: z.string().min(1, "Pick a division"),
  notes: z.string(),
});
export type CheckinForm = z.infer<typeof checkinSchema>;
export const EMPTY_CHECKIN: CheckinForm = { songId: "", division: "", notes: "" };

/**
 * The session's check-in form, song first, as a sheet over the page: the
 * song drives who checks in and the division, which the dancer may change.
 * The page holds the form and works out what the picked song means.
 */
export default function SessionCheckinDialog({
  form,
  onSubmit,
  onClose,
  submitting,
  formLoading,
  noEventSongs,
  noSongs,
  submitSongsHref,
  checkinSongs,
  selectedSong,
  dancerName,
  isManaged,
  isSolo,
  selectedEntityInQueue,
  selectedEntityCheckedInByPartner,
  sessionDivisions,
  divisionInSession,
}: {
  form: UseFormReturn<CheckinForm>;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  submitting: boolean;
  formLoading: boolean;
  /** The event has none of the dancer's songs. */
  noEventSongs: boolean;
  /** The dancer has no songs at all. */
  noSongs: boolean;
  submitSongsHref: string;
  checkinSongs: readonly ApiSong[];
  selectedSong: ApiSong | null;
  dancerName: string;
  isManaged: boolean;
  isSolo: boolean;
  selectedEntityInQueue: boolean;
  selectedEntityCheckedInByPartner: boolean;
  sessionDivisions: readonly string[];
  divisionInSession: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="rounded-t-2xl sm:rounded-lg border bg-background p-6 shadow-lg w-full sm:max-w-lg max-h-[92vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center -mt-2 mb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-semibold">Check in</h2>
            <Link
              to="/how-it-works/checking-in"
              className="text-xs text-muted-foreground hover:underline shrink-0"
            >
              Why? →
            </Link>
          </div>
          <Button type="button" variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            ✕
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Song — drives everything else */}
            {formLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : noEventSongs ? (
              <p className="text-sm text-muted-foreground">
                You haven&apos;t added any songs to this event yet.{" "}
                <Link to={submitSongsHref} className="underline">
                  Submit songs to this event
                </Link>
                .{" "}
                <Link
                  to="/how-it-works/troubleshooting"
                  className="text-xs text-muted-foreground underline underline-offset-2"
                >
                  Why? →
                </Link>
              </p>
            ) : noSongs ? (
              <p className="text-sm text-muted-foreground">
                You have no songs uploaded —{" "}
                <Link to="/songs/add" className="underline">add a song first</Link>.
              </p>
            ) : (
              <FormField
                control={form.control}
                name="songId"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <label className={FIELD_LABEL_CLASS}>Song</label>
                    <FormControl>
                      <ChoiceGroup
                        ariaLabel="Song"
                        options={checkinSongs.map((s) => ({
                          value: s.id,
                          label: songLabel(s),
                        }))}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage className="mt-1" />
                  </FormItem>
                )}
              />
            )}

            {/* Confirmation card — shown once a song is selected */}
            {selectedSong && (
              <div className="rounded-md border bg-muted/40 px-3 py-3 text-sm space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground w-16 shrink-0 pt-px">You</span>
                  <span className="font-medium">
                    {dancerName}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground w-16 shrink-0 pt-px">Partner</span>
                  <span className="font-medium">
                    {isManaged || !isSolo
                      ? selectedSong.partnership_label?.trim() || "—"
                      : <span className="text-muted-foreground italic">Solo</span>}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground w-16 shrink-0 pt-px">Song</span>
                  <span className="font-medium break-all">
                    {songLabel(selectedSong)}
                  </span>
                </div>
                {selectedEntityInQueue && (
                  <p className="text-xs text-destructive pt-0.5">
                    {selectedEntityCheckedInByPartner
                      ? "Your partner already checked this partnership in. Pick a different song."
                      : "This partnership is already in the queue. Pick a different song or withdraw your current entry first."}{" "}
                    <Link
                      to="/how-it-works/troubleshooting"
                      className="underline font-normal text-destructive/90"
                    >
                      Why? →
                    </Link>
                  </p>
                )}
              </div>
            )}

            {/* Division — auto-filled from song; user can override if needed */}
            <FormField
              control={form.control}
              name="division"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <label className={FIELD_LABEL_CLASS}>Division</label>
                  <FormControl>
                    <ChoiceGroup
                      ariaLabel="Division"
                      options={sessionDivisions.map((d) => ({ value: d, label: d }))}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  {selectedSong?.division && !divisionInSession && (
                    <p className="text-xs text-amber-600 mt-1">
                      Your song's division ({selectedSong.division}) isn't offered in this session.
                      Please pick the closest match above.
                    </p>
                  )}
                  <FormMessage className="mt-1" />
                </FormItem>
              )}
            />

            {/* Notes */}
            <div>
              <label htmlFor="checkin-notes" className={FIELD_LABEL_CLASS}>Notes (optional)</label>
              <textarea
                id="checkin-notes"
                className={FIELD_INPUT_CLASS}
                rows={2}
                {...form.register("notes")}
                placeholder="Any special instructions for the deejay"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting || selectedEntityInQueue || noEventSongs}
              size="lg"
              className="w-full"
            >
              {submitting ? "Submitting…" : "Check in"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
