import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractViolation, setContractMode } from "./contract";
import { allEndpoints, call, checkEndpoint, endpoints, type Transport } from "./endpoints";

function fakeTransport(response: unknown): Transport & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn().mockResolvedValue(response),
    post: vi.fn().mockResolvedValue(response),
    patch: vi.fn().mockResolvedValue(response),
    put: vi.fn().mockResolvedValue(response),
    del: vi.fn().mockResolvedValue(response),
  };
}

const session = {
  id: "s1",
  event_id: "e1",
  name: "Saturday",
  date: "2026-05-23",
  checkin_opens_at: 1,
  floor_trial_starts_at: 2,
  floor_trial_ends_at: 3,
  active_priority_max: 6,
  active_non_priority_max: 4,
  status: "scheduled",
  created_by: "u1",
  created_at: 0,
};

beforeEach(() => {
  setContractMode("strict");
});

afterEach(() => {
  setContractMode(null);
});

describe("endpoint paths", () => {
  it("percent-encodes ids so a slash or space cannot escape the path segment", () => {
    expect(endpoints.events.get.path({ id: "a/b c" })).toBe("/v1/events/a%2Fb%20c");
    expect(endpoints.queue.active.path({ sessionId: "s/1" })).toBe("/v1/queue/s%2F1/active");
    expect(endpoints.admin.setUserRole.path({ id: "u?1" })).toBe("/v1/admin/users/u%3F1/role");
  });

  it("adds the event filter to list paths only when one is given", () => {
    expect(endpoints.sessions.list.path()).toBe("/v1/sessions");
    expect(endpoints.sessions.list.path({})).toBe("/v1/sessions");
    expect(endpoints.sessions.list.path({ eventId: "e 1" })).toBe("/v1/sessions?event_id=e%201");
    expect(endpoints.eventSongSubmissions.list.path()).toBe("/v1/event-song-submissions");
    expect(endpoints.eventSongSubmissions.list.path({ eventId: "e1" })).toBe(
      "/v1/event-song-submissions?event_id=e1"
    );
  });

  it("appends a pre-built query string only when it is non-empty", () => {
    expect(endpoints.runs.list.path()).toBe("/v1/runs");
    expect(endpoints.runs.list.path({ query: "" })).toBe("/v1/runs");
    expect(endpoints.runs.list.path({ query: "limit=500" })).toBe("/v1/runs?limit=500");
    expect(endpoints.admin.songs.path({ query: "q=x&include_deleted=true" })).toBe(
      "/v1/admin/songs?q=x&include_deleted=true"
    );
  });

  it("builds the admin user search and per-user submission paths", () => {
    expect(endpoints.admin.users.path()).toBe("/v1/admin/users");
    expect(endpoints.admin.users.path({ q: "a&b" })).toBe("/v1/admin/users?q=a%26b");
    expect(endpoints.admin.userEventSongSubmissions.path({ id: "u1", eventId: "e 1" })).toBe(
      "/v1/admin/users/u1/event-song-submissions?event_id=e%201"
    );
    expect(endpoints.admin.eventSongSubmissions.path({ eventId: "e1" })).toBe(
      "/v1/admin/event-song-submissions?event_id=e1"
    );
  });

  it("gives every endpoint a unique id and a path that starts with /v1/", () => {
    const all = allEndpoints();
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ep of all) {
      const sample = ep.path({ id: "x", sessionId: "x", eventId: "x" });
      expect(sample.startsWith("/v1/")).toBe(true);
    }
  });

  it("marks only the three deliberately out-of-client calls as fetch transport", () => {
    const fetchIds = allEndpoints()
      .filter((e) => e.transport === "fetch")
      .map((e) => e.id)
      .sort();
    expect(fetchIds).toEqual(["auth.sync", "feedback.submit", "songs.uploadChunk"]);
  });
});

describe("call", () => {
  it("dispatches GET to the transport and returns the validated data", async () => {
    const api = fakeTransport([session]);
    const out = await call(api, endpoints.sessions.list, { params: { eventId: "e1" } });
    expect(api.get).toHaveBeenCalledWith("/v1/sessions?event_id=e1");
    expect(out).toEqual([session]);
  });

  it("works without any options for a parameterless GET", async () => {
    const api = fakeTransport([]);
    await call(api, endpoints.events.list);
    expect(api.get).toHaveBeenCalledWith("/v1/events");
  });

  it("dispatches POST, PATCH and PUT with the body", async () => {
    const api = fakeTransport(session);
    await call(api, endpoints.sessions.create, { body: { name: "x" } });
    expect(api.post).toHaveBeenCalledWith("/v1/sessions", { name: "x" });

    await call(api, endpoints.sessions.update, { params: { id: "s1" }, body: { name: "y" } });
    expect(api.patch).toHaveBeenCalledWith("/v1/sessions/s1", { name: "y" });

    await call(api, endpoints.sessions.setDivisions, {
      params: { id: "s1" },
      body: { divisions: [] },
    });
    expect(api.put).toHaveBeenCalledWith("/v1/sessions/s1/divisions", { divisions: [] });
  });

  it("dispatches DELETE and returns undefined for a 204 endpoint", async () => {
    const api = fakeTransport(undefined);
    const out = await call(api, endpoints.songs.remove, { params: { id: "song1" } });
    expect(api.del).toHaveBeenCalledWith("/v1/songs/song1");
    expect(out).toBeUndefined();
  });

  it("validates acknowledgement bodies on DELETE", async () => {
    const api = fakeTransport({ deleted: true });
    await expect(call(api, endpoints.events.remove, { params: { id: "e1" } })).resolves.toEqual({
      deleted: true,
    });

    const bad = fakeTransport({ deleted: false });
    await expect(
      call(bad, endpoints.events.remove, { params: { id: "e1" } })
    ).rejects.toBeInstanceOf(ContractViolation);
  });

  it("throws a ContractViolation naming the endpoint when the response is the wrong shape", async () => {
    const api = fakeTransport([{ id: "s1" }]);
    await expect(call(api, endpoints.sessions.list)).rejects.toThrow(
      /API contract violation on sessions\.list/
    );
  });

  it("applies schema defaults to the returned data", async () => {
    const checkin = {
      id: "c1",
      sessionId: "s1",
      eventName: null,
      sessionName: "S",
      sessionFloorTrialStartsAt: 1,
      sessionStatus: "scheduled",
      eventTimezone: null,
      divisionName: "Classic",
      entityLabel: "A & B",
      songDisplayName: null,
      songProcessedFilename: null,
      notes: null,
      checkedInAt: 1,
      queueEntryId: "q1",
      queueType: "priority",
      queuePosition: 1,
      overallPosition: 1,
    };
    const api = fakeTransport([checkin]);
    const [out] = await call(api, endpoints.checkins.mine);
    expect(out.runCount).toBe(0);
  });
});

describe("checkEndpoint", () => {
  it("returns undefined for endpoints with no response body", () => {
    expect(checkEndpoint(endpoints.partners.remove, { anything: true })).toBeUndefined();
  });

  it("validates fetch-transport responses against their schema", () => {
    expect(checkEndpoint(endpoints.feedback.submit, null)).toBeNull();
    expect(() => checkEndpoint(endpoints.feedback.submit, { ok: true })).toThrow(
      ContractViolation
    );
  });
});
