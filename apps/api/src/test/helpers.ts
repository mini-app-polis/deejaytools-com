import type { ErrorEnvelope, SuccessEnvelope } from "@deejaytools/ts-utils";
import { expect } from "vitest";

export type { ErrorEnvelope, SuccessEnvelope };

export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export type HonoZodFailureBody = {
  success: false;
  error: { name: "ZodError"; issues: { path: (string | number)[] }[] };
};

export const MOCK_USER = {
  userId: "user_test123",
  email: "test@example.com",
};

export const MOCK_ADMIN = {
  userId: "user_admin123",
  email: "admin@example.com",
  role: "admin" as const,
};

export function authHeaders(user: { userId: string } = MOCK_USER) {
  return {
    Authorization: `Bearer mock-token-${user.userId}`,
  };
}

/** Single-resource or non-list success payloads (meta may omit count). */
export function assertSuccessEnvelope(body: unknown) {
  expect(body).toMatchObject({
    data: expect.anything(),
    meta: expect.objectContaining({
      version: expect.any(String),
    }),
  });
}

/** List endpoints built with successList (includes count). */
export function assertSuccessListEnvelope(body: unknown) {
  expect(body).toMatchObject({
    data: expect.any(Array),
    meta: expect.objectContaining({
      version: expect.any(String),
      count: expect.any(Number),
    }),
  });
}

export function assertErrorEnvelope(body: unknown) {
  expect(body).toMatchObject({
    error: expect.objectContaining({
      code: expect.any(String),
      message: expect.any(String),
    }),
  });
}

/** zValidator failures use Hono's default `{ success: false, error: ZodError }` shape. */
export function assertValidation400(body: HonoZodFailureBody | ErrorEnvelope) {
  const b = body as HonoZodFailureBody | ErrorEnvelope;
  if (
    "success" in b &&
    b.success === false &&
    b.error &&
    typeof b.error === "object" &&
    "name" in b.error &&
    b.error.name === "ZodError" &&
    "issues" in b.error &&
    Array.isArray((b.error as { issues: unknown[] }).issues)
  ) {
    expect((b.error as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
    return;
  }
  assertErrorEnvelope(b);
}
