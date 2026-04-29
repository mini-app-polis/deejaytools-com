import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { rateLimitMiddleware } from "./rate-limit.js";

/** Build a tiny test app with a configurable rate limit on /ping. */
function buildApp(limit: number, windowMs: number, keyFn?: (c: Parameters<typeof rateLimitMiddleware>[2] extends ((c: infer C) => string) | undefined ? C : never) => string) {
  const app = new Hono();
  app.use("/ping", rateLimitMiddleware(limit, windowMs, keyFn as Parameters<typeof rateLimitMiddleware>[2]));
  app.get("/ping", (c) => c.json({ ok: true }));
  return app;
}

/** Hit /ping `n` times sequentially and return all responses. */
async function hitN(app: Hono, n: number, headers: Record<string, string> = {}) {
  const results: Response[] = [];
  for (let i = 0; i < n; i++) {
    results.push(await app.request("/ping", { headers }));
  }
  return results;
}

describe("rateLimitMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── basic allow / deny ─────────────────────────────────────────────────────

  it("allows requests up to the limit", async () => {
    const app = buildApp(3, 60_000);
    const responses = await hitN(app, 3);
    expect(responses.every((r) => r.status === 200)).toBe(true);
  });

  it("returns 429 on the request that exceeds the limit", async () => {
    const app = buildApp(3, 60_000);
    const responses = await hitN(app, 4);
    expect(responses[3]!.status).toBe(429);
  });

  it("continues blocking subsequent requests after the limit is hit", async () => {
    const app = buildApp(2, 60_000);
    const responses = await hitN(app, 5);
    expect(responses.slice(2).every((r) => r.status === 429)).toBe(true);
  });

  // ── 429 response shape ─────────────────────────────────────────────────────

  it("returns a well-formed error envelope on 429", async () => {
    const app = buildApp(1, 60_000);
    await hitN(app, 1); // exhaust limit
    const res = await app.request("/ping");
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body).toMatchObject({
      error: {
        code: "too_many_requests",
        message: expect.any(String),
      },
    });
  });

  it("sets a Retry-After header on 429", async () => {
    const app = buildApp(1, 30_000);
    await app.request("/ping"); // exhaust
    vi.advanceTimersByTime(5_000); // 5 s into the 30 s window
    const res = await app.request("/ping");
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("Retry-After"));
    // 25 seconds remain (30 - 5), ceil'd.
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(30);
  });

  // ── window reset ───────────────────────────────────────────────────────────

  it("resets the counter after the window elapses", async () => {
    const app = buildApp(2, 1_000);
    await hitN(app, 2); // exhaust the window
    expect((await app.request("/ping")).status).toBe(429);

    vi.advanceTimersByTime(1_001); // window expires

    const after = await app.request("/ping");
    expect(after.status).toBe(200);
  });

  // ── per-key isolation ──────────────────────────────────────────────────────

  it("tracks independent counters for different keys", async () => {
    const app = buildApp(2, 60_000);
    const ipA = { "x-forwarded-for": "1.2.3.4" };
    const ipB = { "x-forwarded-for": "9.9.9.9" };

    // Exhaust IP A.
    await hitN(app, 2, ipA);
    expect((await app.request("/ping", { headers: ipA })).status).toBe(429);

    // IP B is unaffected.
    expect((await app.request("/ping", { headers: ipB })).status).toBe(200);
  });

  // ── key extraction ─────────────────────────────────────────────────────────

  it("prefers cf-connecting-ip over x-forwarded-for", async () => {
    const app = buildApp(1, 60_000);
    const headers = {
      "cf-connecting-ip": "10.0.0.1",
      "x-forwarded-for": "10.0.0.2",
    };
    await app.request("/ping", { headers }); // exhaust 10.0.0.1

    // Same CF IP → blocked.
    expect((await app.request("/ping", { headers })).status).toBe(429);

    // Different CF IP → allowed.
    const diffCf = { "cf-connecting-ip": "10.0.0.99" };
    expect((await app.request("/ping", { headers: diffCf })).status).toBe(200);
  });

  it("uses x-forwarded-for when cf-connecting-ip is absent", async () => {
    const app = buildApp(1, 60_000);
    const headers = { "x-forwarded-for": "5.5.5.5" };
    await app.request("/ping", { headers }); // exhaust
    expect((await app.request("/ping", { headers })).status).toBe(429);
  });

  it("falls back to 'unknown' bucket when no IP header is present", async () => {
    const app = buildApp(2, 60_000);
    await hitN(app, 2); // both go into "unknown" bucket
    expect((await app.request("/ping")).status).toBe(429);
  });

  it("respects a custom keyFn", async () => {
    // Key by a custom header — useful for user-id-based rate limiting.
    const app = new Hono();
    app.use(
      "/ping",
      rateLimitMiddleware(1, 60_000, (c) => c.req.header("x-user-id") ?? "anon")
    );
    app.get("/ping", (c) => c.json({ ok: true }));

    await app.request("/ping", { headers: { "x-user-id": "u1" } }); // exhaust u1
    // u1 is blocked, u2 is allowed.
    expect(
      (await app.request("/ping", { headers: { "x-user-id": "u1" } })).status
    ).toBe(429);
    expect(
      (await app.request("/ping", { headers: { "x-user-id": "u2" } })).status
    ).toBe(200);
  });
});
