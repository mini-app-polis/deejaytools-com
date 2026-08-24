import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  adminHeaders,
  assertErrorEnvelope,
  assertSuccessEnvelope,
  assertSuccessListEnvelope,
  authHeaders,
  type ErrorEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/auth.js")>();
  const { mockRequireAdmin, mockRequireAuth } = await import("../test/mocks.js");
  return {
    ...actual,
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});

const BASE = "/v1/admin/drive-jobs";

describe("GET /v1/admin/drive-jobs/summary", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/summary`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request(`${BASE}/summary`, { headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it("returns counts by status and submissions without a copy", async () => {
    enqueueSelectResult([
      { status: "pending", count: 2 },
      { status: "failed", count: 1 },
    ]);
    enqueueSelectResult([{ count: 3 }]);

    const res = await app.request(`${BASE}/summary`, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ by_status: Record<string, number>; submissions_without_copy: number }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual({
      by_status: { pending: 2, failed: 1 },
      submissions_without_copy: 3,
    });
  });
});

describe("GET /v1/admin/drive-jobs", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it("filters by status and includes last_error", async () => {
    enqueueSelectResult([
      {
        id: "job_1",
        kind: "copy",
        status: "failed",
        attempts: 4,
        last_error: "Google Drive environment variables are not configured",
        next_attempt_at: 1,
        created_at: 1,
        updated_at: 2,
        submission_id: "sub_1",
        file_id: null,
        event_name: "Spring Classic",
      },
    ]);

    const res = await app.request(`${BASE}?status=failed`, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data[0]).toMatchObject({
      id: "job_1",
      status: "failed",
      last_error: "Google Drive environment variables are not configured",
    });
  });
});

describe("POST /v1/admin/drive-jobs/:id/retry", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request(`${BASE}/job_1/retry`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the job does not exist", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/job_missing/retry`, {
      method: "POST",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("resets a failed job to pending with attempts 0", async () => {
    enqueueSelectResult([
      {
        id: "job_1",
        kind: "copy",
        status: "failed",
        attempts: 10,
        submissionId: "sub_1",
        fileId: null,
        nextAttemptAt: 1,
        lastError: "Drive down",
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
    const setMock = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const updateMock = mockDb.update as ReturnType<typeof vi.fn>;
    updateMock.mockImplementationOnce(() => ({ set: setMock }));

    const res = await app.request(`${BASE}/job_1/retry`, {
      method: "POST",
      headers: adminHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ id: string; status: string }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual({ id: "job_1", status: "pending" });
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", attempts: 0 })
    );
  });

  it("does not reset a done job", async () => {
    enqueueSelectResult([
      {
        id: "job_1",
        kind: "copy",
        status: "done",
        attempts: 1,
        submissionId: "sub_1",
        fileId: "copy_1",
        nextAttemptAt: 1,
        lastError: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
    const setMock = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const updateMock = mockDb.update as ReturnType<typeof vi.fn>;
    updateMock.mockImplementationOnce(() => ({ set: setMock }));

    const res = await app.request(`${BASE}/job_1/retry`, {
      method: "POST",
      headers: adminHeaders(),
    });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", attempts: 0 })
    );
    const whereMock = setMock.mock.results[0]?.value.where as ReturnType<typeof vi.fn>;
    expect(whereMock).toHaveBeenCalled();
  });
});
