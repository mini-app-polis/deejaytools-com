import { beforeEach, describe, expect, it, vi } from "vitest";
import * as ctu from "common-typescript-utils";
import type { Context } from "hono";

// ---------------------------------------------------------------------------
// Mocks — hoisted before the module under test is imported.
// ---------------------------------------------------------------------------

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});

vi.mock("common-typescript-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("common-typescript-utils")>();
  return { ...actual, verifyClerkToken: vi.fn() };
});

// Also mock the JWKS URL helper so the function doesn't read the env directly
// inside verifyClerkToken (the mock ignores it anyway, but keeps the test pure).
vi.mock("../middleware/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/auth.js")>();
  return { ...actual, jwksUrl: () => "https://clerk.test/.well-known/jwks.json" };
});

import { getOptionalSyncedUserId } from "./optional-user.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

const verifyClerkToken = vi.mocked(ctu.verifyClerkToken);

// ---------------------------------------------------------------------------
// Helper — build a minimal Hono Context with the given Authorization header.
// ---------------------------------------------------------------------------

function makeContext(authHeader?: string): Context {
  return {
    req: {
      header: (name: string) =>
        name.toLowerCase() === "authorization" ? authHeader : undefined,
    },
  } as unknown as Context;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetSelectQueue();
  verifyClerkToken.mockReset();
});

describe("getOptionalSyncedUserId", () => {
  it("returns undefined when no Authorization header is present", async () => {
    const result = await getOptionalSyncedUserId(makeContext());
    expect(result).toBeUndefined();
    expect(verifyClerkToken).not.toHaveBeenCalled();
  });

  it("returns undefined when the Authorization header is not a Bearer token", async () => {
    const result = await getOptionalSyncedUserId(makeContext("Basic abc123"));
    expect(result).toBeUndefined();
    expect(verifyClerkToken).not.toHaveBeenCalled();
  });

  it("returns undefined when verifyClerkToken throws (invalid/expired token)", async () => {
    verifyClerkToken.mockRejectedValueOnce(new Error("jwt expired"));

    const result = await getOptionalSyncedUserId(makeContext("Bearer bad-token"));

    expect(result).toBeUndefined();
  });

  it("returns undefined when the token is valid but the user is not in the DB", async () => {
    verifyClerkToken.mockResolvedValueOnce({ sub: "user_ghost", email: "ghost@example.com" });
    enqueueSelectResult([]); // no matching user row

    const result = await getOptionalSyncedUserId(makeContext("Bearer valid-token"));

    expect(result).toBeUndefined();
  });

  it("returns the user id when the token is valid and the user exists in the DB", async () => {
    verifyClerkToken.mockResolvedValueOnce({ sub: "user_abc", email: "abc@example.com" });
    enqueueSelectResult([{ id: "user_abc" }]);

    const result = await getOptionalSyncedUserId(makeContext("Bearer valid-token"));

    expect(result).toBe("user_abc");
  });

  it("does not throw when verifyClerkToken rejects — always resolves to undefined on error", async () => {
    verifyClerkToken.mockRejectedValueOnce(new Error("network error"));

    await expect(
      getOptionalSyncedUserId(makeContext("Bearer some-token"))
    ).resolves.toBeUndefined();
  });
});
