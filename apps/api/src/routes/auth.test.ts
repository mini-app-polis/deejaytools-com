import { beforeEach, describe, expect, it, vi } from "vitest";
import * as tsUtils from "@deejaytools/ts-utils";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessEnvelope,
  authHeaders,
  type ErrorEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("@deejaytools/ts-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@deejaytools/ts-utils")>();
  return {
    ...actual,
    verifyClerkToken: vi.fn(),
  };
});

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});

const verifyClerkToken = vi.mocked(tsUtils.verifyClerkToken);

describe("POST /v1/auth/sync", () => {
  beforeEach(() => {
    resetSelectQueue();
    verifyClerkToken.mockReset();
  });

  it("returns 401 without bearer token", async () => {
    const res = await app.request("/v1/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "sync@example.com",
      }),
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 200 and user envelope on valid token (upsert)", async () => {
    verifyClerkToken.mockResolvedValue({ sub: "user_sync_1", email: "sync@example.com" });
    const userRow = {
      id: "user_sync_1",
      email: "sync@example.com",
      firstName: "S",
      lastName: "Y",
      displayName: null,
      role: "user" as const,
      createdAt: 1,
      updatedAt: 2,
    };
    enqueueSelectResult([userRow]);
    const res = await app.request("/v1/auth/sync", {
      method: "POST",
      headers: {
        Authorization: "Bearer fake.jwt.token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "sync@example.com",
        firstName: "S",
        lastName: "Y",
      }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({
      id: "user_sync_1",
      email: "sync@example.com",
      first_name: "S",
      last_name: "Y",
      role: "user",
    });
  });
});

describe("GET /v1/auth/me", () => {
  beforeEach(() => {
    resetSelectQueue();
    verifyClerkToken.mockReset();
  });

  it("returns 401 without token", async () => {
    const res = await app.request("/v1/auth/me");
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 200 with user shape when token and synced user exist", async () => {
    verifyClerkToken.mockResolvedValue({ sub: "user_me_1" });
    const userRow = {
      id: "user_me_1",
      email: "me@example.com",
      firstName: "M",
      lastName: "E",
      displayName: null,
      role: "user" as const,
      createdAt: 5,
      updatedAt: 6,
    };
    enqueueSelectResult([userRow]);
    enqueueSelectResult([userRow]);
    const res = await app.request("/v1/auth/me", { headers: authHeaders({ userId: "user_me_1" }) });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({
      id: "user_me_1",
      email: "me@example.com",
      first_name: "M",
      last_name: "E",
      role: "user",
    });
  });
});
