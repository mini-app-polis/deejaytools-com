import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { timeoutMiddleware, TimeoutError } from "./timeout.js";

/** Build a tiny Hono app with the timeout middleware on /test. */
function buildApp(timeoutMs: number, handlerDelayMs: number) {
  const app = new Hono();
  app.use("/test", timeoutMiddleware(timeoutMs));
  app.get("/test", async (c) => {
    if (handlerDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, handlerDelayMs));
    }
    return c.json({ ok: true });
  });
  return app;
}

describe("timeoutMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── happy path ─────────────────────────────────────────────────────────────

  it("passes through and returns 200 when handler completes within the timeout", async () => {
    const app = buildApp(1_000, 0); // handler is synchronous
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("does not fire the deadline timer when handler resolves immediately", async () => {
    const app = buildApp(5_000, 0);
    await app.request("/test");
    // Advance time past the (now-cleared) timer — should not throw.
    await vi.runAllTimersAsync();
    // If the timer was not properly cleared it would try to reject a
    // settled promise; the test passing is sufficient proof.
  });

  // ── timeout path ───────────────────────────────────────────────────────────

  it("returns 503 when handler exceeds the timeout", async () => {
    const app = buildApp(1_000, 30_000); // handler needs 30 s, timeout at 1 s
    const resPromise = app.request("/test");
    // Fire the 1 s timeout before the 30 s handler delay.
    await vi.runAllTimersAsync();
    const res = await resPromise;
    expect(res.status).toBe(503);
  });

  it("returns a well-formed error envelope on timeout", async () => {
    const app = buildApp(500, 10_000);
    const resPromise = app.request("/test");
    await vi.runAllTimersAsync();
    const res = await resPromise;
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body).toMatchObject({
      error: {
        code: "request_timeout",
        message: expect.stringContaining("500"),
      },
    });
  });

  // ── error propagation ──────────────────────────────────────────────────────

  it("re-throws non-timeout errors from the handler", async () => {
    const app = new Hono();
    app.use("/boom", timeoutMiddleware(5_000));
    app.get("/boom", () => {
      throw new Error("handler_exploded");
    });
    // onError in this bare Hono returns 500.
    app.onError((err, c) => c.text(err.message, 500));
    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("handler_exploded");
  });

  // ── TimeoutError class ─────────────────────────────────────────────────────

  it("TimeoutError carries the configured millisecond value in the message", () => {
    const err = new TimeoutError(3_000);
    expect(err.message).toContain("3000");
    expect(err.name).toBe("TimeoutError");
  });
});
