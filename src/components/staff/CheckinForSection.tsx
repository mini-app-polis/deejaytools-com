import { useMemo, useState } from "react";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { formatSessionTitle } from "@/lib/sessionFormat";
import type { ApiEvent } from "@/schemas";

const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

// A stable empty list while a query has no data, so memos over it hold.
const NO_ROWS: readonly never[] = [];

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
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list, { params: { eventId: event.id } });
  const submissionsQuery = useEndpointQuery(endpoints.events.songSubmissions, { params: { id: event.id } });
  const sessions = sessionsQuery.data ?? NO_ROWS;
  const submissions = submissionsQuery.data ?? NO_ROWS;
  const [sessionId, setSessionId] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [division, setDivision] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const createCheckin = useEndpointMutation(endpoints.checkins.create, {
    invalidates: [endpoints.queue.activeStaff, endpoints.queue.priority, endpoints.queue.nonPriority],
  });

  const openSessions = useMemo(
    () => sessions.filter((s) => s.status === "checkin_open" || s.status === "in_progress"),
    [sessions]
  );
  const sessionDivisions = (sessions.find((s) => s.id === sessionId)?.divisions ?? []).map((d) => d.division_name);

  const submission = submissions.find((s) => s.id === submissionId) ?? null;

  const pickSong = (id: string) => {
    setSubmissionId(id);
    const d = submissions.find((s) => s.id === id)?.division ?? "";
    setDivision(sessionDivisions.includes(d) ? d : "");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) { toast.error("Select a session"); return; }
    if (!submission) { toast.error("Select a song"); return; }
    if (!division) { toast.error("Select a division"); return; }
    setSubmitting(true);
    try {
      await createCheckin.mutateAsync({
        body: { sessionId, songId: submission.song_id, divisionName: division, on_behalf_of_user_id: submission.owner_user_id },
      });
      toast.success(`Checked in ${submission.partnership_label}`);
      setSubmissionId("");
      setDivision("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check in for a dancer</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="space-y-4 max-w-lg">
          <div>
            <span className={FIELD_LABEL_CLASS}>Session</span>
            {sessionsQuery.error && !sessionsQuery.data ? (
              <QueryError what="the sessions" error={sessionsQuery.error} onRetry={() => void sessionsQuery.refetch()} />
            ) : sessionsQuery.isLoading ? null : openSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No session of this event is open for check-in.</p>
            ) : (
              <ChoiceGroup
                ariaLabel="Session"
                options={openSessions.map((s) => ({
                  value: s.id,
                  label: formatSessionTitle(s, s.event_timezone ?? event.timezone),
                }))}
                value={sessionId}
                onChange={(id) => {
                  setSessionId(id);
                  setDivision("");
                }}
              />
            )}
          </div>
          <div>
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
              <ChoiceGroup
                ariaLabel="Song"
                options={submissions.map((s) => ({
                  value: s.id,
                  label: `${s.partnership_label} · ${s.song_label}`,
                }))}
                value={submissionId}
                onChange={pickSong}
              />
            )}
          </div>
          <div>
            <span className={FIELD_LABEL_CLASS}>Division</span>
            <ChoiceGroup
              ariaLabel="Division"
              options={sessionDivisions.map((d) => ({ value: d, label: d }))}
              value={division}
              onChange={setDivision}
              disabled={!sessionId || sessionDivisions.length === 0}
            />
          </div>
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
      </CardContent>
    </Card>
  );
}
