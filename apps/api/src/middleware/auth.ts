import {
  verifyClerkToken,
  type ClerkPayload,
  CommonErrors,
  createLogger,
  error,
} from "@deejaytools/ts-utils";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

const logger = createLogger("deejaytools-api");

export type AuthUser = {
  userId: string;
  email: string | null;
  role: "user" | "admin";
  clerk: ClerkPayload;
};

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export function jwksUrl(): string {
  const url = process.env.CLERK_JWKS_URL;
  if (!url) throw new Error("CLERK_JWKS_URL is required");
  return url;
}

export function bearerToken(c: Context): string | null {
  const h = c.req.header("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

async function resolveAuthUser(c: Context): Promise<AuthUser | Response> {
  const token = bearerToken(c);
  if (!token) {
    logger.warn({
      event: "auth_failed",
      category: "api",
      context: { reason: "missing_token" as const },
    });
    return c.json(CommonErrors.unauthorized(), 401);
  }
  let payload: ClerkPayload;
  try {
    payload = await verifyClerkToken(token, jwksUrl());
  } catch {
    logger.warn({
      event: "auth_failed",
      category: "api",
      context: { reason: "invalid_token" as const },
    });
    return c.json(CommonErrors.unauthorized(), 401);
  }

  const [row] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!row) {
    return c.json(error("USER_NOT_SYNCED", "Call POST /v1/auth/sync first"), 401);
  }

  return {
    userId: row.id,
    email: row.email,
    role: row.role,
    clerk: payload,
  };
}

export const requireAuth = createMiddleware(async (c, next) => {
  const r = await resolveAuthUser(c);
  if (r instanceof Response) return r;
  c.set("user", r);
  await next();
});

export const requireAdmin = createMiddleware(async (c, next) => {
  const r = await resolveAuthUser(c);
  if (r instanceof Response) return r;
  if (r.role !== "admin") {
    logger.warn({
      event: "auth_forbidden",
      category: "api",
      context: { user_id: r.userId },
    });
    return c.json(CommonErrors.forbidden(), 403);
  }
  c.set("user", r);
  await next();
});
