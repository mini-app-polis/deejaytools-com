import { describe, expect, it } from "vitest";
import { viewAsDestination } from "./adminViewAs";

describe("viewAsDestination", () => {
  it.each([
    // An admin page opens its staff page, where the role has it.
    ["/admin/registrations", "coordinator", "/staff/registrations"],
    ["/manager/active-sessions", "dj", "/staff/queue"],
    ["/admin/events", "event-manager", "/staff/event"],
    // Else the role's first staff page.
    ["/manager/active-sessions", "coordinator", "/staff/registrations"],
    ["/admin/users", "dj", "/staff/queue"],
    // A staff page stays where the role has it.
    ["/staff/submissions", "coordinator", "/staff/submissions"],
    ["/staff/staff", "dj", "/staff/queue"],
    // A portal keeps its event, and its section where the role has it.
    ["/events/ev/manage/registrations", "coordinator", "/events/ev/coordinator/registrations"],
    ["/events/ev/manage/staff", "dj", "/events/ev/dj"],
    // Pages everyone sees stay.
    ["/events/ev", "dj", "/events/ev"],
    ["/my-content", "event-manager", "/my-content"],
    // A dancer: admin and staff pages and portals go to the events list.
    ["/admin/registrations", "dancer", "/events"],
    ["/staff/queue", "dancer", "/events"],
    ["/events/ev/dj/queue", "dancer", "/events"],
    ["/floor-trials", "dancer", "/floor-trials"],
  ] as const)("from %s as %s lands on %s", (from, role, to) => {
    expect(viewAsDestination(from, { role })).toBe(to);
  });
});
