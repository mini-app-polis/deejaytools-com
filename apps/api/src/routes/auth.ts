import {
  CommonErrors,
  success,
  verifyClerkToken,
} from "@deejaytools/ts-utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { bearerToken, jwksUrl, requireAuth } from "../middleware/auth.js";

const syncBody = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
});

export const authRoutes = new Hono();

authRoutes.post("/sync", zValidator("json", syncBody), async (c) => {
  const token = bearerToken(c);
  if (!token) {
    return c.json(CommonErrors.unauthorized(), 401);
  }
  let payload;
  try {
    payload = await verifyClerkToken(token, jwksUrl());
  } catch {
    return c.json(CommonErrors.unauthorized(), 401);
  }

  const body = c.req.valid("json");
  const now = Date.now();

  await db
    .insert(users)
    .values({
      id: payload.sub,
      email: body.email,
      firstName: body.firstName ?? null,
      lastName: body.lastName ?? null,
      displayName: body.displayName ?? null,
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: body.email,
        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
        displayName: body.displayName ?? null,
        updatedAt: now,
      },
    });

  const [row] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!row) {
    return c.json(CommonErrors.internalError("Failed to load user"), 500);
  }

  return c.json(
    success({
      id: row.id,
      email: row.email,
      display_name: row.displayName,
      first_name: row.firstName,
      last_name: row.lastName,
      role: row.role,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    }),
    200
  );
});

authRoutes.get("/me", requireAuth, async (c) => {
  const uid = c.get("user").userId;
  const [row] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  if (!row) {
    return c.json(CommonErrors.notFound("User"), 404);
  }
  return c.json(
    success({
      id: row.id,
      email: row.email,
      display_name: row.displayName,
      first_name: row.firstName,
      last_name: row.lastName,
      role: row.role,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    })
  );
});
