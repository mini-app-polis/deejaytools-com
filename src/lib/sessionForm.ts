import { z } from "zod";
import type { ApiEvent, ApiSession } from "@/schemas";
import { epochToTimeInTz, toEpochInTz } from "@/lib/zonedTime";

/**
 * The session form's fields, as the admin Sessions page and the staff
 * portal's Sessions section both edit them: the event, wall-clock date and
 * time in the event's timezone, offsets in minutes, and caps as typed. The
 * staff portal fixes the event; the admin picks it.
 */
export const sessionFieldsShape = {
  eventId: z.string(),
  date: z.string(),
  startTime: z.string(),
  checkinOffsetMins: z.string(),
  durationMins: z.string(),
  priorityMax: z.string(),
  nonPriorityMax: z.string(),
  priorityRunLimit: z.string(),
  divisionPriority: z.record(z.string(), z.boolean()),
};

type SessionFields = z.infer<z.ZodObject<typeof sessionFieldsShape>>;

/** How long before the start check-in can open. The API refuses a window that opens at the start. */
export const CHECKIN_OFFSET_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "15", label: "15 min before" },
  { value: "30", label: "30 min before" },
  { value: "45", label: "45 min before" },
  { value: "60", label: "1 hour before" },
  { value: "90", label: "1.5 hours before" },
  { value: "120", label: "2 hours before" },
];

/** How long a floor trial can run, in minutes. */
export const DURATION_OPTIONS: readonly { value: string; label: string }[] = [60, 90, 120, 150, 180, 210, 240, 270, 300].map(
  (m) => ({ value: String(m), label: `${m / 60} hour${m === 60 ? "" : "s"}` })
);

/** A whole number written out in digits: refuses "", "1.5", "-1" and "1e2". */
function isWholeNumber(v: string): boolean {
  return /^\d+$/.test(v.trim());
}

function isPositiveWholeNumber(v: string): boolean {
  return isWholeNumber(v) && Number(v) > 0;
}

/**
 * Check the session fields in the order the form reads them, and report only
 * the first problem, so a refused save names one thing to fix.
 */
function checkSessionFields(v: SessionFields, ctx: z.RefinementCtx, divisionsLoaded: boolean): void {
  const fail = (path: keyof SessionFields, message: string) => {
    ctx.addIssue({ code: "custom", path: [path], message });
  };
  if (!v.eventId) return fail("eventId", "Select an event");
  if (!v.date) return fail("date", "Date is required");
  if (!v.startTime) return fail("startTime", "Start time is required");
  if (!isPositiveWholeNumber(v.checkinOffsetMins)) {
    return fail("checkinOffsetMins", "Check-in must open before the floor trial starts");
  }
  if (!isPositiveWholeNumber(v.durationMins)) {
    return fail("durationMins", "Floor trial duration must be more than 0 minutes");
  }
  if (!isWholeNumber(v.priorityMax)) {
    return fail("priorityMax", "Active cap (priority) must be a whole number, 0 or more");
  }
  if (!isWholeNumber(v.nonPriorityMax)) {
    return fail("nonPriorityMax", "Active cap (non-priority) must be a whole number, 0 or more");
  }
  if (Number(v.nonPriorityMax) > Number(v.priorityMax)) {
    return fail("nonPriorityMax", "Non-priority cap must be ≤ priority cap");
  }
  if (!isWholeNumber(v.priorityRunLimit)) {
    return fail("priorityRunLimit", "Priority run limit must be a whole number, 0 or more");
  }
  if (!divisionsLoaded) return fail("divisionPriority", "The division list has not loaded yet");
}

/** The session form's schema, for the admin Sessions page and the staff portal alike. */
export function sessionFormSchema(divisionsLoaded: boolean) {
  return z.object(sessionFieldsShape).superRefine((v, ctx) => {
    checkSessionFields(v, ctx, divisionsLoaded);
  });
}
export type SessionForm = z.infer<ReturnType<typeof sessionFormSchema>>;

/** A blank form for a new session of `event` (or no event yet, for the admin to pick). */
export function newSessionForm(event: Pick<ApiEvent, "id" | "start_date"> | undefined): SessionForm {
  // Check-in opens 30 minutes before the floor trial, which runs 2 hours.
  return {
    eventId: event?.id ?? "",
    date: event?.start_date ?? "",
    startTime: "07:00",
    checkinOffsetMins: "30",
    durationMins: "120",
    priorityMax: "6",
    nonPriorityMax: "4",
    priorityRunLimit: "1",
    // Every division is always in a session; the form only flags the priority ones.
    divisionPriority: {},
  };
}

/**
 * The form pre-filled from an existing session. The session stores absolute
 * epochs but the form takes wall-clock time and offsets, read in `tz`, the
 * event's timezone.
 */
export function sessionFormFromSession(s: ApiSession, tz: string): SessionForm {
  const flags: Record<string, boolean> = {};
  let runLimit = 1;
  for (const d of s.divisions ?? []) {
    flags[d.division_name] = d.is_priority;
    // Only priority divisions store a real limit, and they all share one.
    const limit = d.priority_run_limit ?? 0;
    if (d.is_priority && limit > 0) runLimit = limit;
  }
  return {
    eventId: s.event_id ?? "",
    date: s.date ?? "",
    startTime: epochToTimeInTz(s.floor_trial_starts_at, tz),
    checkinOffsetMins: String(Math.round((s.floor_trial_starts_at - s.checkin_opens_at) / 60_000)),
    durationMins: String(Math.round((s.floor_trial_ends_at - s.floor_trial_starts_at) / 60_000)),
    priorityMax: String(s.active_priority_max),
    nonPriorityMax: String(s.active_non_priority_max),
    priorityRunLimit: String(runLimit),
    divisionPriority: flags,
  };
}

/**
 * What the API takes for a checked form: the session's own fields (create
 * sends them with the divisions; edit PATCHes them, then PUTs the divisions)
 * and every division in `divisionList`'s order with its priority flag.
 * The date and start time are read in `tz`, the event's timezone.
 */
export function buildSessionPayload(v: SessionForm, tz: string, divisionList: readonly string[]) {
  const floorStartsAt = toEpochInTz(v.date, v.startTime, tz);
  const runLimit = Number(v.priorityRunLimit);
  // The session is named for its date.
  const name = new Date(`${v.date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const fields = {
    event_id: v.eventId,
    name,
    date: v.date,
    checkin_opens_at: floorStartsAt - Number(v.checkinOffsetMins) * 60_000,
    floor_trial_starts_at: floorStartsAt,
    floor_trial_ends_at: floorStartsAt + Number(v.durationMins) * 60_000,
    active_priority_max: Number(v.priorityMax),
    active_non_priority_max: Number(v.nonPriorityMax),
  };
  const divisions = divisionList.map((d, i) => {
    const isPriority = v.divisionPriority[d] ?? false;
    return { division_name: d, is_priority: isPriority, sort_order: i, priority_run_limit: isPriority ? runLimit : 0 };
  });
  return { fields, divisions };
}
