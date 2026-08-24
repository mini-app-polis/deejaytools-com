import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessEnvelope,
  assertSuccessListEnvelope,
  assertValidation400,
  authHeaders,
  type ErrorEnvelope,
  MOCK_ADMIN,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../test/mocks.js";

const { enqueueDriveJob } = vi.hoisted(() => ({
  enqueueDriveJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return {
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});
vi.mock("@sentry/node", () => ({
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({ setLevel: vi.fn(), setTag: vi.fn(), setContext: vi.fn() })
  ),
  captureException: vi.fn(),
}));
vi.mock("../services/driveJobs.js", () => ({
  enqueueDriveJob,
}));

const BASE = "/v1/events";

describe("GET /v1/events", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("is public and returns a success list envelope", async () => {
    const ev = {
      id: "e1",
      name: "Social",
      startDate: "2026-01-01",
      endDate: "2026-01-03",
      createdBy: "user_admin123",
      createdAt: 1,
      updatedAt: 2,
    };
    enqueueSelectResult([ev]);
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "e1",
      name: "Social",
      start_date: "2026-01-01",
      end_date: "2026-01-03",
    });
  });
});

describe("POST /v1/events", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New event" }),
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 when name is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: {
        ...authHeaders(MOCK_ADMIN),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ start_date: "2026-06-01", end_date: "2026-06-01" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 when start_date or end_date is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: {
        ...authHeaders(MOCK_ADMIN),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Workshop" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("returns 201 with envelope on valid body", async () => {
    const created = {
      id: "e_new",
      name: "Workshop",
      startDate: "2026-06-01",
      endDate: "2026-06-03",
      createdBy: "user_admin123",
      createdAt: 10,
      updatedAt: 10,
    };
    enqueueSelectResult([created]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: {
        ...authHeaders(MOCK_ADMIN),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Workshop", start_date: "2026-06-01", end_date: "2026-06-03" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({ id: "e_new", name: "Workshop", start_date: "2026-06-01", end_date: "2026-06-03" });
  });
});

describe("PATCH /v1/events/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when event not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/missing`, {
      method: "PATCH",
      headers: {
        ...authHeaders(MOCK_ADMIN),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 200 on valid update", async () => {
    const existing = {
      id: "e1",
      name: "Old",
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      createdBy: "user_admin123",
      createdAt: 1,
      updatedAt: 2,
    };
    const updated = {
      ...existing,
      name: "New name",
      updatedAt: 99,
    };
    enqueueSelectResult([existing]);
    enqueueSelectResult([updated]);
    const res = await app.request(`${BASE}/e1`, {
      method: "PATCH",
      headers: {
        ...authHeaders(MOCK_ADMIN),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "New name" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({ id: "e1", name: "New name" });
  });
});

describe("DELETE /v1/events/:id", () => {
  const existing = {
    id: "e1",
    name: "Spring Classic",
    startDate: "2026-06-01",
    endDate: "2026-06-01",
    timezone: "America/Chicago",
    createdBy: "user_admin123",
    createdAt: 1,
    updatedAt: 2,
  };

  beforeEach(() => {
    resetSelectQueue();
    enqueueDriveJob.mockClear();
    vi.mocked(Sentry.captureException).mockClear();
    vi.mocked(mockDb.delete).mockClear();
    vi.mocked(mockDb.transaction).mockClear();
    vi.mocked(mockDb.select).mockImplementation(() => mockDb);
    vi.mocked(mockDb.delete).mockImplementation(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mocked(mockDb.transaction).mockImplementation((fn) => fn(mockDb));
  });

  it("returns 404 when event not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/missing`, {
      method: "DELETE",
      headers: authHeaders(MOCK_ADMIN),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("deletes an event with submissions and enqueues trash for their copies", async () => {
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ driveCopyFileId: "copy_1" }, { driveCopyFileId: "copy_2" }]);

    const res = await app.request(`${BASE}/e1`, {
      method: "DELETE",
      headers: authHeaders(MOCK_ADMIN),
    });

    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ deleted: boolean }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual({ deleted: true });
    expect(mockDb.delete).toHaveBeenCalledTimes(3);
    expect(enqueueDriveJob).toHaveBeenCalledTimes(2);
    expect(enqueueDriveJob).toHaveBeenCalledWith(expect.anything(), {
      kind: "trash",
      fileId: "copy_1",
    });
    expect(enqueueDriveJob).toHaveBeenCalledWith(expect.anything(), {
      kind: "trash",
      fileId: "copy_2",
    });
  });

  it("deletes an event with no submissions without enqueueing trash jobs", async () => {
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);

    const res = await app.request(`${BASE}/e1`, {
      method: "DELETE",
      headers: authHeaders(MOCK_ADMIN),
    });

    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ deleted: boolean }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual({ deleted: true });
    expect(enqueueDriveJob).not.toHaveBeenCalled();
    expect(mockDb.delete).toHaveBeenCalledTimes(3);
  });

  it("returns 200 when enqueueDriveJob rejects", async () => {
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ driveCopyFileId: "copy_1" }]);
    enqueueDriveJob.mockRejectedValueOnce(new Error("queue down"));

    const res = await app.request(`${BASE}/e1`, {
      method: "DELETE",
      headers: authHeaders(MOCK_ADMIN),
    });

    expect(res.status).toBe(200);
    expect(enqueueDriveJob).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
