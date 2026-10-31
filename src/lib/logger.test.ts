import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import * as Sentry from "@sentry/react";
import { createLogger } from "./logger";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(Sentry.captureException).mockClear();
  vi.mocked(Sentry.captureMessage).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createLogger", () => {
  it("writes a structured info event to console.info and nothing to Sentry", () => {
    createLogger("web").info({ event: "loaded", category: "infra", context: { page: "/" } });

    expect(console.info).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "web",
        level: "INFO",
        category: "infra",
        event: "loaded",
        context: { page: "/" },
        timestamp: expect.any(String),
      })
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("omits context and error when they are not given", () => {
    createLogger("web").warn({ event: "slow", category: "api" });

    const payload = vi.mocked(console.warn).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.level).toBe("WARN");
    expect(payload).not.toHaveProperty("context");
    expect(payload).not.toHaveProperty("error");
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("forwards an error with an Error instance to Sentry.captureException, tagged", () => {
    const err = new Error("boom");
    createLogger("web").error({ event: "sync_failed", category: "api", context: { status: 500 }, error: err });

    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({ level: "ERROR", error: err }));
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      tags: { service: "web", category: "api", event: "sync_failed" },
      extra: { status: 500 },
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("forwards an error without an Error instance to Sentry.captureMessage, keeping the value", () => {
    createLogger("web").error({ event: "bad_state", category: "data", error: "not an Error" });

    expect(Sentry.captureMessage).toHaveBeenCalledWith("bad_state", {
      level: "error",
      tags: { service: "web", category: "data", event: "bad_state" },
      extra: { error: "not an Error" },
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("sends an error with neither context nor error value as a bare message", () => {
    createLogger("web").error({ event: "gave_up", category: "pipeline" });

    expect(Sentry.captureMessage).toHaveBeenCalledWith("gave_up", expect.objectContaining({ extra: {} }));
  });
});
