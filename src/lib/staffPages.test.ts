import { describe, expect, it } from "vitest";
import { eventsForStaffPage, rolesHeld, staffPagePath, staffPagesFor } from "./staffPages";

describe("staffPages", () => {
  const roles = [
    { event_id: "open", role: "coordinator" as const },
    { event_id: "dcsx", role: "dj" as const },
    { event_id: "open", role: "dj" as const },
    { event_id: "fling", role: "coordinator" as const },
  ];

  it("names the roles held, least to richest", () => {
    expect(rolesHeld(roles)).toEqual(["coordinator", "dj"]);
  });

  it("lists the pages any held role opens, in the richest portal's order", () => {
    expect(staffPagesFor(roles).map((p) => p.slug)).toEqual([
      "queue",
      "sessions",
      "runs",
      "checkin-for",
      "upload-for",
      "registrations",
      "submissions",
      "drive",
    ]);
    expect(staffPagesFor([])).toEqual([]);
  });

  it("offers a page on each event whose richest role has it", () => {
    expect(eventsForStaffPage(roles, "registrations")).toEqual(["open", "dcsx", "fling"]);
    expect(eventsForStaffPage(roles, "queue")).toEqual(["open", "dcsx"]);
    expect(eventsForStaffPage(roles, "staff")).toEqual([]);
  });

  it("builds a page's path, with or without an event", () => {
    expect(staffPagePath("queue")).toBe("/staff/queue");
    expect(staffPagePath("queue", "the open")).toBe("/staff/queue?event=the%20open");
  });
});
