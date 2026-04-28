import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertSuccessListEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});

const ENDPOINT = "/v1/legacy-songs";

type LegacySong = {
  id: string;
  partnership: string;
  division: string | null;
  routine_name: string | null;
  descriptor: string | null;
  version: string | null;
  submitted_at: string | null;
};

describe("GET /v1/legacy-songs", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("is public — works without auth and returns a list envelope", async () => {
    enqueueSelectResult([]);
    const res = await app.request(ENDPOINT);
    expect(res.status).toBe(200);
    assertSuccessListEnvelope(await readJson<SuccessEnvelope<unknown[]>>(res));
  });

  it("returns rows verbatim when routine_name is set", async () => {
    enqueueSelectResult([
      {
        id: "L1",
        partnership: "Alice & Bob",
        division: "Classic",
        routine_name: "Sky High",
        descriptor: null,
        version: "The Open 2025",
        submitted_at: "2025-01-01",
      },
    ]);
    const res = await app.request(ENDPOINT);
    const body = await readJson<SuccessEnvelope<LegacySong[]>>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].routine_name).toBe("Sky High");
    // Version is preserved as its own field.
    expect(body.data[0].version).toBe("The Open 2025");
  });

  it("coalesces routine_name to version when routine_name is empty/null", async () => {
    enqueueSelectResult([
      {
        id: "L2",
        partnership: "Carol & Dave",
        division: "Rising Star Classic",
        routine_name: null,
        descriptor: null,
        version: "The Open 2025",
        submitted_at: null,
      },
      {
        id: "L3",
        partnership: "Eve & Frank",
        division: "Masters",
        routine_name: "   ",
        descriptor: null,
        version: "Spring 2024",
        submitted_at: null,
      },
    ]);
    const res = await app.request(ENDPOINT);
    const body = await readJson<SuccessEnvelope<LegacySong[]>>(res);
    expect(body.data[0].routine_name).toBe("The Open 2025");
    // Even whitespace-only routine names should fall back to version.
    expect(body.data[1].routine_name).toBe("Spring 2024");
  });

  it("returns null for routine_name when both routine_name and version are missing", async () => {
    enqueueSelectResult([
      {
        id: "L4",
        partnership: "Grace & Henry",
        division: "Showcase",
        routine_name: null,
        descriptor: null,
        version: null,
        submitted_at: null,
      },
    ]);
    const res = await app.request(ENDPOINT);
    const body = await readJson<SuccessEnvelope<LegacySong[]>>(res);
    expect(body.data[0].routine_name).toBeNull();
  });

  it("accepts the q query param without erroring", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${ENDPOINT}?q=Smith`);
    expect(res.status).toBe(200);
  });

  it("accepts the division query param without erroring", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${ENDPOINT}?division=Classic`);
    expect(res.status).toBe(200);
  });

  it("accepts both query params combined without erroring", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${ENDPOINT}?q=Smith&division=Classic`);
    expect(res.status).toBe(200);
  });
});
