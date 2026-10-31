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
});
