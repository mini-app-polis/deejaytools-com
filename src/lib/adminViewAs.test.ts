import { describe, expect, it } from "vitest";
import { eventOfPath, viewAsDestination } from "./adminViewAs";

describe("viewAsDestination", () => {
  it.each([
    // An admin page opens its staff version, where the role has it.
    ["/admin/registrations", "coordinator", "/events/ev/coordinator/registrations"],
    ["/manager/active-sessions", "dj", "/events/ev/dj/queue"],
    ["/manager/active-sessions", "coordinator", "/events/ev/coordinator"],
    ["/admin/events", "event-manager", "/events/ev/manage/event"],
    // An admin page with none opens the role's portal.
    ["/admin/users", "dj", "/events/ev/dj"],
    // A portal keeps its section where the role has it.
    ["/events/ev/manage/registrations", "coordinator", "/events/ev/coordinator/registrations"],
    ["/events/ev/manage/staff", "dj", "/events/ev/dj"],
    // The event's page stays; another event's page moves to this one.
    ["/events/ev", "dj", "/events/ev"],
    ["/events/other", "coordinator", "/events/ev"],
    // Pages everyone sees stay.
    ["/my-content", "event-manager", "/my-content"],
    // A dancer: admin pages and portals go to the event's page.
    ["/admin/registrations", "dancer", "/events/ev"],
    ["/events/ev/dj/queue", "dancer", "/events/ev"],
    ["/floor-trials", "dancer", "/floor-trials"],
  ] as const)("from %s as %s lands on %s", (from, role, to) => {
    expect(viewAsDestination(from, { role, eventId: "ev" })).toBe(to);
  });
});

describe("eventOfPath", () => {
  it("names the event of an event page or portal, and nothing else", () => {
    expect(eventOfPath("/events/ev")).toBe("ev");
    expect(eventOfPath("/events/ev/dj/queue")).toBe("ev");
    expect(eventOfPath("/events")).toBeNull();
    expect(eventOfPath("/admin/registrations")).toBeNull();
  });
});
