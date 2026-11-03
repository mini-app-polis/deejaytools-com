import { useMemo, useState } from "react";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import SessionFormDialog from "@/components/SessionFormDialog";
import SessionStatusBadge from "@/components/SessionStatusBadge";
import SessionStatusControl from "@/components/SessionStatusControl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { compareSessionChrono } from "@/lib/chronoSort";
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr } from "@/lib/sessionFormat";
import type { ApiEvent, ApiZonedSession } from "@/schemas";

/**
 * The event's floor-trial sessions: create, edit (times, caps, priority
 * divisions), set status (an explicit apply; cancelling asks first), and
 * delete. The same form as the admin Sessions page, with the event fixed, so
 * every call names a session of this event (or, on create, this event's id)
 * and the API decides it against the event.
 */
export default function EventSessionsSection({ event }: { event: ApiEvent }) {
  const tz = event.timezone;
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list, {
    params: { eventId: event.id },
    withToken: true,
  });
  const sessions = sessionsQuery.data ?? null;
  // A session's changes show on every session list and on the session itself.
  const sessionReads = [endpoints.sessions.list, endpoints.sessions.get];
  const removeSession = useEndpointMutation(endpoints.sessions.remove, { invalidates: sessionReads });

  /** The session form: null while closed, "new" to create, or the session to edit. */
  const [formFor, setFormFor] = useState<ApiZonedSession | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApiZonedSession | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = useMemo(
    () => (sessions ?? []).slice().sort((a, b) => compareSessionChrono(a, b)),
    [sessions]
  );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const s = pendingDelete;
    setPendingDelete(null);
    setBusyId(s.id);
    try {
      await removeSession.mutateAsync({ params: { id: s.id } });
      toast.success("Session deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete session");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Button onClick={() => setFormFor("new")} className="w-full sm:w-auto">
        New session
      </Button>

      {sessionsQuery.error && sessions === null ? (
        <QueryError what="sessions" error={sessionsQuery.error} onRetry={() => void sessionsQuery.refetch()} />
      ) : sessions === null ? (
        <Skeleton className="h-32 w-full" />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">This event has no sessions yet.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((s) => {
            const sTz = s.event_timezone ?? tz;
            const priority = (s.divisions ?? []).filter((d) => d.is_priority).map((d) => d.division_name);
            return (
              <div key={s.id} className="rounded-lg border px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{formatSessionTitle(s, sTz)}</p>
                  <SessionStatusBadge status={s.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Check-in {formatTimeOnly(s.checkin_opens_at, sTz)} · Start{" "}
                  {formatTimeOnly(s.floor_trial_starts_at, sTz)} · End {formatTimeOnly(s.floor_trial_ends_at, sTz)}{" "}
                  {formatTimezoneAbbr(sTz, s.floor_trial_starts_at)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Priority divisions: {priority.length > 0 ? priority.join(", ") : "none"}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <SessionStatusControl
                    session={s}
                    label={formatSessionTitle(s, sTz)}
                    invalidates={sessionReads}
                    disabled={busyId === s.id}
                  />
                  <Button size="sm" variant="outline" onClick={() => setFormFor(s)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={busyId === s.id}
                    onClick={() => setPendingDelete(s)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formFor !== null && (
        <SessionFormDialog
          event={event}
          editing={formFor === "new" ? null : formFor}
          onClose={() => setFormFor(null)}
        />
      )}

      <Dialog open={!!pendingDelete} onOpenChange={(open: boolean) => { if (!open) setPendingDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this session?</DialogTitle>
            <DialogDescription>
              {pendingDelete && (
                <>
                  <span className="font-medium">{formatSessionTitle(pendingDelete, pendingDelete.event_timezone ?? tz)}</span>
                  <br />
                  This deletes the session and everything in it — its check-ins, queue, and run history. This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
