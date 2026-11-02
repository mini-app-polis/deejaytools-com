import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { type ApiEvent, type ApiSession } from "@/schemas";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation } from "@/api/queries";
import { useDivisions } from "@/hooks/useDivisions";
import { toastFirstError } from "@/lib/formErrors";
import { adminSessionFormSchema, type AdminSessionForm } from "@/lib/sessionForm";
import { Button } from "@/components/ui/button";
import { formatTimezoneAbbr } from "@/lib/sessionFormat";
import { epochToTimeInTz, toEpochInTz } from "@/lib/zonedTime";
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "@/components/admin/adminShared";

/** A blank session form, defaulting to the first event and its start date. */
function newSessionForm(events: ApiEvent[] | null): AdminSessionForm {
  const defaultEvent = events?.[0];
  // Check-in opens 30 minutes before the floor trial, which runs 2 hours.
  return {
    eventId: defaultEvent?.id ?? "",
    date: defaultEvent?.start_date ?? "",
    startTime: "07:00",
    checkinOffsetMins: "30",
    durationMins: "120",
    priorityMax: "6",
    nonPriorityMax: "4",
    priorityRunLimit: "1",
    // Per-division priority flags — all divisions always present, admin picks which are priority
    divisionPriority: {},
  };
}

/**
 * The form pre-filled from an existing session. The session stores absolute
 * epochs but the form takes wall-clock time + offsets, so we derive those by
 * anchoring on the event's timezone.
 */
function editSessionForm(s: ApiSession, events: ApiEvent[] | null): AdminSessionForm {
  const tz =
    s.event_timezone ??
    events?.find((ev) => ev.id === s.event_id)?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Per-division priority flags + the (single, shared) priority run limit.
  const flags: Record<string, boolean> = {};
  let runLimit = 1;
  for (const d of s.divisions ?? []) {
    flags[d.division_name] = d.is_priority;
    // priority_run_limit is nullable on non-priority divisions; only
    // priority divisions store a real limit, and they all share one.
    const limit = d.priority_run_limit ?? 0;
    if (d.is_priority && limit > 0) {
      runLimit = limit;
    }
  }
  return {
    eventId: s.event_id ?? "",
    date: s.date ?? "",
    startTime: epochToTimeInTz(s.floor_trial_starts_at, tz),
    checkinOffsetMins: String(Math.max(0, Math.round((s.floor_trial_starts_at - s.checkin_opens_at) / 60_000))),
    durationMins: String(Math.max(1, Math.round((s.floor_trial_ends_at - s.floor_trial_starts_at) / 60_000))),
    priorityMax: String(s.active_priority_max ?? 6),
    nonPriorityMax: String(s.active_non_priority_max ?? 4),
    priorityRunLimit: String(runLimit),
    divisionPriority: flags,
  };
}

/**
 * The create / edit session dialog. It is mounted only while open and fills
 * its form from `editing` (a session to edit, or null for a new one), so
 * each opening starts from a fresh form.
 */
export default function AdminSessionDialog({
  editing,
  events,
  onClose,
}: {
  editing: ApiSession | null;
  events: ApiEvent[] | null;
  onClose: () => void;
}) {
  const { divisions: divisionOptions } = useDivisions();
  /** When set, the dialog is in edit mode (PATCH/PUT instead of POST). */
  const sessEditId = editing?.id ?? null;
  const {
    register: sessRegister,
    handleSubmit: sessValidate,
    setValue: sessSetValue,
    watch: sessWatch,
    formState: { isSubmitting: sessSubmitting },
  } = useForm<AdminSessionForm>({
    resolver: zodResolver(adminSessionFormSchema(divisionOptions.length > 0)),
    defaultValues: editing ? editSessionForm(editing, events) : newSessionForm(events),
  });
  const sessEventId = sessWatch("eventId");
  const sessDate = sessWatch("date");
  const sessStartTime = sessWatch("startTime");
  const sessDivisionPriority = sessWatch("divisionPriority");

  const createSession = useEndpointMutation(endpoints.sessions.create, { invalidates: [endpoints.sessions.list] });
  const updateSession = useEndpointMutation(endpoints.sessions.update, { invalidates: [endpoints.sessions.list] });
  const setSessionDivisions = useEndpointMutation(endpoints.sessions.setDivisions, {
    invalidates: [endpoints.sessions.list],
  });

  const toggleDivisionPriority = (name: string) => {
    sessSetValue("divisionPriority", { ...sessDivisionPriority, [name]: !sessDivisionPriority[name] });
  };

  // The schema has checked the fields, so the numbers parse and are in range.
  const submitSessionDialog = async (v: AdminSessionForm) => {
    const { eventId: sessEventId, date: sessDate, startTime: sessStartTime } = v;
    const sessDivisionPriority = v.divisionPriority;
    const priorityMaxNum = Number(v.priorityMax);
    const nonPriorityMaxNum = Number(v.nonPriorityMax);

    // Interpret the start time in the event's timezone so times are always
    // correct regardless of where the admin's browser is located.
    const eventTz =
      events?.find((ev) => ev.id === sessEventId)?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    const floorStartsAt  = toEpochInTz(sessDate, sessStartTime, eventTz);
    const checkinOpensAt = floorStartsAt - Number(v.checkinOffsetMins) * 60_000;
    const floorEndsAt    = floorStartsAt + Number(v.durationMins) * 60_000;

    const priorityRunLimitNum = Number(v.priorityRunLimit);

    // Auto-generate session name from date
    const sessionName = new Date(`${sessDate}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // All divisions always included; per-division priority flag; shared run limit
    const divisions = divisionOptions.map((d, i) => ({
      division_name: d,
      is_priority: sessDivisionPriority[d] ?? false,
      sort_order: i,
      priority_run_limit: (sessDivisionPriority[d] ?? false) ? priorityRunLimitNum : 0,
    }));

    try {
      if (sessEditId) {
        // Edit: PATCH the scalar fields first, then PUT divisions to overwrite
        // the priority/run-limit flags. The two endpoints are intentionally
        // separate on the API side because divisions are a child collection.
        // Each call is wrapped so the toast can identify which leg failed —
        // necessary because the PATCH can succeed while the PUT errors,
        // leaving the row half-updated.
        try {
          await updateSession.mutateAsync({ params: { id: sessEditId }, body: {
            event_id: sessEventId,
            name: sessionName,
            date: sessDate,
            checkin_opens_at: checkinOpensAt,
            floor_trial_starts_at: floorStartsAt,
            floor_trial_ends_at: floorEndsAt,
            active_priority_max: priorityMaxNum,
            active_non_priority_max: nonPriorityMaxNum,
          } });
        } catch (err) {
          throw new Error(
            `Failed to update session fields: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
          );
        }
        try {
          await setSessionDivisions.mutateAsync({ params: { id: sessEditId }, body: { divisions } });
        } catch (err) {
          throw new Error(
            `Session fields saved, but failed to update divisions: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
          );
        }
        toast.success("Session updated");
      } else {
        await createSession.mutateAsync({ body: {
          event_id: sessEventId,
          name: sessionName,
          date: sessDate,
          checkin_opens_at: checkinOpensAt,
          floor_trial_starts_at: floorStartsAt,
          floor_trial_ends_at: floorEndsAt,
          active_priority_max: priorityMaxNum,
          active_non_priority_max: nonPriorityMaxNum,
          divisions,
        } });
        toast.success("Session created");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save session");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sess-dialog-title"
        className="rounded-t-2xl sm:rounded-lg border bg-background p-6 shadow-lg w-full sm:max-w-lg max-h-[92vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center -mt-2 mb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex items-center justify-between">
          <h2 id="sess-dialog-title" className="text-lg font-semibold">{sessEditId ? "Edit session" : "New session"}</h2>
          <Button type="button" variant="ghost" size="sm" aria-label="Close" onClick={onClose}>✕</Button>
        </div>
        <form onSubmit={(e) => void sessValidate(submitSessionDialog, toastFirstError)(e)} className="space-y-4">
          <div>
            <label htmlFor="sess-event" className={FIELD_LABEL_CLASS}>Event</label>
            <select id="sess-event"
              className={FIELD_INPUT_CLASS}
              {...sessRegister("eventId", {
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                  const ev = events?.find((ev) => ev.id === e.target.value);
                  if (ev) sessSetValue("date", ev.start_date);
                },
              })}
            >
              <option value="">Select event…</option>
              {events?.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sess-date" className={FIELD_LABEL_CLASS}>Date</label>
            <input id="sess-date"
              type="date"
              className={FIELD_INPUT_CLASS}
              {...sessRegister("date")}
              required
            />
          </div>
          <div>
            <label htmlFor="sess-start-time" className={FIELD_LABEL_CLASS}>
              Start time
              {sessEventId && events?.find((ev) => ev.id === sessEventId)?.timezone && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  ({formatTimezoneAbbr(
                    events.find((ev) => ev.id === sessEventId)!.timezone,
                    sessDate && sessStartTime
                      ? toEpochInTz(
                          sessDate,
                          sessStartTime,
                          events.find((ev) => ev.id === sessEventId)!.timezone
                        )
                      : undefined
                  )})
                </span>
              )}
            </label>
            <input id="sess-start-time"
              type="time"
              className={FIELD_INPUT_CLASS}
              {...sessRegister("startTime")}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sess-checkin-opens" className={FIELD_LABEL_CLASS}>Check-in opens</label>
              <select id="sess-checkin-opens"
                className={FIELD_INPUT_CLASS}
                {...sessRegister("checkinOffsetMins")}
              >
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
              <label htmlFor="sess-duration" className={FIELD_LABEL_CLASS}>Floor trial duration</label>
              <select id="sess-duration"
                className={FIELD_INPUT_CLASS}
                {...sessRegister("durationMins")}
              >
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
                <option value="150">2.5 hours</option>
                <option value="180">3 hours</option>
                <option value="210">3.5 hours</option>
                <option value="240">4 hours</option>
                <option value="270">4.5 hours</option>
                <option value="300">5 hours</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sess-priority-max" className={FIELD_LABEL_CLASS}>Active cap (priority)</label>
              <input id="sess-priority-max"
                type="number"
                min={0}
                className={FIELD_INPUT_CLASS}
                {...sessRegister("priorityMax")}
              />
            </div>
            <div>
              <label htmlFor="sess-non-priority-max" className={FIELD_LABEL_CLASS}>Active cap (non-priority)</label>
              <input id="sess-non-priority-max"
                type="number"
                min={0}
                className={FIELD_INPUT_CLASS}
                {...sessRegister("nonPriorityMax")}
              />
            </div>
          </div>
          <div>
            <label htmlFor="sess-priority-run-limit" className={FIELD_LABEL_CLASS}>Priority run limit</label>
            <input id="sess-priority-run-limit"
              type="number"
              min={0}
              className={FIELD_INPUT_CLASS}
              {...sessRegister("priorityRunLimit")}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Number of runs that count as priority for each priority division.
            </p>
          </div>
          <div>
            <label className={FIELD_LABEL_CLASS}>Divisions</label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
              {divisionOptions.map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={sessDivisionPriority[d] ?? false}
                    onChange={() => toggleDivisionPriority(d)}
                  />
                  <span>{d}</span>
                  {sessDivisionPriority[d] && (
                    <span className="text-xs text-primary font-medium">priority</span>
                  )}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              All divisions are always included. Check the ones that grant priority status.
            </p>
          </div>
          <Button type="submit" disabled={sessSubmitting} size="lg" className="w-full">
            {sessSubmitting
              ? sessEditId ? "Saving…" : "Creating…"
              : sessEditId ? "Save changes" : "Create session"}
          </Button>
        </form>
      </div>
    </div>
  );
}
