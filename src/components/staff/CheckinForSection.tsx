import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { toastFirstError } from "@/lib/formErrors";
import { formatSessionTitle } from "@/lib/sessionFormat";
import { classicRoundLabel } from "@/lib/submissionRounds";
import { isOpenEvent, type ApiEvent } from "@/schemas";
import { FIELD_LABEL_CLASS } from "@/lib/formFields";

// A stable empty list while a query has no data, so memos over it hold.
const NO_ROWS: readonly never[] = [];

const checkinForSchema = z.object({
  sessionId: z.string().min(1, "Select a session"),
  submissionId: z.string().min(1, "Select a song"),
  division: z.string().min(1, "Select a division"),
});
type CheckinForForm = z.infer<typeof checkinForSchema>;

/**
 * Check a dancer in to one of the event's open sessions, on their behalf:
 * POST /v1/checkins with on_behalf_of_user_id, which the API authorizes
 * against the session's event. The song is picked from the event's
 * submissions, and the dancer is that song's owner (the submission's
 * owner_user_id), so nobody is picked or typed separately. The API stays
 * the authority: it refuses a song that isn't the dancer's. Withdrawing a
 * dancer is done from the live queue.
 */
export default function CheckinForSection({ event }: { event: ApiEvent }) {
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list, {
    params: { eventId: event.id },
    withToken: true,
  });
  const submissionsQuery = useEndpointQuery(endpoints.events.songSubmissions, { params: { id: event.id } });
  const sessions = sessionsQuery.data ?? NO_ROWS;
  const submissions = submissionsQuery.data ?? NO_ROWS;
  const form = useForm<CheckinForForm>({
    resolver: zodResolver(checkinForSchema),
    defaultValues: { sessionId: "", submissionId: "", division: "" },
  });
  const {
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting: submitting },
  } = form;
  const sessionId = watch("sessionId");
  const submissionId = watch("submissionId");
  const division = watch("division");
  const setDivision = (d: string) => setValue("division", d);
  const createCheckin = useEndpointMutation(endpoints.checkins.create, {
    invalidates: [endpoints.queue.activeStaff, endpoints.queue.priority, endpoints.queue.nonPriority],
  });

  const openSessions = useMemo(
    () => sessions.filter((s) => s.status === "checkin_open" || s.status === "in_progress"),
    [sessions]
  );
  const sessionDivisions = (sessions.find((s) => s.id === sessionId)?.divisions ?? []).map((d) => d.division_name);

  const submission = submissions.find((s) => s.id === submissionId) ?? null;

  // A picked song brings its division, when this session offers it.
  const pickSong = (id: string) => {
    const d = submissions.find((s) => s.id === id)?.division ?? "";
    setDivision(sessionDivisions.includes(d) ? d : "");
  };

  const submit = async ({ sessionId, division }: CheckinForForm) => {
    if (!submission) { toast.error("Select a song"); return; }
    try {
      await createCheckin.mutateAsync({
        body: { sessionId, songId: submission.song_id, divisionName: division, on_behalf_of_user_id: submission.owner_user_id },
      });
      toast.success(`Checked in ${submission.partnership_label}`);
      setValue("submissionId", "");
      setValue("division", "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check in for a dancer</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={(e) => void handleSubmit(submit, toastFirstError)(e)} className="space-y-4 max-w-lg">
            <FormField
              control={form.control}
              name="sessionId"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <span className={FIELD_LABEL_CLASS}>Session</span>
                  {sessionsQuery.error && !sessionsQuery.data ? (
                    <QueryError what="the sessions" error={sessionsQuery.error} onRetry={() => void sessionsQuery.refetch()} />
                  ) : sessionsQuery.isLoading ? null : openSessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No session of this event is open for check-in.</p>
                  ) : (
                    <FormControl>
                      <ChoiceGroup
                        ariaLabel="Session"
                        options={openSessions.map((s) => ({
                          value: s.id,
                          label: formatSessionTitle(s, s.event_timezone ?? event.timezone),
                        }))}
                        value={field.value}
                        onChange={(id) => {
                          field.onChange(id);
                          setDivision("");
                        }}
                      />
                    </FormControl>
                  )}
                  <FormMessage className="mt-1" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="submissionId"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <span className={FIELD_LABEL_CLASS}>Song</span>
                  {submissionsQuery.error && !submissionsQuery.data ? (
                    <QueryError
                      what="the submitted songs"
                      error={submissionsQuery.error}
                      onRetry={() => void submissionsQuery.refetch()}
                    />
                  ) : submissionsQuery.isLoading ? null : submissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No songs submitted to this event yet.</p>
                  ) : (
                    <FormControl>
                      <ChoiceGroup
                        ariaLabel="Song"
                        options={submissions.map((s) => {
                          const round = classicRoundLabel(s, isOpenEvent(event.name));
                          return {
                            value: s.id,
                            label: `${s.partnership_label} · ${s.song_label}${round ? ` · ${round}` : ""}`,
                          };
                        })}
                        value={field.value}
                        onChange={(id) => {
                          field.onChange(id);
                          pickSong(id);
                        }}
                      />
                    </FormControl>
                  )}
                  <FormMessage className="mt-1" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="division"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <span className={FIELD_LABEL_CLASS}>Division</span>
                  <FormControl>
                    <ChoiceGroup
                      ariaLabel="Division"
                      options={sessionDivisions.map((d) => ({ value: d, label: d }))}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={!sessionId || sessionDivisions.length === 0}
                    />
                  </FormControl>
                  <FormMessage className="mt-1" />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto"
              disabled={submitting || !sessionId || !submission || !division}
            >
              {submitting ? "Checking in…" : "Check in"}
            </Button>
            <p className="text-xs text-muted-foreground">
              To withdraw a dancer, use Withdraw on their entry in the live queue.
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
