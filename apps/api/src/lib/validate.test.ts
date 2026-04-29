import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zValidator } from "./validate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function json(res: Response) {
  return res.json() as Promise<unknown>;
}

// ---------------------------------------------------------------------------
// JSON body validation
// ---------------------------------------------------------------------------

describe("zValidator — json target", () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  function buildApp() {
    const app = new Hono();
    app.post("/test", zValidator("json", schema), (c) => {
      const data = c.req.valid("json");
      return c.json({ ok: true, data });
    });
    return app;
  }

  it("passes valid payload through to the handler (200)", async () => {
    const app = buildApp();
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice", age: 30 }),
    });

    expect(res.status).toBe(200);
    const body = (await json(res)) as { ok: boolean; data: unknown };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ name: "Alice", age: 30 });
  });

  it("returns 400 with error envelope when a required field is missing", async () => {
    const app = buildApp();
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }), // missing `age`
    });

    expect(res.status).toBe(400);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
      }),
    });
  });

  it("returns 400 when a field has the wrong type", async () => {
    const app = buildApp();
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice", age: "thirty" }), // age must be number
    });

    expect(res.status).toBe(400);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
      }),
    });
  });

  it("returns 400 when name is an empty string (min(1) violated)", async () => {
    const app = buildApp();
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", age: 5 }),
    });

    expect(res.status).toBe(400);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
      }),
    });
  });

  it("does not call the handler when validation fails", async () => {
    let handlerCalled = false;
    const app = new Hono();
    app.post(
      "/test",
      zValidator("json", schema),
      (c) => {
        handlerCalled = true;
        return c.json({ ok: true });
      },
    );

    await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // nothing valid
    });

    expect(handlerCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Query param validation
// ---------------------------------------------------------------------------

describe("zValidator — query target", () => {
  const schema = z.object({
    page: z.coerce.number().int().min(1),
  });

  function buildApp() {
    const app = new Hono();
    app.get("/items", zValidator("query", schema), (c) => {
      const { page } = c.req.valid("query");
      return c.json({ page });
    });
    return app;
  }

  it("passes when query param is valid", async () => {
    const app = buildApp();
    const res = await app.request("/items?page=2");

    expect(res.status).toBe(200);
    const body = (await json(res)) as { page: number };
    expect(body.page).toBe(2);
  });

  it("returns 400 with error envelope when query param is missing", async () => {
    const app = buildApp();
    const res = await app.request("/items"); // no ?page=

    expect(res.status).toBe(400);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
      }),
    });
  });

  it("returns 400 when page is zero (min(1) violated)", async () => {
    const app = buildApp();
    const res = await app.request("/items?page=0");

    expect(res.status).toBe(400);
    const body = (await json(res)) as Record<string, unknown>;
    expect(body).toMatchObject({
      error: expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// Error envelope shape contract
// ---------------------------------------------------------------------------

describe("zValidator — error envelope contract", () => {
  it("error.code is a non-empty string", async () => {
    const app = new Hono();
    app.post(
      "/check",
      zValidator("json", z.object({ x: z.number() })),
      (c) => c.json({ ok: true }),
    );

    const res = await app.request("/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: "not-a-number" }),
    });

    const body = (await json(res)) as { error: { code: string; message: string } };
    expect(body.error.code.length).toBeGreaterThan(0);
    expect(typeof body.error.message).toBe("string");
  });

  it("response has no 'success' or 'issues' keys (matches canonical envelope, not raw Zod error)", async () => {
    const app = new Hono();
    app.post(
      "/check",
      zValidator("json", z.object({ x: z.number() })),
      (c) => c.json({ ok: true }),
    );

    const res = await app.request("/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const body = (await json(res)) as Record<string, unknown>;
    // The canonical envelope must NOT expose raw Zod internals.
    expect(body).not.toHaveProperty("success");
    expect(body).not.toHaveProperty("issues");
    expect(body).not.toHaveProperty("error.issues");
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("error.code");
    expect(body).toHaveProperty("error.message");
  });
});
