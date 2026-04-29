/**
 * Contract tests — GET /v1/runs
 *
 * The runs endpoint returns a complex join (checkin → song → session → event)
 * all flattened into ApiRun objects.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiRunSchema } from "@deejaytools/schemas";
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

const BASE = "/v1/runs";

/**
 * Raw join row returned by the runs query.  Field names mirror the
 * drizzle select aliases in routes/runs.ts.
 */
const dbRunRow = {
  id: "run-1",
  completedAt: 2_000_000,
  divisionName: "Classic",
  sessionId: "s-1",
  sessionFloorTrialStartsAt: 1_800_000 as number | null,
  eventId: "ev-1" as string | null,
  eventName: "Big Social" as string | null,
  songId: "song-1",
  songDisplayName: "My Routine – Classic 2026" as string | null,
  songProcessedFilename: "processed.mp3" as string | null,
  songDivision: "Classic" as string | null,
  songSeasonYear: "2026" as string | null,
  songRoutineName: "My Routine" as string | null,
  songOwnerFirst: "Alice" as string | null,
  songOwnerLast: "Smith" as string | null,
  songPartnerFirst: "Bob" as string | null,
  songPartnerLast: "Jones" as string | null,
  entityPairId: "pair-1" as string | null,
  entitySoloUserId: null as string | null,
  pairUserFirst: "Alice" as string | null,
  pairUserLast: "Smith" as string | null,
  pairPartnerFirst: "Bob" as string | null,
  pairPartnerLast: "Jones" as string | null,
  soloUserFirst: null as string | null,
  soloUserLast: null as string | null,
  completedByFirst: "Admin" as string | null,
  completedByLast: null as string | null,
};

beforeEach(resetSelectQueue);

describe("GET /v1/runs — contract", () => {
  it("body.data is an array of ApiRun", async () => {
    enqueueSelectResult([dbRunRow]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiRunSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("nullable optional fields (event_id, event_name) are accepted as null", async () => {
    enqueueSelectResult([{ ...dbRunRow, eventId: null, eventName: null, sessionFloorTrialStartsAt: null }]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiRunSchema).safeParse(data).success).toBe(true);
  });

  it("session_id filter accepted via query param", async () => {
    enqueueSelectResult([dbRunRow]);
    const res = await app.request(`${BASE}?session_id=s-1`, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiRunSchema).safeParse(data).success).toBe(true);
  });
});
