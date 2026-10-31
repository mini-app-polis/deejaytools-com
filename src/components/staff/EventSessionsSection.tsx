import { useMemo, useState } from "react";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
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
import { epochToTimeInTz, toEpochInTz } from "@/lib/zonedTime";
import { useDivisions } from "@/hooks/useDivisions";
import { SessionStatusSchema, type ApiEvent, type ApiSession } from "@/schemas";

const FIELD_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

type SessionStatus = (typeof SessionStatusSchema.options)[number];
const STATUS_OPTIONS = SessionStatusSchema.options;

// No division flagged priority. A division missing from the map is not priority.
function noPriorityDivisions(): Record<string, boolean> {
  return {};
}

/**
 * The event's floor-trial sessions: create, edit (times, caps, priority
 * divisions), set status, and delete. The same form and calls as the admin
 * Sessions page, fixed to one event, so every call names a session of this
 * event (or, on create, this event's id) and the API decides it against the
 * event.
 */
export default function EventSessionsSection({ event }: { event: ApiEvent }) {
  const { divisions: divisionList } = useDivisions();
  const tz = event.timezone;
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list, { params: { eventId: event.id } });
  const sessions = sessionsQuery.data ?? null;
  // A session's changes show on every session list and on the session itself.
  const sessionReads = [endpoints.sessions.list, endpoints.sessions.get];
  const createSession = useEndpointMutation(endpoints.sessions.create, { invalidates: sessionReads });
  const updateSession = useEndpointMutation(endpoints.sessions.update, { invalidates: sessionReads });
  const setSessionDivisions = useEndpointMutation(endpoints.sessions.setDivisions, { invalidates: sessionReads });
  const setSessionStatus = useEndpointMutation(endpoints.sessions.setStatus, { invalidates: sessionReads });
  const removeSession = useEndpointMutation(endpoints.sessions.remove, { invalidates: sessionReads });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [date, setDate] = useState(event.start_date);
  const [startTime, setStartTime] = useState("07:00");
  const [checkinOffsetMins, setCheckinOffsetMins] = useState("30");
  const [durationMins, setDurationMins] = useState("120");
  const [priorityMax, setPriorityMax] = useState("6");
  const [nonPriorityMax, setNonPriorityMax] = useState("4");
  const [priorityRunLimit, setPriorityRunLimit] = useState("1");
  const [divisionPriority, setDivisionPriority] = useState<Record<string, boolean>>(noPriorityDivisions);
  const [pendingDelete, setPendingDelete] = useState<ApiSession | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = useMemo(
    () => (sessions ?? []).slice().sort((a, b) => compareSessionChrono(a, b)),
    [sessions]
  );

  const openCreate = () => {
    setEditId(null);
    setDate(event.start_date);
    setStartTime("07:00");
    setCheckinOffsetMins("30");
    setDurationMins("120");
    setPriorityMax("6");
    setNonPriorityMax("4");
    setPriorityRunLimit("1");
    setDivisionPriority(noPriorityDivisions());
    setDialogOpen(true);
  };

  const openEdit = (s: ApiSession) => {
    const sTz = s.event_timezone ?? tz;
    setEditId(s.id);
    setDate(s.date ?? event.start_date);
    setStartTime(epochToTimeInTz(s.floor_trial_starts_at, sTz));
    setCheckinOffsetMins(
      String(Math.max(0, Math.round((s.floor_trial_starts_at - s.checkin_opens_at) / 60_000)))
    );
    setDurationMins(
      String(Math.max(1, Math.round((s.floor_trial_ends_at - s.floor_trial_starts_at) / 60_000)))
    );
    setPriorityMax(String(s.active_priority_max ?? 6));
    setNonPriorityMax(String(s.active_non_priority_max ?? 4));
    const flags = noPriorityDivisions();
    let runLimit = 1;
    for (const d of s.divisions ?? []) {
      flags[d.division_name] = d.is_priority;
      const limit = d.priority_run_limit ?? 0;
      if (d.is_priority && limit > 0) runLimit = limit;
    }
    setDivisionPriority(flags);
    setPriorityRunLimit(String(runLimit));
    setDialogOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { toast.error("Date is required"); return; }
    if (!startTime) { toast.error("Start time is required"); return; }
    if (divisionList.length === 0) { toast.error("The division list has not loaded yet"); return; }
    const pMax = Number(priorityMax);
    const npMax = Number(nonPriorityMax);
    if (Number.isNaN(pMax) || pMax < 0) {
      toast.error("Active cap (priority) must be a non-negative number");
      return;
    }
    if (Number.isNaN(npMax) || npMax < 0) {
      toast.error("Active cap (non-priority) must be a non-negative number");
      return;
    }
    if (npMax > pMax) {
      toast.error("Non-priority cap must be ≤ priority cap");
      return;
    }
    const runLimitNum = Number(priorityRunLimit);
    if (Number.isNaN(runLimitNum) || runLimitNum < 0) {
      toast.error("Priority run limit must be a non-negative number");
      return;
    }

    const floorStartsAt = toEpochInTz(date, startTime, tz);
    const checkinOpensAt = floorStartsAt - Number(checkinOffsetMins) * 60_000;
    const floorEndsAt = floorStartsAt + Number(durationMins) * 60_000;
    const name = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const divisions = divisionList.map((d, i) => ({
      division_name: d,
      is_priority: divisionPriority[d] ?? false,
      sort_order: i,
      priority_run_limit: (divisionPriority[d] ?? false) ? runLimitNum : 0,
    }));
    const fields = {
      event_id: event.id,
      name,
      date,
      checkin_opens_at: checkinOpensAt,
      floor_trial_starts_at: floorStartsAt,
      floor_trial_ends_at: floorEndsAt,
      active_priority_max: pMax,
      active_non_priority_max: npMax,
    };

    setSubmitting(true);
    try {
      if (editId) {
        try {
          await updateSession.mutateAsync({ params: { id: editId }, body: fields });
        } catch (err) {
          throw new Error(
            `Failed to update session fields: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
          );
        }
        try {
          await setSessionDivisions.mutateAsync({ params: { id: editId }, body: { divisions } });
        } catch (err) {
          throw new Error(
            `Session fields saved, but failed to update divisions: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
          );
        }
        toast.success("Session updated");
      } else {
        await createSession.mutateAsync({ body: { ...fields, divisions } });
        toast.success("Session created");
      }
      setDialogOpen(false);
      setEditId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save session");
    } finally {
      setSubmitting(false);
    }
  };

  const setStatus = async (s: ApiSession, status: SessionStatus) => {
    setBusyId(s.id);
    try {
      await setSessionStatus.mutateAsync({ params: { id: s.id }, body: { status } });
      toast.success("Status updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to set status");
    } finally {
      setBusyId(null);
    }
  };

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
      <Button onClick={openCreate} className="w-full sm:w-auto">
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
                  <Badge variant="outline">{s.status}</Badge>
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
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <select
                      aria-label={`Status of ${formatSessionTitle(s, sTz)}`}
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                      value={s.status}
                      disabled={busyId === s.id}
                      onChange={(e) => void setStatus(s, e.target.value as SessionStatus)}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
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

      <Dialog open={dialogOpen} onOpenChange={(open: boolean) => { if (!open) setDialogOpen(false); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit session" : "New session"}</DialogTitle>
            <DialogDescription>{event.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="staff-sess-date" className={FIELD_LABEL_CLASS}>Date</label>
              <input id="staff-sess-date" type="date" className={FIELD_INPUT_CLASS} value={date}
                onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="staff-sess-start" className={FIELD_LABEL_CLASS}>
                Start time
                <span className="ml-1.5 font-normal text-muted-foreground">
                  ({formatTimezoneAbbr(tz, date && startTime ? toEpochInTz(date, startTime, tz) : undefined)})
                </span>
              </label>
              <input id="staff-sess-start" type="time" className={FIELD_INPUT_CLASS} value={startTime}
                onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="staff-sess-checkin" className={FIELD_LABEL_CLASS}>Check-in opens</label>
                <select id="staff-sess-checkin" className={FIELD_INPUT_CLASS} value={checkinOffsetMins}
                  onChange={(e) => setCheckinOffsetMins(e.target.value)}>
                  <option value="0">Same as start</option>
                  <option value="15">15 min before</option>
                  <option value="30">30 min before</option>
                  <option value="45">45 min before</option>
                  <option value="60">1 hour before</option>
                  <option value="90">1.5 hours before</option>
                  <option value="120">2 hours before</option>
                </select>
              </div>
              <div>
                <label htmlFor="staff-sess-duration" className={FIELD_LABEL_CLASS}>Floor trial duration</label>
                <select id="staff-sess-duration" className={FIELD_INPUT_CLASS} value={durationMins}
                  onChange={(e) => setDurationMins(e.target.value)}>
                  {[60, 90, 120, 150, 180, 210, 240, 270, 300].map((m) => (
                    <option key={m} value={String(m)}>{m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m / 60} hours`}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="staff-sess-pmax" className={FIELD_LABEL_CLASS}>Active cap (priority)</label>
                <input id="staff-sess-pmax" type="number" min={0} className={FIELD_INPUT_CLASS} value={priorityMax}
                  onChange={(e) => setPriorityMax(e.target.value)} />
              </div>
              <div>
                <label htmlFor="staff-sess-npmax" className={FIELD_LABEL_CLASS}>Active cap (non-priority)</label>
                <input id="staff-sess-npmax" type="number" min={0} className={FIELD_INPUT_CLASS} value={nonPriorityMax}
                  onChange={(e) => setNonPriorityMax(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="staff-sess-runlimit" className={FIELD_LABEL_CLASS}>Priority run limit</label>
              <input id="staff-sess-runlimit" type="number" min={0} className={FIELD_INPUT_CLASS} value={priorityRunLimit}
                onChange={(e) => setPriorityRunLimit(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                Number of runs that count as priority for each priority division.
              </p>
            </div>
            <div>
              <span className={FIELD_LABEL_CLASS}>Divisions</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                {divisionList.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={divisionPriority[d] ?? false}
                      onChange={() => setDivisionPriority((prev) => ({ ...prev, [d]: !prev[d] }))}
                    />
                    <span>{d}</span>
                    {divisionPriority[d] && <span className="text-xs text-primary font-medium">priority</span>}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                All divisions are always included. Check the ones that grant priority status.
              </p>
            </div>
            <Button type="submit" disabled={submitting} size="lg" className="w-full">
              {submitting
                ? editId ? "Saving…" : "Creating…"
                : editId ? "Save changes" : "Create session"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
