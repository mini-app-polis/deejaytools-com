import { verifyClerkToken } from "common-typescript-utils";
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { bearerToken, jwksUrl } from "../middleware/auth.js";

/** Valid JWT + synced user row; otherwise undefined (invalid token is ignored). */
export async function getOptionalSyncedUserId(c: Context): Promise<string | undefined> {
  const token = bearerToken(c);
  if (!token) return undefined;
  try {
    const payload = await verifyClerkToken(token, jwksUrl());
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);
    return row?.id;
  } catch {
    return undefined;
  }
}
