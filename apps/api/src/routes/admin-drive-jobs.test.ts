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

const { enqueueDriveJob } = vi.hoisted(() => ({
  enqueueDriveJob: vi.fn().mockResolvedValue(undefined),
}));

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
vi.mock("../services/driveJobs.js", () => ({
  enqueueDriveJob,
}));

const BASE = "/v1/admin/drive-jobs";

const failedJobRow = {
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
};

function mockRetryUpdate(returning: unknown[]) {
  const returningMock = vi.fn().mockResolvedValue(returning);
  const whereMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({ where: whereMock }));
  const updateMock = mockDb.update as ReturnType<typeof vi.fn>;
  updateMock.mockImplementationOnce(() => ({ set: setMock }));
  return { setMock, whereMock, returningMock };
}

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

describe("POST /v1/admin/drive-jobs/backfill-renames", () => {
  beforeEach(() => {
    resetSelectQueue();
    enqueueDriveJob.mockClear();
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request(`${BASE}/backfill-renames`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it("enqueues one rename per submission with a copy and returns the count", async () => {
    enqueueSelectResult([{ id: "sub_1" }, { id: "sub_2" }]);

    const res = await app.request(`${BASE}/backfill-renames`, {
      method: "POST",
      headers: adminHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ enqueued: number }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual({ enqueued: 2 });
    expect(enqueueDriveJob).toHaveBeenCalledTimes(2);
    expect(enqueueDriveJob).toHaveBeenNthCalledWith(1, expect.anything(), {
      kind: "rename",
      submissionId: "sub_1",
    });
    expect(enqueueDriveJob).toHaveBeenNthCalledWith(2, expect.anything(), {
      kind: "rename",
      submissionId: "sub_2",
    });
  });

  it("enqueues nothing when no submission has a copy", async () => {
    enqueueSelectResult([]);

    const res = await app.request(`${BASE}/backfill-renames`, {
      method: "POST",
      headers: adminHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ enqueued: number }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual({ enqueued: 0 });
    expect(enqueueDriveJob).not.toHaveBeenCalled();
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

  it("returns the updated row from returning(), not a hardcoded literal", async () => {
    enqueueSelectResult([failedJobRow]);
    mockRetryUpdate([{ id: "job_1", status: "pending" }]);

    const res = await app.request(`${BASE}/job_1/retry`, {
      method: "POST",
      headers: adminHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ id: string; status: string }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual({ id: "job_1", status: "pending" });
  });

  it("returns 409 when retrying a done job", async () => {
    enqueueSelectResult([{ ...failedJobRow, status: "done", fileId: "copy_1" }]);
    const res = await app.request(`${BASE}/job_1/retry`, {
      method: "POST",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toMatch(/done, not failed/i);
  });

  it("returns 409 when retrying a pending job", async () => {
    enqueueSelectResult([{ ...failedJobRow, status: "pending", attempts: 0 }]);
    const res = await app.request(`${BASE}/job_1/retry`, {
      method: "POST",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toMatch(/pending, not failed/i);
  });

  it("returns 409 when the job changes state before the update", async () => {
    enqueueSelectResult([failedJobRow]);
    mockRetryUpdate([]);

    const res = await app.request(`${BASE}/job_1/retry`, {
      method: "POST",
      headers: adminHeaders(),
    });

    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toMatch(/changed state before it could be retried/i);
  });
});
