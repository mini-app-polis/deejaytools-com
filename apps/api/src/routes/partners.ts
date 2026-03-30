import {
  CommonErrors,
  PartnerRoleSchema,
  error,
  success,
  successList,
} from "@deejaytools/ts-utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { checkins, pairs, partners } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

const createBody = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  partner_role: PartnerRoleSchema,
  email: z.string().email().optional(),
});

const patchBody = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  partner_role: PartnerRoleSchema.optional(),
  email: z.string().email().nullable().optional(),
});

export const partnerRoutes = new Hono();

function partnerDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

function mapPartner(row: typeof partners.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    first_name: row.firstName,
    last_name: row.lastName,
    partner_role: row.partnerRole,
    email: row.email,
    linked_user_id: row.linkedUserId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    display_name: partnerDisplayName(row.firstName, row.lastName),
  };
}

partnerRoutes.get("/", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const rows = await db
    .select()
    .from(partners)
    .where(eq(partners.userId, userId))
    .orderBy(asc(partners.lastName), asc(partners.firstName));
  return c.json(successList(rows.map(mapPartner)));
});

partnerRoutes.post("/", requireAuth, zValidator("json", createBody), async (c) => {
  const userId = c.get("user").userId;
  const body = c.req.valid("json");
  const now = Date.now();
  const id = crypto.randomUUID();
  const firstName = body.first_name.trim();
  const lastName = body.last_name.trim();
  await db.insert(partners).values({
    id,
    userId,
    firstName,
    lastName,
    partnerRole: body.partner_role,
    email: body.email?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await db.select().from(partners).where(eq(partners.id, id)).limit(1);
  return c.json(success(mapPartner(row!)), 201);
});

partnerRoutes.get("/:id", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");
  const [row] = await db
    .select()
    .from(partners)
    .where(and(eq(partners.id, id), eq(partners.userId, userId)))
    .limit(1);
  if (!row) {
    return c.json(CommonErrors.notFound("Partner"), 404);
  }
  return c.json(success(mapPartner(row)));
});

partnerRoutes.patch("/:id", requireAuth, zValidator("json", patchBody), async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(partners)
    .where(and(eq(partners.id, id), eq(partners.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json(CommonErrors.notFound("Partner"), 404);
  }

  if (body.first_name !== undefined && !body.first_name.trim()) {
    return c.json(CommonErrors.badRequest("first_name cannot be empty"), 400);
  }
  if (body.last_name !== undefined && !body.last_name.trim()) {
    return c.json(CommonErrors.badRequest("last_name cannot be empty"), 400);
  }

  const now = Date.now();
  const updates: Partial<typeof partners.$inferInsert> = { updatedAt: now };
  if (body.first_name !== undefined) updates.firstName = body.first_name.trim();
  if (body.last_name !== undefined) updates.lastName = body.last_name.trim();
  if (body.partner_role !== undefined) updates.partnerRole = body.partner_role;
  if (body.email !== undefined) updates.email = body.email === null ? null : body.email.trim() || null;

  if (
    body.first_name === undefined &&
    body.last_name === undefined &&
    body.partner_role === undefined &&
    body.email === undefined
  ) {
    return c.json(success(mapPartner(existing)));
  }

  await db.update(partners).set(updates).where(eq(partners.id, id));
  const [row] = await db.select().from(partners).where(eq(partners.id, id)).limit(1);
  return c.json(success(mapPartner(row!)));
});

partnerRoutes.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(partners)
    .where(and(eq(partners.id, id), eq(partners.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json(CommonErrors.notFound("Partner"), 404);
  }

  const [activeHit] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .innerJoin(pairs, eq(pairs.id, checkins.pairId))
    .where(
      and(
        eq(pairs.partnerBId, id),
        inArray(checkins.status, ["waiting", "on_deck", "running"])
      )
    )
    .limit(1);

  if (activeHit) {
    return c.json(
      error(
        "PARTNER_IN_ACTIVE_CHECKIN",
        "This partner is linked to a pair with an active check-in. Complete or withdraw the check-in first."
      ),
      409
    );
  }

  await db.delete(partners).where(and(eq(partners.id, id), eq(partners.userId, userId)));
  return c.body(null, 204);
});
