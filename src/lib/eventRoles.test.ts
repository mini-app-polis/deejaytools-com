import { describe, expect, it } from "vitest";
import { eventPortalPath, holdsEventRole, richestEventRole, staffEventsOf } from "./eventRoles";

describe("event roles", () => {
  const roles = [
    { event_id: "ev-1", role: "coordinator" as const },
    { event_id: "ev-1", role: "dj" as const },
    { event_id: "ev-2", role: "coordinator" as const },
    { event_id: "ev-3", role: "event-manager" as const },
  ];

  it("picks the richest role on an event: event manager, then DJ, then coordinator", () => {
    expect(richestEventRole(roles, "ev-1")).toBe("dj");
    expect(richestEventRole(roles, "ev-2")).toBe("coordinator");
    expect(richestEventRole(roles, "ev-3")).toBe("event-manager");
    expect(richestEventRole(roles, "ev-9")).toBeNull();
  });

  it("admits the needed role or a richer one, on that event only", () => {
    expect(holdsEventRole(roles, "ev-1", "coordinator")).toBe(true);
    expect(holdsEventRole(roles, "ev-1", "dj")).toBe(true);
    expect(holdsEventRole(roles, "ev-1", "event-manager")).toBe(false);
    expect(holdsEventRole(roles, "ev-2", "dj")).toBe(false);
    expect(holdsEventRole(roles, "ev-3", "coordinator")).toBe(true);
    expect(holdsEventRole(roles, "ev-9", "coordinator")).toBe(false);
    expect(holdsEventRole([], "ev-1", "coordinator")).toBe(false);
  });

  it("lists each event once with its richest role", () => {
    expect(staffEventsOf(roles)).toEqual([
      { event_id: "ev-1", role: "dj" },
      { event_id: "ev-2", role: "coordinator" },
      { event_id: "ev-3", role: "event-manager" },
    ]);
  });

  it("maps each role to its portal", () => {
    expect(eventPortalPath("ev 1", "coordinator")).toBe("/events/ev%201/coordinator");
    expect(eventPortalPath("ev-1", "dj")).toBe("/events/ev-1/dj");
    expect(eventPortalPath("ev-1", "event-manager")).toBe("/events/ev-1/manage");
  });
});
