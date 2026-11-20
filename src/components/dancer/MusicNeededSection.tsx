import { TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseCalendarDate } from "@/lib/eventDates";
import { songLabel } from "@/lib/songLabel";
import type { ApiRegistrationReminder, ApiSong, ApiSongOnFile } from "@/schemas";

const NO_REMINDERS: readonly ApiRegistrationReminder[] = [];

/** "Starts Nov 26", or "Happening now" once the event has begun. */
function whenLine(r: ApiRegistrationReminder): string | null {
  if (r.event_status === "active") return "Happening now";
  const date = parseCalendarDate(r.event_start_date);
  return date
    ? `Starts ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : null;
}

/** The song as dancers see it: built from the song itself when it is on this page, without the season year. */
function suggestedSongLabel(song: ApiSongOnFile, songs: readonly ApiSong[]): string {
  const mine = songs.find((s) => s.id === song.song_id);
  if (mine) return songLabel(mine);
  return [song.partnership_label, song.division].filter(Boolean).join(" - ");
}

/**
 * The notice at the top of My Content: events whose registration list names
 * the signed-in dancer (with a partner of theirs) where no music is in yet.
 * With a song of theirs that fits, one tap submits it; with none on file, it
 * points to upload. "Not me" hides an entry for this person only. Shows
 * nothing while loading, on a failed load, or when there is nothing to say.
 */
export default function MusicNeededSection({ songs }: { songs: readonly ApiSong[] }) {
  const query = useEndpointQuery(endpoints.registrationReminders.list);
  const reminders = query.data ?? NO_REMINDERS;
  const [busyId, setBusyId] = useState<string | null>(null);

  const submit = useEndpointMutation(endpoints.eventSongSubmissions.create, {
    invalidates: [endpoints.registrationReminders.list, endpoints.eventSongSubmissions.list],
  });
  const dismiss = useEndpointMutation(endpoints.registrationReminders.dismiss, {
    invalidates: [endpoints.registrationReminders.list],
  });

  const heading = useMemo(
    () =>
      reminders.length === 1
        ? "Music needed for 1 of your registrations"
        : `Music needed for ${reminders.length} of your registrations`,
    [reminders.length]
  );

  if (reminders.length === 0) return null;

  const handleSubmit = async (r: ApiRegistrationReminder, song: ApiSongOnFile) => {
    setBusyId(r.registration_id);
    try {
      await submit.mutateAsync({ body: { event_id: r.event_id, song_id: song.song_id } });
      toast.success(`Submitted to ${r.event_name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit the song.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (r: ApiRegistrationReminder) => {
    setBusyId(r.registration_id);
    try {
      await dismiss.mutateAsync({ params: { id: r.registration_id } });
      toast.success("Got it. We won't show that one again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to hide it.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-labelledby="music-needed"
      className="rounded-lg border-2 border-yellow-400 bg-yellow-400/10"
    >
      <div className="flex items-center gap-2 rounded-t-md border-b border-yellow-400/40 bg-yellow-400/20 px-4 py-3">
        <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 fill-yellow-400 text-background" />
        <h2 id="music-needed" className="font-semibold text-yellow-300 scroll-mt-24">
          {heading}
        </h2>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm text-yellow-50">
          We found you on these events&apos; registration lists, but no song has been submitted for you yet.
        </p>
        {reminders.map((r) => {
          const busy = busyId === r.registration_id;
          const when = whenLine(r);
          const names = [r.dancer_1, r.dancer_2].filter(Boolean).join(" & ");
          return (
            <article
              key={r.registration_id}
              aria-label={`${r.event_name}, ${r.division}`}
              className="rounded-lg border bg-card px-4 py-3 text-sm space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{r.event_name}</p>
                  <Badge variant="outline">{r.division}</Badge>
                </div>
                {when && <p className="text-xs text-muted-foreground">{when}</p>}
              </div>
              <p className="text-muted-foreground">
                Registered as <span className="font-medium text-foreground">{names}</span>
              </p>
              {r.song ? (
                <div className="rounded-md border bg-background/40 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Looks like you already have this song for it</p>
                  <p className="font-medium break-words">{suggestedSongLabel(r.song, songs)}</p>
                  {r.song.submitted_this_season.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Also submitted to {r.song.submitted_this_season.join(", ")} this season
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">We don&apos;t have a song on file for this partnership yet.</p>
              )}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  className="w-full sm:w-auto text-muted-foreground"
                  onClick={() => void handleDismiss(r)}
                >
                  Not me
                </Button>
                {r.song?.same_division ? (
                  <>
                    <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                      <Link to={`/event-submissions/${r.event_id}`}>Choose a different song</Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      className="w-full sm:w-auto"
                      onClick={() => void handleSubmit(r, r.song!)}
                    >
                      {busy && submit.isPending ? "Submitting…" : "Submit this song"}
                    </Button>
                  </>
                ) : r.song ? (
                  // Its division differs from the entry's: pick the division on the event's page.
                  <Button asChild size="sm" className="w-full sm:w-auto">
                    <Link to={`/event-submissions/${r.event_id}`}>Submit a song</Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" className="w-full sm:w-auto">
                    <Link to="/songs/add">Upload a song</Link>
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
