import { z } from "zod";

/**
 * The session form's fields, as the admin Sessions page and the staff
 * portal's Sessions section both edit them: wall-clock date and time in the
 * event's timezone, offsets in minutes, and caps as typed.
 */
export const sessionFieldsShape = {
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

function isNonNegative(v: string): boolean {
  const n = Number(v);
  return !Number.isNaN(n) && n >= 0;
}

/**
 * Check the session fields in the order the form reads them, and report only
 * the first problem, so a refused save names one thing to fix. False when a
 * problem was reported.
 */
export function checkSessionFields(
  v: SessionFields,
  ctx: z.RefinementCtx,
  divisionsLoaded: boolean
): boolean {
  const fail = (path: keyof SessionFields, message: string) => {
    ctx.addIssue({ code: "custom", path: [path], message });
    return false;
  };
  if (!v.date) return fail("date", "Date is required");
  if (!v.startTime) return fail("startTime", "Start time is required");
  if (!divisionsLoaded) return fail("divisionPriority", "The division list has not loaded yet");
  if (!isNonNegative(v.priorityMax)) {
    return fail("priorityMax", "Active cap (priority) must be a non-negative number");
  }
  if (!isNonNegative(v.nonPriorityMax)) {
    return fail("nonPriorityMax", "Active cap (non-priority) must be a non-negative number");
  }
  if (Number(v.nonPriorityMax) > Number(v.priorityMax)) {
    return fail("nonPriorityMax", "Non-priority cap must be ≤ priority cap");
  }
  if (!isNonNegative(v.priorityRunLimit)) {
    return fail("priorityRunLimit", "Priority run limit must be a non-negative number");
  }
  return true;
}

/** The staff portal's session form: the session's event is fixed. */
export function sessionFormSchema(divisionsLoaded: boolean) {
  return z.object(sessionFieldsShape).superRefine((v, ctx) => {
    checkSessionFields(v, ctx, divisionsLoaded);
  });
}
export type SessionForm = z.infer<ReturnType<typeof sessionFormSchema>>;

/** The admin session form: the session's event is picked first. */
export function adminSessionFormSchema(divisionsLoaded: boolean) {
  return z.object({ eventId: z.string(), ...sessionFieldsShape }).superRefine((v, ctx) => {
    if (!v.eventId) {
      ctx.addIssue({ code: "custom", path: ["eventId"], message: "Select an event" });
      return;
    }
    checkSessionFields(v, ctx, divisionsLoaded);
  });
}
export type AdminSessionForm = z.infer<ReturnType<typeof adminSessionFormSchema>>;
