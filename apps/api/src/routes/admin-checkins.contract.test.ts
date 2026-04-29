/**
 * Contract tests — GET /v1/admin/checkins/test
 *
 * Validates that the test-injection list payload satisfies ApiTestInjection.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiTestInjectionSchema } from "@deejaytools/schemas";
import { app } from "../app.js";
import { adminHeaders, readJson } from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return { requireAuth: mockRequireAuth(), requireAdmin: mockRequireAdmin() };
});

const BASE = "/v1/admin/checkins/test";

/**
 * Raw DB join row returned by the GET /test query.
 * Field names mirror the drizzle .select() aliases in admin-checkins.ts.
 */
const dbTestRow = {
  pairId: "pair-1",
  pairCreatedAt: 1_000_000,
  leaderFirst: "Alice",
  leaderLast: "Smith",
  followerFirst: "Bob" as string | null,
  followerLast: "Jones" as string | null,
  checkinId: "ci-1",
  sessionId: "s-1" as string | null,
  sessionName: "Test Session" as string | null,
  divisionName: "Classic" as string | null,
  initialQueue: "priority" as string | null,
  queueType: "priority" as string | null,
  position: 1 as number | null,
};

beforeEach(resetSelectQueue);

describe("GET /v1/admin/checkins/test — contract", () => {
  it("body.data is an array of ApiTestInjection", async () => {
    enqueueSelectResult([dbTestRow]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiTestInjectionSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("off-queue entry (queueType null) maps to queue_status: off_queue", async () => {
    enqueueSelectResult([{ ...dbTestRow, queueType: null, position: null }]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    const { data } = await readJson<{ data: unknown[] }>(res);
    const result = z.array(ApiTestInjectionSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
    const entries = data as Array<Record<string, unknown>>;
    expect(entries[0]!.queue_status).toBe("off_queue");
    expect(entries[0]!.position).toBeNull();
  });

  it("non_priority queue status satisfies schema", async () => {
    enqueueSelectResult([{ ...dbTestRow, queueType: "non_priority", position: 3 }]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiTestInjectionSchema).safeParse(data).success).toBe(true);
  });

  it("nullable follower name fields are accepted", async () => {
    enqueueSelectResult([{ ...dbTestRow, followerFirst: null, followerLast: null }]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    const { data } = await readJson<{ data: unknown[] }>(res);
    const result = z.array(ApiTestInjectionSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
    const entries = data as Array<Record<string, unknown>>;
    expect(entries[0]!.follower_name).toBeNull();
  });

  it("nullable session fields (no checkin) are accepted", async () => {
    enqueueSelectResult([{
      ...dbTestRow,
      checkinId: null,
      sessionId: null,
      sessionName: null,
      divisionName: null,
      initialQueue: null,
      queueType: null,
      position: null,
    }]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiTestInjectionSchema).safeParse(data).success).toBe(true);
  });

  it("empty list is accepted", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiTestInjectionSchema).safeParse(data).success).toBe(true);
  });
});
