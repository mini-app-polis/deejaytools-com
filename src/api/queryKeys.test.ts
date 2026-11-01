import { describe, expect, it } from "vitest";
import { endpoints } from "./endpoints";
import { queryKey } from "./queryKeys";

describe("queryKey", () => {
  it("is the endpoint id alone when the call has no params", () => {
    expect(queryKey(endpoints.sessions.list)).toEqual(["sessions.list"]);
  });

  it("is the endpoint id and the params when it has them", () => {
    expect(queryKey(endpoints.sessions.list, { eventId: "e1" })).toEqual(["sessions.list", { eventId: "e1" }]);
    expect(queryKey(endpoints.sessions.get, { id: "s1" })).toEqual(["sessions.get", { id: "s1" }]);
  });

  it("puts a scope right after the id, ahead of any params", () => {
    expect(queryKey(endpoints.auth.me, undefined, "user_a")).toEqual(["auth.me", "user_a"]);
    expect(queryKey(endpoints.sessions.list, { eventId: "e1" }, "user_a")).toEqual([
      "sessions.list",
      "user_a",
      { eventId: "e1" },
    ]);
  });

  it("gives each scope its own key under the unscoped prefix", () => {
    const a = queryKey(endpoints.auth.me, undefined, "user_a");
    const b = queryKey(endpoints.auth.me, undefined, "user_b");
    expect(a).not.toEqual(b);
    const prefix = queryKey(endpoints.auth.me);
    expect(a.slice(0, prefix.length)).toEqual(prefix);
    expect(b.slice(0, prefix.length)).toEqual(prefix);
  });
});
