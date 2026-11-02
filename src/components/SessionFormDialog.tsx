import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDivisions } from "@/hooks/useDivisions";
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "@/lib/formFields";
import { toastFirstError } from "@/lib/formErrors";
import {
  CHECKIN_OFFSET_OPTIONS,
  DURATION_OPTIONS,
  buildSessionPayload,
  newSessionForm,
  sessionFormFromSession,
  sessionFormSchema,
  type SessionForm,
} from "@/lib/sessionForm";
import { formatTimezoneAbbr } from "@/lib/sessionFormat";
import { toEpochInTz } from "@/lib/zonedTime";
import type { ApiEvent, ApiSession } from "@/schemas";

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The options, plus the form's starting value when it is not one of them, so
 * an edit shows what is saved (and the schema says when that is not allowed).
 */
function withCurrent(options: readonly { value: string; label: string }[], current: string, label: string) {
  return options.some((o) => o.value === current) ? options : [{ value: current, label }, ...options];
}

export type SessionFormDialogProps = {
  /** The session to edit, or null to create one. */
  editing: ApiSession | null;
  onClose: () => void;
} & (
  /** The staff portal: the session's event is fixed. */
  | { event: ApiEvent; events?: never }
  /** The admin page: the admin picks the event, first one by default. */
  | { events: ApiEvent[] | null; event?: never }
);

/**
 * The create / edit session dialog, for the admin Sessions page and the staff
 * portal's Sessions section alike. It is mounted only while open and fills
 * its form from `editing`, so each opening starts from a fresh form. On close
 * it hands focus back to whatever opened it.
 */
export default function SessionFormDialog(props: SessionFormDialogProps) {
  const { editing, onClose } = props;
  const pickEvent = props.event === undefined;
  const events = props.event ? [props.event] : (props.events ?? null);
  const { divisions: divisionList } = useDivisions();
  // What had focus when the dialog opened: its trigger.
  const [returnFocusTo] = useState(() => document.activeElement as HTMLElement | null);

  const timezoneOf = (eventId: string) =>
    events?.find((ev) => ev.id === eventId)?.timezone ?? browserTimezone();

  const [initial] = useState(() =>
    editing
      ? sessionFormFromSession(editing, editing.event_timezone ?? timezoneOf(editing.event_id ?? ""))
      : newSessionForm(props.event ?? events?.[0])
  );
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting: submitting },
  } = useForm<SessionForm>({
    resolver: zodResolver(sessionFormSchema(divisionList.length > 0)),
    defaultValues: initial,
  });
  const eventId = watch("eventId");
  const date = watch("date");
  const startTime = watch("startTime");
  const divisionPriority = watch("divisionPriority");
  const savedOffset = initial.checkinOffsetMins;
  const savedDuration = initial.durationMins;
  const eventTz = events?.find((ev) => ev.id === eventId)?.timezone;

  // A session's changes show on every session list, on the session itself,
  // and on its event's page.
  const invalidates = [endpoints.sessions.list, endpoints.sessions.get, endpoints.events.get];
  const createSession = useEndpointMutation(endpoints.sessions.create, { invalidates });
  const updateSession = useEndpointMutation(endpoints.sessions.update, { invalidates });
  const setSessionDivisions = useEndpointMutation(endpoints.sessions.setDivisions, { invalidates });

  // The schema has checked the fields, so the numbers parse and are in range.
  const submit = async (v: SessionForm) => {
    const { fields, divisions } = buildSessionPayload(v, timezoneOf(v.eventId), divisionList);
    try {
      if (editing) {
        // The fields first, then the divisions: two routes, so the message
        // says which one failed when the first succeeds and the second does not.
        try {
          await updateSession.mutateAsync({ params: { id: editing.id }, body: fields });
        } catch (err) {
          throw new Error(
            `Failed to update session fields: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err }
          );
        }
        try {
          await setSessionDivisions.mutateAsync({ params: { id: editing.id }, body: { divisions } });
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
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save session");
    }
  };

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocusTo?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Edit session" : "New session"}</DialogTitle>
          <DialogDescription>
            {props.event ? props.event.name : "Times are in the event's timezone."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(submit, toastFirstError)(e)} className="space-y-4">
          {pickEvent && (
            <div>
              <label htmlFor="sess-event" className={FIELD_LABEL_CLASS}>Event</label>
              <select
                id="sess-event"
                className={FIELD_INPUT_CLASS}
                {...register("eventId", {
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                    const ev = events?.find((ev) => ev.id === e.target.value);
                    if (ev) setValue("date", ev.start_date);
                  },
                })}
              >
                <option value="">Select event…</option>
                {events?.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="sess-date" className={FIELD_LABEL_CLASS}>Date</label>
            <input id="sess-date" type="date" className={FIELD_INPUT_CLASS} {...register("date")} required />
          </div>
          <div>
            <label htmlFor="sess-start-time" className={FIELD_LABEL_CLASS}>
              Start time
              {eventTz && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  ({formatTimezoneAbbr(eventTz, date && startTime ? toEpochInTz(date, startTime, eventTz) : undefined)})
                </span>
              )}
            </label>
            <input id="sess-start-time" type="time" className={FIELD_INPUT_CLASS} {...register("startTime")} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sess-checkin-opens" className={FIELD_LABEL_CLASS}>Check-in opens</label>
              <select id="sess-checkin-opens" className={FIELD_INPUT_CLASS} {...register("checkinOffsetMins")}>
                {withCurrent(
                  CHECKIN_OFFSET_OPTIONS,
                  savedOffset,
                  savedOffset === "0" ? "Same as start" : `${savedOffset} min before`
                ).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sess-duration" className={FIELD_LABEL_CLASS}>Floor trial duration</label>
              <select id="sess-duration" className={FIELD_INPUT_CLASS} {...register("durationMins")}>
                {withCurrent(DURATION_OPTIONS, savedDuration, `${savedDuration} min`).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sess-priority-max" className={FIELD_LABEL_CLASS}>Active cap (priority)</label>
              <input id="sess-priority-max" type="number" min={0} step={1} className={FIELD_INPUT_CLASS} {...register("priorityMax")} />
            </div>
            <div>
              <label htmlFor="sess-non-priority-max" className={FIELD_LABEL_CLASS}>Active cap (non-priority)</label>
              <input id="sess-non-priority-max" type="number" min={0} step={1} className={FIELD_INPUT_CLASS} {...register("nonPriorityMax")} />
            </div>
          </div>
          <div>
            <label htmlFor="sess-priority-run-limit" className={FIELD_LABEL_CLASS}>Priority run limit</label>
            <input id="sess-priority-run-limit" type="number" min={0} step={1} className={FIELD_INPUT_CLASS} {...register("priorityRunLimit")} />
            <p className="text-xs text-muted-foreground mt-1">
              Number of runs that count as priority for each priority division.
            </p>
          </div>
          <fieldset>
            <legend className={FIELD_LABEL_CLASS}>Divisions</legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
              {divisionList.map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={divisionPriority[d] ?? false}
                    onChange={() => setValue("divisionPriority", { ...divisionPriority, [d]: !divisionPriority[d] })}
                  />
                  <span>{d}</span>
                  {divisionPriority[d] && <span className="text-xs text-primary font-medium">priority</span>}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              All divisions are always included. Check the ones that grant priority status.
            </p>
          </fieldset>
          <Button type="submit" disabled={submitting} size="lg" className="w-full">
            {submitting
              ? editing ? "Saving…" : "Creating…"
              : editing ? "Save changes" : "Create session"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
