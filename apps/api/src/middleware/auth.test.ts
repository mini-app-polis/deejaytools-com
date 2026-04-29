import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ctu from "common-typescript-utils";
import { Hono } from "hono";

// Mock the db module before importing the middleware so user lookups are
// deterministic.
vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});

// Mock verifyClerkToken so we can simulate valid/invalid tokens without a real
// Clerk JWKS endpoint.
vi.mock("common-typescript-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("common-typescript-utils")>();
  return {
    ...actual,
    verifyClerkToken: vi.fn(),
  };
});

import { bearerToken, jwksUrl, requireAuth, requireAdmin } from "./auth.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

const verifyClerkToken = vi.mocked(ctu.verifyClerkToken);

describe("bearerToken", () => {
  it("returns the token string when the Authorization header is well-formed", () => {
    const c = {
      req: { header: (_: string) => "Bearer xyz123" },
    } as unknown as Parameters<typeof bearerToken>[0];
    expect(bearerToken(c)).toBe("xyz123");
  });

  it("returns null when no Authorization header is present", () => {
    const c = {
      req: { header: (_: string) => undefined },
    } as unknown as Parameters<typeof bearerToken>[0];
    expect(bearerToken(c)).toBeNull();
  });

  it("returns null when the header doesn't start with 'Bearer '", () => {
    const c = {
      req: { header: (_: string) => "Basic abc" },
    } as unknown as Parameters<typeof bearerToken>[0];
    expect(bearerToken(c)).toBeNull();
  });
});

describe("jwksUrl", () => {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env.CLERK_JWKS_URL;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CLERK_JWKS_URL;
    else process.env.CLERK_JWKS_URL = original;
  });

  it("returns the env var when set", () => {
    process.env.CLERK_JWKS_URL = "https://clerk.example/.well-known/jwks.json";
    expect(jwksUrl()).toBe("https://clerk.example/.well-known/jwks.json");
  });

  it("throws when the env var is missing", () => {
    delete process.env.CLERK_JWKS_URL;
    expect(() => jwksUrl()).toThrow(/CLERK_JWKS_URL/);
  });
});

// ---------------------------------------------------------------------------
// requireAuth — exercise via a tiny throwaway Hono app so we go through the
// real middleware logic without mocking it out.
// ---------------------------------------------------------------------------

function makeAuthApp() {
  const app = new Hono();
  app.get("/whoami", requireAuth, (c) => {
    const user = c.get("user");
    return c.json({ id: user.userId, role: user.role, email: user.email });
  });
  return app;
}

function makeAdminApp() {
  const app = new Hono();
  app.get("/admin-only", requireAdmin, (c) => {
    const user = c.get("user");
    return c.json({ id: user.userId, role: user.role });
  });
  return app;
}

describe("requireAuth middleware", () => {
  beforeEach(() => {
    resetSelectQueue();
    verifyClerkToken.mockReset();
  });

  it("returns 401 when no Authorization header is present", async () => {
    const app = makeAuthApp();
    const res = await app.request("/whoami");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token fails Clerk verification", async () => {
    verifyClerkToken.mockRejectedValueOnce(new Error("bad token"));
    const app = makeAuthApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer not.a.real.jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 USER_NOT_SYNCED when the token is valid but no user row exists", async () => {
    verifyClerkToken.mockResolvedValueOnce({
      sub: "user_1",
    } as unknown as Awaited<ReturnType<typeof ctu.verifyClerkToken>>);
    enqueueSelectResult([]);
    const app = makeAuthApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer good.token" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("USER_NOT_SYNCED");
  });

  it("attaches the AuthUser context and proceeds when token + user exist", async () => {
    verifyClerkToken.mockResolvedValueOnce({
      sub: "user_1",
    } as unknown as Awaited<ReturnType<typeof ctu.verifyClerkToken>>);
    enqueueSelectResult([
      {
        id: "user_1",
        email: "alice@example.com",
        role: "user" as const,
      },
    ]);
    const app = makeAuthApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer good.token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; role: string; email: string };
    expect(body).toEqual({ id: "user_1", role: "user", email: "alice@example.com" });
  });
});

describe("requireAdmin middleware", () => {
  beforeEach(() => {
    resetSelectQueue();
    verifyClerkToken.mockReset();
  });

  it("returns 401 when no Authorization header is present", async () => {
    const app = makeAdminApp();
    const res = await app.request("/admin-only");
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user exists but role is not admin", async () => {
    verifyClerkToken.mockResolvedValueOnce({
      sub: "user_2",
    } as unknown as Awaited<ReturnType<typeof ctu.verifyClerkToken>>);
    enqueueSelectResult([
      {
        id: "user_2",
        email: "bob@example.com",
        role: "user" as const,
      },
    ]);
    const app = makeAdminApp();
    const res = await app.request("/admin-only", {
      headers: { Authorization: "Bearer good.token" },
    });
    expect(res.status).toBe(403);
  });

  it("proceeds when the user has admin role", async () => {
    verifyClerkToken.mockResolvedValueOnce({
      sub: "user_3",
    } as unknown as Awaited<ReturnType<typeof ctu.verifyClerkToken>>);
    enqueueSelectResult([
      {
        id: "user_3",
        email: "admin@example.com",
        role: "admin" as const,
      },
    ]);
    const app = makeAdminApp();
    const res = await app.request("/admin-only", {
      headers: { Authorization: "Bearer good.token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; role: string };
    expect(body).toEqual({ id: "user_3", role: "admin" });
  });
});

describe("requireAuth — edge cases", () => {
  beforeEach(() => {
    resetSelectQueue();
    verifyClerkToken.mockReset();
  });

  it("returns 401 USER_NOT_SYNCED when token sub is empty string", async () => {
    verifyClerkToken.mockResolvedValueOnce({
      sub: "",
    } as unknown as Awaited<ReturnType<typeof ctu.verifyClerkToken>>);
    enqueueSelectResult([]);
    const app = makeAuthApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer good.token" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("USER_NOT_SYNCED");
  });

  it("returns 401 when verifyClerkToken throws an error", async () => {
    verifyClerkToken.mockRejectedValueOnce(
      new Error("Clerk verification failed")
    );
    const app = makeAuthApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer bad.token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 when valid token and valid user with admin role", async () => {
    verifyClerkToken.mockResolvedValueOnce({
      sub: "user_admin",
    } as unknown as Awaited<ReturnType<typeof ctu.verifyClerkToken>>);
    enqueueSelectResult([
      {
        id: "user_admin",
        email: "admin@example.com",
        role: "admin" as const,
      },
    ]);
    const app = makeAuthApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer good.token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; role: string; email: string };
    expect(body).toEqual({
      id: "user_admin",
      role: "admin",
      email: "admin@example.com",
    });
  });
});

describe("requireAdmin — edge cases", () => {
  beforeEach(() => {
    resetSelectQueue();
    verifyClerkToken.mockReset();
  });

  it("passes when user has admin role and sets c.get('user') correctly", async () => {
    verifyClerkToken.mockResolvedValueOnce({
      sub: "user_admin",
    } as unknown as Awaited<ReturnType<typeof ctu.verifyClerkToken>>);
    enqueueSelectResult([
      {
        id: "user_admin",
        email: "admin@example.com",
        role: "admin" as const,
      },
    ]);
    const app = makeAdminApp();
    const res = await app.request("/admin-only", {
      headers: { Authorization: "Bearer good.token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; role: string };
    expect(body.id).toBe("user_admin");
    expect(body.role).toBe("admin");
  });

  it("returns 401 when token has no Bearer prefix", async () => {
    const app = makeAdminApp();
    const res = await app.request("/admin-only", {
      headers: { Authorization: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" },
    });
    expect(res.status).toBe(401);
  });
});
