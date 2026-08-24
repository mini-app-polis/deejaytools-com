import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("common-typescript-utils", async (importOriginal) => {
  const mod = await importOriginal<typeof import("common-typescript-utils")>();
  return {
    ...mod,
    createLogger: vi.fn(() => loggerMocks),
  };
});

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
  renameDriveFile: vi.fn().mockResolvedValue(true),
  softDeleteOnDrive: vi.fn().mockResolvedValue(undefined),
}));

type Db = Parameters<typeof processDriveJobs>[0];

/**
 * A drive_jobs row as the DB actually returns it from a raw RETURNING *:
 * snake_case columns, bigints as strings. claimJobs is responsible for
 * mapping this to a DriveJob — a mock that returns camelCase would hide a
 * regression of the outage where every underscored field read as undefined.
 */
function makeRawJob(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "job_1",
    kind: "copy",
    submission_id: "sub_1",
    file_id: null,
    status: "running",
    attempts: 0,
    next_attempt_at: "1756000000000",
    last_error: null,
    created_at: "1756000000000",
    updated_at: "1756000000000",
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
    division: string | null;
    submissionDivision: string | null;
    submissionRound: string | null;
    eventName: string;
    eventSeasonYear: string | null;
    eventStartDate: string;
  }> = {}
) {
  return {
    submissionId: "sub_1",
    alreadyCopied: null,
    songId: "song_1",
    driveFileId: "source_file_1",
    originalFilename: "my track.mp3",
    processedFilename: "2026_Classic.mp3",
    division: "Classic",
    submissionDivision: null,
    submissionRound: null,
    eventName: "Spring Classic",
    eventSeasonYear: "2027",
    eventStartDate: "2026-11-25",
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
  claimedJobs?: ReturnType<typeof makeRawJob>[];
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
    vi.mocked(drive.renameDriveFile).mockClear();
    vi.mocked(drive.softDeleteOnDrive).mockClear();
    vi.mocked(Sentry.captureException).mockClear();
    loggerMocks.info.mockClear();
    loggerMocks.warn.mockClear();
    loggerMocks.error.mockClear();
    vi.mocked(drive.copySongToEventFolder).mockResolvedValue({
      fileId: "copy_file_1",
      folderId: "copy_folder_1",
    });
    vi.mocked(drive.renameDriveFile).mockResolvedValue(true);
  });

  it("returns 0 when claiming jobs fails and reports to Sentry", async () => {
    const { db } = makeProcessDb({ claimThrows: true });
    await expect(processDriveJobs(db)).resolves.toBe(0);
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("does not call Drive when the submission already has a copy (idempotent retry)", async () => {
    const { db, submissionUpdateWhere } = makeProcessDb({
      claimedJobs: [makeRawJob()],
      submissionRows: [makeCopySubmissionRow({ alreadyCopied: "existing_copy" })],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(submissionUpdateWhere).not.toHaveBeenCalled();
  });

  it("does not call Drive and marks done when the song has no source file", async () => {
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [makeRawJob()],
      submissionRows: [makeCopySubmissionRow({ driveFileId: null })],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("marks done when the submission row is gone", async () => {
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [makeRawJob()],
      submissionRows: [],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("writes driveCopyFileId back to the submission on a successful copy", async () => {
    const { db, submissionUpdateWhere, jobUpdates } = makeProcessDb({
      claimedJobs: [makeRawJob()],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).toHaveBeenCalledWith("source_file_1", {
      filename: "2026_Classic.mp3",
      seasonYear: "2027",
      eventName: "Spring Classic",
      division: "Classic",
      subfolder: undefined,
    });
    expect(submissionUpdateWhere).toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("copies finals_only submissions into the Finals subfolder", async () => {
    const { db } = makeProcessDb({
      claimedJobs: [makeRawJob()],
      submissionRows: [makeCopySubmissionRow({ submissionRound: "finals_only" })],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).toHaveBeenCalledWith(
      "source_file_1",
      expect.objectContaining({ subfolder: "Finals" })
    );
  });

  it("does not pass a subfolder for prelims_and_finals or prelims_only", async () => {
    for (const submissionRound of ["prelims_and_finals", "prelims_only"] as const) {
      vi.mocked(drive.copySongToEventFolder).mockClear();
      const { db } = makeProcessDb({
        claimedJobs: [makeRawJob({ id: `job_${submissionRound}` })],
        submissionRows: [makeCopySubmissionRow({ submissionRound })],
      });
      await expect(processDriveJobs(db)).resolves.toBe(1);
      expect(drive.copySongToEventFolder).toHaveBeenCalledWith(
        "source_file_1",
        expect.objectContaining({ subfolder: undefined })
      );
    }
  });

  it("uses the submission division for the folder when it differs from the song", async () => {
    const { db } = makeProcessDb({
      claimedJobs: [makeRawJob()],
      submissionRows: [
        makeCopySubmissionRow({
          division: "Classic",
          submissionDivision: "Showcase",
        }),
      ],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).toHaveBeenCalledWith(
      "source_file_1",
      expect.objectContaining({ division: "Showcase" })
    );
  });

  it("uses the event season year in the folder path, not the song's", async () => {
    const { db } = makeProcessDb({
      claimedJobs: [makeRawJob()],
      submissionRows: [
        makeCopySubmissionRow({
          eventSeasonYear: "2028",
          eventStartDate: "2027-09-01",
        }),
      ],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).toHaveBeenCalledWith(
      "source_file_1",
      expect.objectContaining({ seasonYear: "2028" })
    );
  });

  it("derives the event season year from start_date when the column is null", async () => {
    const { db } = makeProcessDb({
      claimedJobs: [makeRawJob()],
      submissionRows: [
        makeCopySubmissionRow({
          eventSeasonYear: null,
          eventStartDate: "2026-10-15",
        }),
      ],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).toHaveBeenCalledWith(
      "source_file_1",
      expect.objectContaining({ seasonYear: "2027" })
    );
  });

  it("reschedules a failing copy without reporting to Sentry", async () => {
    vi.mocked(drive.copySongToEventFolder).mockRejectedValueOnce(new Error("Drive down"));
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [makeRawJob({ attempts: "1" })],
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
    vi.mocked(drive.copySongToEventFolder).mockRejectedValueOnce(new Error("Drive down"));
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [makeRawJob({ attempts: String(MAX_ATTEMPTS - 1) })],
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
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [
        makeRawJob({
          kind: "trash",
          submission_id: null,
          file_id: "copy_to_trash",
        }),
      ],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.softDeleteOnDrive).toHaveBeenCalledWith("copy_to_trash");
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("calls renameDriveFile with the copy id and resolved name for a rename job", async () => {
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [makeRawJob({ kind: "rename" })],
      submissionRows: [makeCopySubmissionRow({ alreadyCopied: "copy_file_1" })],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.renameDriveFile).toHaveBeenCalledWith("copy_file_1", "2026_Classic.mp3");
    expect(drive.copySongToEventFolder).not.toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("makes no Drive call and marks done when a rename job has no copy yet", async () => {
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [makeRawJob({ kind: "rename" })],
      submissionRows: [makeCopySubmissionRow({ alreadyCopied: null })],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.renameDriveFile).not.toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("marks a rename job done when the submission row is gone", async () => {
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [makeRawJob({ kind: "rename" })],
      submissionRows: [],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.renameDriveFile).not.toHaveBeenCalled();
    expect(jobUpdates[0]?.status).toBe("done");
  });

  it("reschedules a rename job with no submission_id and includes row keys in the error", async () => {
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [makeRawJob({ kind: "rename", submission_id: null })],
    });

    await expect(processDriveJobs(db)).resolves.toBe(0);
    expect(drive.renameDriveFile).not.toHaveBeenCalled();
    expect(jobUpdates[0]?.lastError).toMatch(/rename job job_1 has no submission_id/);
    expect(jobUpdates[0]?.lastError).toMatch(/row keys:/);
  });

  it("reclaims stuck running jobs back to pending without incrementing attempts", async () => {
    const { db, executeMock, getReclaimSetValues } = makeProcessDb({
      reclaimReturns: [{ id: "stuck_job" }],
      claimedJobs: [makeRawJob()],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(getReclaimSetValues()).toMatchObject({ status: "pending" });
    expect(executeMock).toHaveBeenCalled();
  });

  it("leaves fresh running leases alone when nothing is past the timeout", async () => {
    const { db, executeMock } = makeProcessDb({
      reclaimReturns: [],
      claimedJobs: [makeRawJob()],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(executeMock).toHaveBeenCalled();
  });

  it("still claims jobs when reclaim fails", async () => {
    const { db, executeMock } = makeProcessDb({
      reclaimThrows: true,
      claimedJobs: [makeRawJob()],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(executeMock).toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("maps snake_case submission_id from a raw claim and reaches copySongToEventFolder", async () => {
    const { db } = makeProcessDb({
      claimedJobs: [makeRawJob({ submission_id: "sub_1" })],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.copySongToEventFolder).toHaveBeenCalled();
  });

  it("maps snake_case file_id from a raw claim for trash jobs", async () => {
    const { db } = makeProcessDb({
      claimedJobs: [
        makeRawJob({
          kind: "trash",
          submission_id: null,
          file_id: "drive_copy_99",
        }),
      ],
    });

    await expect(processDriveJobs(db)).resolves.toBe(1);
    expect(drive.softDeleteOnDrive).toHaveBeenCalledWith("drive_copy_99");
  });

  it("maps string bigint attempts to numbers when rescheduling", async () => {
    vi.mocked(drive.copySongToEventFolder).mockRejectedValueOnce(new Error("Drive down"));
    const { db, jobUpdates } = makeProcessDb({
      claimedJobs: [makeRawJob({ attempts: "0", next_attempt_at: "1756000000000" })],
      submissionRows: [makeCopySubmissionRow()],
    });

    await expect(processDriveJobs(db)).resolves.toBe(0);
    expect(typeof jobUpdates[0]?.attempts).toBe("number");
    expect(jobUpdates[0]?.attempts).toBe(1);
    expect(jobUpdates[0]?.attempts).not.toBe("01");
  });

  it("includes error_message in context on retry so warn-level logs are diagnosable", async () => {
    vi.mocked(drive.copySongToEventFolder).mockRejectedValueOnce(new Error("Drive down"));
    const { db } = makeProcessDb({
      claimedJobs: [makeRawJob({ attempts: "1" })],
      submissionRows: [makeCopySubmissionRow()],
    });

    await processDriveJobs(db);

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "drive_job_retrying",
        context: expect.objectContaining({ error_message: "Drive down", attempts: 2 }),
      })
    );
  });

  it("logs the first failure at error level and later retries at warn", async () => {
    vi.mocked(drive.copySongToEventFolder).mockRejectedValue(new Error("Drive down"));

    const first = makeProcessDb({
      claimedJobs: [makeRawJob({ attempts: "0" })],
      submissionRows: [makeCopySubmissionRow()],
    });
    await processDriveJobs(first.db);
    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "drive_job_retrying", context: expect.objectContaining({ attempts: 1 }) })
    );
    expect(loggerMocks.warn).not.toHaveBeenCalled();

    loggerMocks.error.mockClear();
    loggerMocks.warn.mockClear();

    const second = makeProcessDb({
      claimedJobs: [makeRawJob({ attempts: "1" })],
      submissionRows: [makeCopySubmissionRow()],
    });
    await processDriveJobs(second.db);
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "drive_job_retrying", context: expect.objectContaining({ attempts: 2 }) })
    );
    expect(loggerMocks.error).not.toHaveBeenCalled();
  });

  it("logs drive_jobs_processed when jobs were claimed", async () => {
    const { db } = makeProcessDb({
      claimedJobs: [makeRawJob()],
      submissionRows: [makeCopySubmissionRow()],
    });

    await processDriveJobs(db);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "drive_jobs_processed",
        context: { claimed: 1, succeeded: 1, failed: 0 },
      })
    );
  });

  it("does not log drive_jobs_processed when nothing was claimed", async () => {
    const { db } = makeProcessDb({ claimedJobs: [] });
    await processDriveJobs(db);
    expect(loggerMocks.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "drive_jobs_processed" })
    );
  });
});

describe("LEASE_TIMEOUT_MS", () => {
  it("is long enough to outlast a slow Drive call", () => {
    expect(LEASE_TIMEOUT_MS).toBeGreaterThanOrEqual(10 * 60_000);
  });
});
