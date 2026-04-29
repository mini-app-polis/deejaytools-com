/**
 * Contract tests — GET /v1/partners and GET /v1/partners/leading-pairs
 *
 * Validates ApiPartner and ApiLeadingPair shapes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiLeadingPairSchema, ApiPartnerSchema } from "@deejaytools/schemas";
import { app } from "../app.js";
import { authHeaders, readJson } from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return { requireAuth: mockRequireAuth(), requireAdmin: mockRequireAdmin() };
});

const BASE = "/v1/partners";

const dbPartner = {
  id: "partner-1",
  userId: "user_test123",
  firstName: "Bob",
  lastName: "Jones",
  partnerRole: "follower",
  email: "bob@example.com",
  linkedUserId: null as string | null,
  createdAt: 1_000_000,
  updatedAt: 2_000_000,
};

beforeEach(resetSelectQueue);

describe("GET /v1/partners — contract", () => {
  it("body.data is an array of ApiPartner", async () => {
    enqueueSelectResult([dbPartner]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiPartnerSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("nullable email and linkedUserId are accepted", async () => {
    enqueueSelectResult([{ ...dbPartner, email: null, linkedUserId: null }]);
    const res = await app.request(BASE, { headers: authHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiPartnerSchema).safeParse(data).success).toBe(true);
  });
});

describe("GET /v1/partners/leading-pairs — contract", () => {
  it("body.data is an array of ApiLeadingPair (no partner_b_id)", async () => {
    // leading-pairs: one select for pairs then per-pair partner lookup
    // Pair with partnerBId = null → no secondary lookup
    enqueueSelectResult([{ id: "pair-1", partnerBId: null }]);
    const res = await app.request(`${BASE}/leading-pairs`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiLeadingPairSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("pair with partner_b_id set passes schema", async () => {
    // Pair with partnerBId set → secondary partner select
    enqueueSelectResult([{ id: "pair-2", partnerBId: "partner-1" }]);
    enqueueSelectResult([dbPartner]); // partner lookup
    const res = await app.request(`${BASE}/leading-pairs`, { headers: authHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiLeadingPairSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
    const pairs = data as Array<Record<string, unknown>>;
    expect(pairs[0]!.partner_b_id).toBe("partner-1");
    expect(pairs[0]!.display_name).toBe("Bob Jones");
  });
});
