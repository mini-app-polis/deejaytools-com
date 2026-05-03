/**
 * Contract tests — GET /v1/admin/songs
 *
 * Validates that the admin songs list payload satisfies ApiAdminSong.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiAdminSongSchema } from "@deejaytools/schemas";
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

const BASE = "/v1/admin/songs";

const dbSongWithPartner = {
  id: "song_partnered",
  displayName: "Sky High",
  processedFilename: "alice_bob_classic_2026_v03.mp3",
  division: "Classic",
  routineName: "Sky High",
  seasonYear: "2026",
  createdAt: 1_700_000_000_000,
  deletedAt: null as number | null,
  ownerId: "u_alice",
  ownerEmail: "alice@example.com",
  ownerFirst: "Alice",
  ownerLast: "Smith",
  partnerId: "p_bob" as string | null,
  partnerFirst: "Bob" as string | null,
  partnerLast: "Jones" as string | null,
  partnerLinkedUserEmail: "bob@example.com" as string | null,
};

const dbSongSolo = {
  ...dbSongWithPartner,
  id: "song_solo",
  partnerId: null,
  partnerFirst: null,
  partnerLast: null,
  partnerLinkedUserEmail: null,
};

const dbSongDeleted = {
  ...dbSongWithPartner,
  id: "song_deleted",
  deletedAt: 1_695_000_000_000,
};

beforeEach(resetSelectQueue);

describe("GET /v1/admin/songs — contract", () => {
  it("body.data is an array of ApiAdminSong", async () => {
    enqueueSelectResult([dbSongWithPartner, dbSongSolo]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiAdminSongSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("solo songs (partner: null) satisfy the schema", async () => {
    enqueueSelectResult([dbSongSolo]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiAdminSongSchema).safeParse(data).success).toBe(true);
  });

  it("soft-deleted songs (deleted_at: number) satisfy the schema", async () => {
    enqueueSelectResult([dbSongDeleted]);
    const res = await app.request(`${BASE}?include_deleted=true`, {
      headers: adminHeaders(),
    });
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiAdminSongSchema).safeParse(data).success).toBe(true);
  });

  it("empty list is accepted", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiAdminSongSchema).safeParse(data).success).toBe(true);
  });
});
