import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";
import * as drive from "./drive.js";
import {
  LEASE_TIMEOUT_MS,
  MAX_ATTEMPTS,
  backoffMs,
  processDriveJobs,
} from "./driveJobs.js";

vi.mock("@sentry/node", () => ({
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({ setLevel: vi.fn(), setTag: vi.fn(), setContext: vi.fn() })
  ),
  captureException: vi.fn(),
}));

vi.mock("./drive.js", () => ({
  copySongToEventFolder: vi.fn().mockResolvedValue({
    fileId: "copy_file_1",
    folderId: "copy_folder_1",
  }),
  softDeleteOnDrive: vi.fn().mockResolvedValue(undefined),
}));

type Db = Parameters<typeof processDriveJobs>[0];

type DriveJob = {
  id: string;
  kind: "copy" | "trash";
  submissionId: string | null;
  fileId: string | null;
  status: string;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

function makeJob(over: Partial<DriveJob> = {}): DriveJob {
  const now = Date.now();
  return {
    id: "job_1",
    kind: "copy",
    submissionId: "sub_1",
    fileId: null,
    status: "running",
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function makeCopySubmissionRow(
  over: Partial<{
    submissionId: string;
    alreadyCopied: string | null;
    songId: string;
    driveFileId: string | null;
    originalFilename: string | null;
    processedFilename: string | null;
    seasonYear: string | null;
    division: string | null;
    eventName: string;
  }> = {}
) {
  return {
    submissionId: "sub_1",
    alreadyCopied: null,
    songId: "song_1",
    driveFileId: "source_file_1",
    originalFilename: "my track.mp3",
    processedFilename: "2026_Classic.mp3",
    seasonYear: "2026",
    division: "Classic",
    eventName: "Spring Classic",
    ...over,
  };
}

function isReclaimUpdate(values: Record<string, unknown>): boolean {
  return (
    values.status === "pending" &&
    !("attempts" in values) &&
    !("nextAttemptAt" in values) &&
    !("lastError" in values)
  );
}

function makeProcessDb(options: {
  claimedJobs?: DriveJob[];
  claimThrows?: boolean;
  reclaimThrows?: boolean;
  reclaimReturns?: { id: string }[];
  submissionRows?: ReturnType<typeof makeCopySubmissionRow>[];
  jobUpdates?: Array<{ status: string; attempts?: number; lastError?: string | null }>;
}) {
  const submissionUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const jobUpdates = options.jobUpdates ?? [];
  let jobUpdateIndex = 0;
  let reclaimSetValues: Record<string, unknown> | null = null;

  const selectChain = {
    from: vi.fn(() => selectChain),
    innerJoin: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    limit: vi.fn(() => Promise.resolve(options.submissionRows ?? [])),
  };

  const executeMock = options.claimThrows
    ? vi.fn().mockRejectedValue(new Error("claim failed"))
    : vi.fn().mockResolvedValue(options.claimedJobs ?? []);

  const db = {
    execute: executeMock,
    select: vi.fn(() => selectChain),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        if ("driveCopyFileId" in values) {
          return { where: submissionUpdateWhere };
        }

        if (isReclaimUpdate(values)) {
          reclaimSetValues = values;
          return {
            where: vi.fn(() => {
              if (options.reclaimThrows) {
                return {
                  returning: vi.fn(() => Promise.reject(new Error("reclaim failed"))),
                };
              }
              return {
                returning: vi.fn(() => Promise.resolve(options.reclaimReturns ?? [])),
              };
            }),
          };
        }

        jobUpdates[jobUpdateIndex] = {
          status: String(values.status ?? "done"),
          attempts: values.attempts as number | undefined,
          lastError: (values.lastError as string | null | undefined) ?? null,
        };
        jobUpdateIndex++;
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    })),
  };

  return {
    db: db as unknown as Db,
    submissionUpdateWhere,
    jobUpdates,
    executeMock,
    getReclaimSetValues: () => reclaimSetValues,
  };
}

describe("backoffMs", () => {
  it("grows 1m → 2m → 4m and caps at 30m", () => {
    expect(backoffMs(0)).toBe(60_000);
    expect(backoffMs(1)).toBe(120_000);
    expect(backoffMs(2)).toBe(240_000);
    expect(backoffMs(10)).toBe(30 * 60_000);
  });

  it("caps at 30m for high attempt counts", () => {
    expect(backoffMs(4)).toBe(960_000);
    expect(backoffMs(9)).toBe(1_800_000);
  });
});

describe("processDriveJobs", () => {
  beforeEach(() => {
    vi.mocked(drive.copySongToEventFolder).mockClear();
    vi.mocked(drive.softDeleteOnDrive).mockClear();
    vi.mocked(Sentry.captureException).mockClear();
    vi.mocked(drive.copySongToEventFolder).mockResolvedValue({
      fileId: "copy_file_1",
      folderId: "copy_folder_1",
    });
  });

  it("returns 0 when claiming jobs fails and reports to Sentry", async () => {
    const { db } = makeProcessDb({ claimThrows: true });
    await expect(processDriveJobs(db)).resolves.toBe(0);
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("does not call Drive when the submission already has a copy (idempotent retry)", async () => {
    const job = makeJob();
    const { db, submissionUpdateWhere } = makeProcessDb({
      claimedJobs: [job],
      submissionRows: [makeCopySubmissionRow({ alreadyCopied: "existing_copy" })],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(submissionUpdateWhere).not.toHaveBeenCalled();
  });

  it("does not call Drive and marks done when the song has no source file", async () => {
    const job = makeJob();
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [job],
      submissionRows: [makeCopySubmissionRow({ driveFileId: null })],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("marks done when the submission row is gone", async () => {
    const job = makeJob();
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [job],
      submissionRows: [],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("writes driveCopyFileId back to the submission on a successful copy", async () => {
    const job = makeJob();
    const { db, submissionUpdateWhere, jobUpdates } = makeProcessDb({
      claimedJobs: [job],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).toHaveBeenCalledWith("source_file_1", {
      filename: "my track.mp3",
      seasonYear: "2026",
      eventName: "Spring Classic",
      division: "Classic",
    });
    expect(submissionUpdateWhere).toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("reschedules a failing copy without reporting to Sentry", async () => {
    const job = makeJob({ attempts: 1 });
    vi.mocked(drive.copySongToEventFolder).mockRejectedValueOnce(new Error("Drive down"));
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [job],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(0);
    expect(jobUpdates[0]).toMatchObject({
      status: "pending",
      attempts: 2,
      lastError: "Drive down",
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("marks a copy job failed after MAX_ATTEMPTS and reports once", async () => {
    const job = makeJob({ attempts: MAX_ATTEMPTS - 1 });
    vi.mocked(drive.copySongToEventFolder).mockRejectedValueOnce(new Error("Drive down"));
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [job],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(0);
    expect(jobUpdates[0]).toMatchObject({
      status: "failed",
      attempts: MAX_ATTEMPTS,
      lastError: "Drive down",
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("calls softDeleteOnDrive for a trash job", async () => {
    const job = makeJob({
      kind: "trash",
      submissionId: null,
      fileId: "copy_to_trash",
    });
    const { db, jobUpdates } = makeProcessDb({ claimedJobs: [job] });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.softDeleteOnDrive).toHaveBeenCalledWith("copy_to_trash");
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("reclaims stuck running jobs back to pending without incrementing attempts", async () => {
    const job = makeJob();
    const { db, executeMock, getReclaimSetValues } = makeProcessDb({
      reclaimReturns: [{ id: "stuck_job" }],
      claimedJobs: [job],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(getReclaimSetValues()).toMatchObject({ status: "pending" });
    expect(executeMock).toHaveBeenCalled();
  });

  it("leaves fresh running leases alone when nothing is past the timeout", async () => {
    const job = makeJob();
    const { db, executeMock } = makeProcessDb({
      reclaimReturns: [],
      claimedJobs: [job],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(executeMock).toHaveBeenCalled();
  });

  it("still claims jobs when reclaim fails", async () => {
    const job = makeJob();
    const { db, executeMock } = makeProcessDb({
      reclaimThrows: true,
      claimedJobs: [job],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(executeMock).toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe("LEASE_TIMEOUT_MS", () => {
  it("is long enough to outlast a slow Drive call", () => {
    expect(LEASE_TIMEOUT_MS).toBeGreaterThanOrEqual(10 * 60_000);
  });
});
