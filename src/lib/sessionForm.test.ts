import { describe, expect, it } from "vitest";
import { adminSessionFormSchema, sessionFormSchema } from "./sessionForm";

const VALID = {
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

  it.each([
    [{ date: "" }, true, "date", "Date is required"],
    [{ startTime: "" }, true, "startTime", "Start time is required"],
    [{}, false, "divisionPriority", "The division list has not loaded yet"],
    [{ priorityMax: "-1" }, true, "priorityMax", "Active cap (priority) must be a non-negative number"],
    [{ priorityMax: "x" }, true, "priorityMax", "Active cap (priority) must be a non-negative number"],
    [{ nonPriorityMax: "-1" }, true, "nonPriorityMax", "Active cap (non-priority) must be a non-negative number"],
    [{ nonPriorityMax: "7" }, true, "nonPriorityMax", "Non-priority cap must be ≤ priority cap"],
    [{ priorityRunLimit: "-1" }, true, "priorityRunLimit", "Priority run limit must be a non-negative number"],
  ])("refuses %j with one message", (patch, loaded, path, message) => {
    expect(issues(sessionFormSchema(loaded).safeParse({ ...VALID, ...patch }))).toEqual([[path, message]]);
  });

  it("reports only the first problem, in form order", () => {
    const r = sessionFormSchema(false).safeParse({ ...VALID, startTime: "", priorityMax: "-1" });
    expect(issues(r)).toEqual([["startTime", "Start time is required"]]);
  });
});

describe("adminSessionFormSchema", () => {
  it("asks for the event first", () => {
    const r = adminSessionFormSchema(false).safeParse({ ...VALID, eventId: "", date: "" });
    expect(issues(r)).toEqual([["eventId", "Select an event"]]);
  });

  it("checks the session fields once an event is picked", () => {
    expect(issues(adminSessionFormSchema(true).safeParse({ ...VALID, eventId: "e-1", date: "" }))).toEqual([
      ["date", "Date is required"],
    ]);
    expect(adminSessionFormSchema(true).safeParse({ ...VALID, eventId: "e-1" }).success).toBe(true);
  });
});
