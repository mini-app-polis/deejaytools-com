import { CommonErrors, success } from "common-typescript-utils";
import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { pairs, partners } from "../db/schema.js";
import { zValidator } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";

export const pairRoutes = new Hono();

const findOrCreateBody = z.object({
  partner_id: z.string().min(1),
});

/**
 * POST /v1/pairs/find-or-create
 * Returns the existing pair for (currentUser, partnerId), creating it if needed.
 * Used by the check-in flow when the user's song has a partner but no pair row yet.
 */
pairRoutes.post("/find-or-create", requireAuth, zValidator("json", findOrCreateBody), async (c) => {
  const userId = c.get("user").userId;
  const { partner_id } = c.req.valid("json");

  // Verify the partner belongs to this user
  const [partner] = await db
    .select({ id: partners.id })
    .from(partners)
    .where(and(eq(partners.id, partner_id), eq(partners.userId, userId)))
    .limit(1);

  if (!partner) return c.json(CommonErrors.notFound("Partner"), 404);

  // Return existing pair if already set up
  const [existing] = await db
    .select({ id: pairs.id })
    .from(pairs)
    .where(and(eq(pairs.userAId, userId), eq(pairs.partnerBId, partner_id)))
    .limit(1);

  if (existing) return c.json(success({ id: existing.id }));

  // Create new pair
  const id = crypto.randomUUID();
  await db.insert(pairs).values({
    id,
    userAId: userId,
    partnerBId: partner_id,
    createdAt: Date.now(),
  });

  return c.json(success({ id }), 201);
});
