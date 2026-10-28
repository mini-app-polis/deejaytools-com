import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
import UserIdField from "@/components/staff/UserIdField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { formatSessionTitle } from "@/lib/sessionFormat";
import type { ApiAdminEventSongSubmission, ApiEvent, ApiSession } from "@/schemas";

const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

/**
 * Check a dancer in to one of the event's open sessions, on their behalf:
 * POST /v1/checkins with on_behalf_of_user_id, which the API authorizes
 * against the session's event. The song is picked from the event's
 * submissions; the API refuses one that isn't the dancer's. Withdrawing a
 * dancer is done from the live queue.
 */
export default function CheckinForSection({ event }: { event: ApiEvent }) {
  const api = useApiClient();
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [submissions, setSubmissions] = useState<ApiAdminEventSongSubmission[]>([]);
  const [userId, setUserId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [division, setDivision] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    call(api, endpoints.sessions.list, { params: { eventId: event.id } })
      .then(setSessions)
      .catch(() => setSessions([]));
    call(api, endpoints.events.songSubmissions, { params: { id: event.id } })
      .then(setSubmissions)
      .catch(() => setSubmissions([]));
  }, [api, event.id]);

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
    const dancer = userId.trim();
    if (!dancer) { toast.error("Enter the dancer's user id"); return; }
    if (!sessionId) { toast.error("Select a session"); return; }
    if (!submission) { toast.error("Select a song"); return; }
    if (!division) { toast.error("Select a division"); return; }
    setSubmitting(true);
    try {
      await call(api, endpoints.checkins.create, {
        body: { sessionId, songId: submission.song_id, divisionName: division, on_behalf_of_user_id: dancer },
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
          <UserIdField id="checkin-for-user" value={userId} onChange={setUserId} />
          <div>
            <span className={FIELD_LABEL_CLASS}>Session</span>
            {openSessions.length === 0 ? (
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
            {submissions.length === 0 ? (
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
            disabled={submitting || !userId.trim() || !sessionId || !submission || !division}
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
