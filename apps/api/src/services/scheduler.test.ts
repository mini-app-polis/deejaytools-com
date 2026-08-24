import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tickSessionStatuses, fillRunningSessions, processDriveJobs } = vi.hoisted(() => ({
  tickSessionStatuses: vi.fn(async () => 0),
  fillRunningSessions: vi.fn(async () => 0),
  processDriveJobs: vi.fn(async () => 0),
}));

vi.mock("./cron.js", () => ({
  tickSessionStatuses,
  fillRunningSessions,
}));
vi.mock("./driveJobs.js", () => ({
  processDriveJobs,
}));

vi.mock("@sentry/node", () => ({
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({ setLevel: vi.fn(), setTag: vi.fn(), setContext: vi.fn() })
  ),
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/node";
import { runTick, startScheduler } from "./scheduler.js";

type Db = Parameters<typeof runTick>[0];
const fakeDb = {} as Db;

/** Flush the microtask from startScheduler's immediate `void tick()`. */
async function flushImmediateTick() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("runTick", () => {
  beforeEach(() => {
    tickSessionStatuses.mockClear();
    fillRunningSessions.mockClear();
    processDriveJobs.mockClear();
    tickSessionStatuses.mockResolvedValue(0);
    fillRunningSessions.mockResolvedValue(0);
    processDriveJobs.mockResolvedValue(0);
    vi.mocked(Sentry.captureException).mockClear();
  });

  it("calls tickSessionStatuses, fillRunningSessions, and processDriveJobs", async () => {
    await runTick(fakeDb);
    expect(tickSessionStatuses).toHaveBeenCalledWith(fakeDb);
    expect(fillRunningSessions).toHaveBeenCalledWith(fakeDb);
    expect(processDriveJobs).toHaveBeenCalledWith(fakeDb);
  });

  it("swallows errors so a bad pass does not throw", async () => {
    tickSessionStatuses.mockRejectedValueOnce(new Error("boom"));
    await expect(runTick(fakeDb)).resolves.toBeUndefined();
  });

  it("still drains Drive jobs when session steps fail", async () => {
    tickSessionStatuses.mockRejectedValueOnce(new Error("session boom"));
    await runTick(fakeDb);
    expect(processDriveJobs).toHaveBeenCalledWith(fakeDb);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports Drive drain failures to Sentry without throwing", async () => {
    processDriveJobs.mockRejectedValueOnce(new Error("drive boom"));
    await expect(runTick(fakeDb)).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tickSessionStatuses.mockClear();
    fillRunningSessions.mockClear();
    processDriveJobs.mockClear();
    tickSessionStatuses.mockResolvedValue(0);
    fillRunningSessions.mockResolvedValue(0);
    processDriveJobs.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs one pass immediately and stop() prevents further passes", async () => {
    const handle = startScheduler(fakeDb, 30_000);

    await flushImmediateTick();
    expect(tickSessionStatuses).toHaveBeenCalledTimes(1);
    expect(fillRunningSessions).toHaveBeenCalledTimes(1);

    handle.stop();
    tickSessionStatuses.mockClear();
    fillRunningSessions.mockClear();

    await vi.advanceTimersByTimeAsync(90_000);
    expect(tickSessionStatuses).not.toHaveBeenCalled();
    expect(fillRunningSessions).not.toHaveBeenCalled();
  });

  it("runs again on each interval while running", async () => {
    const handle = startScheduler(fakeDb, 30_000);

    await flushImmediateTick();
    expect(tickSessionStatuses).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(tickSessionStatuses).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(tickSessionStatuses).toHaveBeenCalledTimes(3);

    handle.stop();
  });
});
