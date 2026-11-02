import { describe, expect, it } from "vitest";
import { fx } from "@/test/fixtures";
import { buildSessionPayload, newSessionForm, sessionFormFromSession, sessionFormSchema } from "./sessionForm";

const VALID = {
  eventId: "e-1",
  date: "2027-03-01",
  startTime: "07:00",
  checkinOffsetMins: "30",
  durationMins: "120",
  priorityMax: "6",
  nonPriorityMax: "4",
  priorityRunLimit: "1",
  divisionPriority: { Classic: true },
};

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return (result.error?.issues ?? []).map((i) => [i.path.join("."), i.message]);
}

describe("sessionFormSchema", () => {
  it("accepts a complete form as typed", () => {
    expect(sessionFormSchema(true).safeParse(VALID)).toEqual({ success: true, data: VALID });
  });

  const WHOLE = "must be a whole number, 0 or more";
  it.each([
    [{ eventId: "" }, true, "eventId", "Select an event"],
    [{ date: "" }, true, "date", "Date is required"],
    [{ startTime: "" }, true, "startTime", "Start time is required"],
    [{ checkinOffsetMins: "0" }, true, "checkinOffsetMins", "Check-in must open before the floor trial starts"],
    [{ checkinOffsetMins: "-15" }, true, "checkinOffsetMins", "Check-in must open before the floor trial starts"],
    [{ durationMins: "0" }, true, "durationMins", "Floor trial duration must be more than 0 minutes"],
    [{ durationMins: "-60" }, true, "durationMins", "Floor trial duration must be more than 0 minutes"],
    [{ priorityMax: "-1" }, true, "priorityMax", `Active cap (priority) ${WHOLE}`],
    [{ priorityMax: "x" }, true, "priorityMax", `Active cap (priority) ${WHOLE}`],
    [{ priorityMax: "" }, true, "priorityMax", `Active cap (priority) ${WHOLE}`],
    [{ priorityMax: "2.5" }, true, "priorityMax", `Active cap (priority) ${WHOLE}`],
    [{ nonPriorityMax: "-1" }, true, "nonPriorityMax", `Active cap (non-priority) ${WHOLE}`],
    [{ nonPriorityMax: "" }, true, "nonPriorityMax", `Active cap (non-priority) ${WHOLE}`],
    [{ nonPriorityMax: "1.5" }, true, "nonPriorityMax", `Active cap (non-priority) ${WHOLE}`],
    [{ nonPriorityMax: "7" }, true, "nonPriorityMax", "Non-priority cap must be ≤ priority cap"],
    [{ priorityRunLimit: "-1" }, true, "priorityRunLimit", `Priority run limit ${WHOLE}`],
    [{ priorityRunLimit: "" }, true, "priorityRunLimit", `Priority run limit ${WHOLE}`],
    [{ priorityRunLimit: "0.5" }, true, "priorityRunLimit", `Priority run limit ${WHOLE}`],
    [{}, false, "divisionPriority", "The division list has not loaded yet"],
  ])("refuses %j with one message", (patch, loaded, path, message) => {
    expect(issues(sessionFormSchema(loaded).safeParse({ ...VALID, ...patch }))).toEqual([[path, message]]);
  });

  it("accepts caps and a run limit of 0", () => {
    const zero = { ...VALID, priorityMax: "0", nonPriorityMax: "0", priorityRunLimit: "0" };
    expect(sessionFormSchema(true).safeParse(zero).success).toBe(true);
  });

  it("reports only the first problem, in form order", () => {
    const r = sessionFormSchema(false).safeParse({ ...VALID, startTime: "", priorityMax: "-1" });
    expect(issues(r)).toEqual([["startTime", "Start time is required"]]);
  });
});

describe("newSessionForm / sessionFormFromSession", () => {
  it("starts a new session on the event's first day, with check-in opening before the start", () => {
    const form = newSessionForm(fx.event({ id: "e-1", start_date: "2027-03-01" }));
    expect(form).toMatchObject({ eventId: "e-1", date: "2027-03-01", checkinOffsetMins: "30", durationMins: "120" });
    expect(sessionFormSchema(true).safeParse(form).success).toBe(true);
  });

  it("reads a saved session back as the wall-clock time and offsets in its timezone", () => {
    const start = Date.UTC(2027, 2, 1, 13, 0); // 7:00 AM in Chicago (CST)
    const s = fx.session({
      id: "s-1", event_id: "e-1", date: "2027-03-01",
      checkin_opens_at: start - 45 * 60_000, floor_trial_starts_at: start, floor_trial_ends_at: start + 90 * 60_000,
      active_priority_max: 5, active_non_priority_max: 3,
      divisions: [
        { id: "d1", division_name: "Classic", is_priority: true, sort_order: 0, priority_run_limit: 2 },
        { id: "d2", division_name: "Showcase", is_priority: false, sort_order: 1, priority_run_limit: null },
      ],
    });
    expect(sessionFormFromSession(s, "America/Chicago")).toEqual({
      eventId: "e-1", date: "2027-03-01", startTime: "07:00", checkinOffsetMins: "45", durationMins: "90",
      priorityMax: "5", nonPriorityMax: "3", priorityRunLimit: "2",
      divisionPriority: { Classic: true, Showcase: false },
    });
  });
});

describe("buildSessionPayload", () => {
  it("builds the session's fields in the event's timezone and every division in order", () => {
    const start = Date.UTC(2027, 2, 1, 13, 0);
    const { fields, divisions } = buildSessionPayload(
      { ...VALID, priorityRunLimit: "2" },
      "America/Chicago",
      ["Classic", "Showcase"]
    );
    expect(fields).toEqual({
      event_id: "e-1",
      name: "Monday, March 1, 2027",
      date: "2027-03-01",
      checkin_opens_at: start - 30 * 60_000,
      floor_trial_starts_at: start,
      floor_trial_ends_at: start + 120 * 60_000,
      active_priority_max: 6,
      active_non_priority_max: 4,
    });
    expect(divisions).toEqual([
      { division_name: "Classic", is_priority: true, sort_order: 0, priority_run_limit: 2 },
      { division_name: "Showcase", is_priority: false, sort_order: 1, priority_run_limit: 0 },
    ]);
  });
});
