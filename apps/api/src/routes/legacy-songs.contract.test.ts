/**
 * Contract tests — GET /v1/legacy-songs
 *
 * Validates that the legacy song list payload satisfies ApiLegacySong.
 * This endpoint is public (no auth required).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiLegacySongSchema } from "@deejaytools/schemas";
import { app } from "../app.js";
import { readJson } from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return { requireAuth: mockRequireAuth(), requireAdmin: mockRequireAdmin() };
});

const BASE = "/v1/legacy-songs";

const dbLegacyRow = {
  id: "legacy-1",
  partnership: "Alice & Bob",
  division: "Classic" as string | null,
  routine_name: "Our Routine" as string | null,
  descriptor: "Comp" as string | null,
  version: "Spring 2025" as string | null,
  submitted_at: "2025-03-01" as string | null,
};

beforeEach(resetSelectQueue);

describe("GET /v1/legacy-songs — contract", () => {
  it("body.data is an array of ApiLegacySong", async () => {
    enqueueSelectResult([dbLegacyRow]);
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiLegacySongSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("all nullable fields (division, routine_name, descriptor, version, submitted_at) accepted as null", async () => {
    enqueueSelectResult([{
      ...dbLegacyRow,
      division: null,
      routine_name: null,
      descriptor: null,
      version: null,
      submitted_at: null,
    }]);
    const res = await app.request(BASE);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiLegacySongSchema).safeParse(data).success).toBe(true);
  });

  it("routine_name is coalesced from version when routine is empty", async () => {
    // Route maps empty/missing routine_name to version value
    enqueueSelectResult([{ ...dbLegacyRow, routine_name: null, version: "The Open 2025" }]);
    const res = await app.request(BASE);
    const { data } = await readJson<{ data: unknown[] }>(res);
    const result = z.array(ApiLegacySongSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
    const entries = data as Array<Record<string, unknown>>;
    expect(entries[0]!.routine_name).toBe("The Open 2025");
  });

  it("empty list is accepted", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiLegacySongSchema).safeParse(data).success).toBe(true);
  });
});
