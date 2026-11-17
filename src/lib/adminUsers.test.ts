import { describe, expect, it } from "vitest";
import { fx } from "@/test/fixtures";
import { DEFAULT_USER_SORT, nextUserSort, rolesByEvent, sortUsers } from "./adminUsers";

const role = (event_id: string, event_name: string, r: "coordinator" | "dj" | "event-manager") => ({
  event_id,
  event_name,
  event_start_date: "2026-11-26",
  role: r,
});

describe("rolesByEvent", () => {
  it("groups a user's roles by event, keeping the API's event order, roles least to richest", () => {
    const user = fx.adminUser({
      staff_roles: [role("open", "The Open", "event-manager"), role("open", "The Open", "dj"), role("fling", "Fling", "coordinator")],
    });
    expect(rolesByEvent(user)).toEqual([
      { eventId: "open", eventName: "The Open", roles: ["dj", "event-manager"] },
      { eventId: "fling", eventName: "Fling", roles: ["coordinator"] },
    ]);
    expect(rolesByEvent(fx.adminUser({}))).toEqual([]);
  });
});

describe("sortUsers", () => {
  const ann = fx.adminUser({ id: "a", first_name: "Ann", email: "zed@x.test", created_at: 3, song_count: 1 });
  const bob = fx.adminUser({ id: "b", first_name: "bob", email: "amy@x.test", created_at: 1, song_count: 5 });
  const nameless = fx.adminUser({ id: "c", email: "m@x.test", created_at: 2, song_count: 5 });
  const users = [ann, bob, nameless];
  const ids = (list: { id: string }[]) => list.map((u) => u.id);

  it("starts in joined order, oldest first", () => {
    expect(ids(sortUsers(users, DEFAULT_USER_SORT))).toEqual(["b", "c", "a"]);
  });

  it("sorts names A to Z ignoring case, with the nameless last either way", () => {
    expect(ids(sortUsers(users, { key: "name", direction: "asc" }))).toEqual(["a", "b", "c"]);
    expect(ids(sortUsers(users, { key: "name", direction: "desc" }))).toEqual(["b", "a", "c"]);
  });

  it("sorts by email", () => {
    expect(ids(sortUsers(users, { key: "email", direction: "asc" }))).toEqual(["b", "c", "a"]);
  });

  it("sorts counts, breaking ties by the oldest account", () => {
    expect(ids(sortUsers(users, { key: "song_count", direction: "desc" }))).toEqual(["b", "c", "a"]);
    expect(ids(sortUsers(users, { key: "song_count", direction: "asc" }))).toEqual(["a", "b", "c"]);
  });

  it("ranks roles: admins, then the richest staff role, then how many events", () => {
    const admin = fx.adminUser({ id: "admin", role: "admin", created_at: 9 });
    const manager = fx.adminUser({ id: "em", created_at: 8, staff_roles: [role("e1", "E1", "event-manager")] });
    const twoDj = fx.adminUser({
      id: "dj2",
      created_at: 7,
      staff_roles: [role("e1", "E1", "dj"), role("e2", "E2", "dj")],
    });
    const oneDj = fx.adminUser({ id: "dj1", created_at: 6, staff_roles: [role("e1", "E1", "dj")] });
    const plain = fx.adminUser({ id: "plain", created_at: 5 });
    const sorted = sortUsers([plain, oneDj, twoDj, manager, admin], { key: "roles", direction: "desc" });
    expect(ids(sorted)).toEqual(["admin", "em", "dj2", "dj1", "plain"]);
  });

  it("does not change the list it is given", () => {
    const list = [ann, bob];
    sortUsers(list, { key: "name", direction: "desc" });
    expect(ids(list)).toEqual(["a", "b"]);
  });
});

describe("nextUserSort", () => {
  it("flips the direction on the same column, and starts a new one at its natural direction", () => {
    expect(nextUserSort(DEFAULT_USER_SORT, "name")).toEqual({ key: "name", direction: "asc" });
    expect(nextUserSort({ key: "name", direction: "asc" }, "name")).toEqual({ key: "name", direction: "desc" });
    expect(nextUserSort({ key: "name", direction: "asc" }, "song_count")).toEqual({ key: "song_count", direction: "desc" });
    expect(nextUserSort({ key: "song_count", direction: "desc" }, "roles")).toEqual({ key: "roles", direction: "desc" });
  });
});
