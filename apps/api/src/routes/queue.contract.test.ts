/**
 * Contract tests — queue list endpoints
 *
 * Covers: /active, /waiting, /priority (admin), /non-priority (admin).
 * Validates that each payload shape matches ApiQueueEntry from @deejaytools/schemas.
 *
 * The listQueue() helper does one DB join per call; the /waiting endpoint calls
 * it twice (priority + non-priority) and tags each entry with subQueue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiQueueEntrySchema } from "@deejaytools/schemas";
import { app } from "../app.js";
import { adminHeaders, authHeaders, readJson } from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";
import { responseCache } from "../lib/cache.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return { requireAuth: mockRequireAuth(), requireAdmin: mockRequireAdmin() };
});

const SESSION_ID = "s-1";
const BASE = `/v1/queue/${SESSION_ID}`;

/**
 * Raw DB row shape returned by the listQueue join.
 * The route's .then() maps these to the wire-format ApiQueueEntry fields.
 */
const dbQueueRow = {
  queueEntryId: "qe-1",
  checkinId: "ci-1",
  position: 1,
  enteredQueueAt: 1_000_000,
  entityPairId: "pair-1",
  entitySoloUserId: null as string | null,
  divisionName: "Classic",
  songId: "song-1",
  notes: null as string | null,
  initialQueue: "priority",
  checkedInAt: 900_000,
  pairUserFirst: "Alice",
  pairUserLast: "Smith",
  pairPartnerFirst: "Bob",
  pairPartnerLast: "Jones",
  soloUserFirst: null as string | null,
  soloUserLast: null as string | null,
};

const dbSoloRow = {
  ...dbQueueRow,
  queueEntryId: "qe-2",
  entityPairId: null,
  entitySoloUserId: "user_solo",
  initialQueue: "non_priority",
  pairUserFirst: null,
  pairUserLast: null,
  pairPartnerFirst: null,
  pairPartnerLast: null,
  soloUserFirst: "Carol",
  soloUserLast: "White",
};

beforeEach(() => {
  resetSelectQueue();
  responseCache.invalidatePrefix("");
});

describe("GET /v1/queue/:id/active — contract", () => {
  it("body.data is an array of ApiQueueEntry", async () => {
    enqueueSelectResult([dbQueueRow]);
    const res = await app.request(`${BASE}/active`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiQueueEntrySchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("solo entry (entitySoloUserId set, entityPairId null) satisfies schema", async () => {
    enqueueSelectResult([dbSoloRow]);
    const res = await app.request(`${BASE}/active`);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiQueueEntrySchema).safeParse(data).success).toBe(true);
  });

  it("songId: null is accepted (placeholder / missing song)", async () => {
    enqueueSelectResult([{ ...dbQueueRow, songId: null }]);
    const res = await app.request(`${BASE}/active`);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiQueueEntrySchema).safeParse(data).success).toBe(true);
  });
});

describe("GET /v1/queue/:id/waiting — contract", () => {
  it("body.data entries include subQueue tag and satisfy ApiQueueEntry", async () => {
    // waiting does two listQueue calls: priority then non_priority
    enqueueSelectResult([dbQueueRow]); // priority
    enqueueSelectResult([dbSoloRow]);  // non_priority
    const res = await app.request(`${BASE}/waiting`);
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown[] }>(res);
    const result = z.array(ApiQueueEntrySchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
    // Both entries should carry the subQueue tag
    const entries = data as Array<Record<string, unknown>>;
    expect(entries[0]!.subQueue).toBe("priority");
    expect(entries[1]!.subQueue).toBe("non_priority");
  });
});

describe("GET /v1/queue/:id/priority — contract (admin)", () => {
  it("body.data is an array of ApiQueueEntry", async () => {
    enqueueSelectResult([dbQueueRow]);
    const res = await app.request(`${BASE}/priority`, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiQueueEntrySchema).safeParse(data).success).toBe(true);
  });
});

describe("GET /v1/queue/:id/non-priority — contract (admin)", () => {
  it("body.data is an array of ApiQueueEntry", async () => {
    enqueueSelectResult([dbSoloRow]);
    const res = await app.request(`${BASE}/non-priority`, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiQueueEntrySchema).safeParse(data).success).toBe(true);
  });
});
