import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { type ApiEventPerson } from "@/schemas";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { toastFirstError } from "@/lib/formErrors";
import { formatSessionTitle } from "@/lib/sessionFormat";
import PersonPicker from "@/components/staff/PersonPicker";

const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

/** CheckIn For: the user is picked by search, then the session, song and division. */
const checkinForSchema = z.object({
  user: z
    .custom<ApiEventPerson | null>()
    .refine((u) => u !== null, "Select a user")
    .pipe(z.custom<ApiEventPerson>()),
  sessionId: z.string().min(1, "Select a session"),
  songId: z.string().min(1, "Select a song"),
  division: z.string().min(1, "Select a division"),
});
type CheckinForForm = z.input<typeof checkinForSchema>;
type CheckinForValues = z.output<typeof checkinForSchema>;

/**
 * The manager CheckIn For section: a real check-in on behalf of any user.
 * It renders its own TabsContent so it stays mounted while another manager
 * section is shown, keeping the form as it was.
 */
export default function ManagerCheckinForSection() {
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list);
  const sessions = sessionsQuery.data ?? null;

  const {
    handleSubmit: cfValidate,
    reset: cfReset,
    setValue: cfSetValue,
    watch: cfWatch,
    formState: { isSubmitting: cfSubmitting },
  } = useForm<CheckinForForm, unknown, CheckinForValues>({
    resolver: zodResolver(checkinForSchema),
    defaultValues: { user: null, sessionId: "", songId: "", division: "" },
  });
  const cfSelectedUser = cfWatch("user");
  const cfSessionId = cfWatch("sessionId");
  const cfSongId = cfWatch("songId");
  const cfDivision = cfWatch("division");
  const setCfSongId = (id: string) => cfSetValue("songId", id);
  const setCfDivision = (d: string) => cfSetValue("division", d);

  const cfActiveSessions = (sessions ?? []).filter(
    (s) => s.status === "checkin_open" || s.status === "in_progress"
  );
  const cfSessionObj = sessions?.find((s) => s.id === cfSessionId) ?? null;
  const cfSessionDivisions = (cfSessionObj?.divisions ?? []).map((d) => d.division_name);

  // A new user or session starts the song and division choice again.
  useEffect(() => {
    cfSetValue("songId", "");
    cfSetValue("division", "");
  }, [cfSelectedUser?.user_id, cfSessionId, cfSessionObj?.event_id, cfSetValue]);

  const cfEventId = cfSessionObj?.event_id ?? null;
  const cfSubmissionsQuery = useEndpointQuery(endpoints.admin.userEventSongSubmissions, {
    params: { id: cfSelectedUser?.user_id ?? "", eventId: cfEventId ?? "" },
    enabled: !!cfSelectedUser && !!cfSessionId && !!cfEventId,
  });
  // null until the user and session are chosen and their songs have loaded.
  const cfSubmissions =
    !cfSelectedUser || !cfSessionId ? null : !cfEventId ? [] : (cfSubmissionsQuery.data ?? null);

  const selectCfSong = (songId: string) => {
    setCfSongId(songId);
    const submission = cfSubmissions?.find((s) => s.song_id === songId);
    if (!submission) return;
    const d = submission.division ?? "";
    setCfDivision(cfSessionDivisions.includes(d) ? d : "");
  };

  const createCheckin = useEndpointMutation(endpoints.checkins.create, {
    invalidates: [endpoints.queue.activeStaff, endpoints.queue.priority, endpoints.queue.nonPriority],
  });

  const submitCheckinFor = async ({ user, sessionId, songId, division }: CheckinForValues) => {
    try {
      await createCheckin.mutateAsync({ body: {
        sessionId,
        songId,
        divisionName: division,
        on_behalf_of_user_id: user.user_id,
      } });
      toast.success(`Checked in ${user.display_name}`);
      setCfSongId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    }
  };

  return (
    <TabsContent value="checkin-for" className="mt-4 space-y-4">
      {!cfSelectedUser ? (
        <Card>
          <CardHeader><CardTitle>CheckIn For</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Find the user you&apos;re checking in for. The check-in is recorded exactly as if they did it themselves.
            </p>
            <div className="max-w-lg">
              <PersonPicker
                id="checkin-for-user"
                allUsers
                label="User to check in"
                value={null}
                onChange={(u) => cfSetValue("user", u)}
                autoFocus
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle>
                CheckIn For: {cfSelectedUser.display_name}
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => cfReset()}
              >
                Change user
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void cfValidate(submitCheckinFor, toastFirstError)(e)} className="space-y-4 max-w-lg">
              <div>
                <label className={FIELD_LABEL_CLASS}>Session</label>
                <ChoiceGroup
                  ariaLabel="Session"
                  options={cfActiveSessions.map((s) => ({
                    value: s.id,
                    label: formatSessionTitle(s, s.event_timezone),
                  }))}
                  value={cfSessionId}
                  onChange={(id) => cfSetValue("sessionId", id)}
                />
              </div>

              <div>
                <label className={FIELD_LABEL_CLASS}>Song</label>
                {cfSessionObj && !cfSessionObj.event_id ? (
                  <p className="text-sm text-muted-foreground">This session has no event</p>
                ) : cfSubmissionsQuery.error && cfSubmissions === null ? (
                  <QueryError
                    what="this user's songs"
                    error={cfSubmissionsQuery.error}
                    onRetry={() => void cfSubmissionsQuery.refetch()}
                  />
                ) : cfSubmissions !== null && cfSubmissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No songs submitted to this event for this user
                  </p>
                ) : (
                  <ChoiceGroup
                    ariaLabel="Song"
                    options={(cfSubmissions ?? []).map((sub) => ({
                      value: sub.song_id,
                      label: sub.song_label,
                    }))}
                    value={cfSongId}
                    onChange={selectCfSong}
                    disabled={!cfSessionId || cfSubmissions === null}
                  />
                )}
              </div>

              <div>
                <label className={FIELD_LABEL_CLASS}>Division</label>
                <ChoiceGroup
                  ariaLabel="Division"
                  options={cfSessionDivisions.map((d) => ({ value: d, label: d }))}
                  value={cfDivision}
                  onChange={setCfDivision}
                  disabled={!cfSessionId || cfSessionDivisions.length === 0}
                />
              </div>

              <Button
                type="submit"
                disabled={
                  cfSubmitting ||
                  !cfSessionId ||
                  !cfSongId ||
                  !cfDivision
                }
                size="lg"
                className="w-full sm:w-auto"
              >
                {cfSubmitting ? "Checking in…" : "Check in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}
