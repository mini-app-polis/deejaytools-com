import { CommonErrors, error, success, successList } from "common-typescript-utils";
import { PartnerRoleSchema } from "@deejaytools/schemas";
import { zValidator } from "../lib/validate.js";
import { Hono } from "hono";
import { z } from "zod";
import { and, asc, count, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { checkins, pairs, partners, queueEntries, songs } from "../db/schema.js";
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

/** Pairs where the current user is user A (leader) — for check-in entity picker. */
partnerRoutes.get("/leading-pairs", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const rows = await db
    .select({
      id: pairs.id,
      partnerBId: pairs.partnerBId,
      partnerFirst: partners.firstName,
      partnerLast: partners.lastName,
    })
    .from(pairs)
    .leftJoin(partners, eq(partners.id, pairs.partnerBId))
    .where(
      and(
        eq(pairs.userAId, userId),
        or(isNull(pairs.partnerBId), eq(partners.kind, "partner"))
      )
    );

  const results = rows.map((r) => ({
    id: r.id,
    partner_b_id: r.partnerBId,
    display_name: r.partnerBId
      ? partnerDisplayName(r.partnerFirst ?? "", r.partnerLast ?? "")
      : "Open slot",
  }));
  return c.json(successList(results));
});

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
    .where(and(eq(partners.userId, userId), eq(partners.kind, "partner")))
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

partnerRoutes.get("/:id/associations", requireAuth, async (c) => {
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

  const [songCountRow] = await db
    .select({ c: count() })
    .from(songs)
    .where(and(eq(songs.partnerId, id), eq(songs.userId, userId)));

  // Active check-in: checkin that still has a live queue entry.
  const [activeHit] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .innerJoin(pairs, eq(pairs.id, checkins.entityPairId))
    .innerJoin(queueEntries, eq(queueEntries.checkinId, checkins.id))
    .where(eq(pairs.partnerBId, id))
    .limit(1);

  // Historical check-in: any checkin ever (completed/withdrawn rows remain in the
  // checkins table and their entityPairId FK is RESTRICT — pair deletion is blocked).
  const [historyHit] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .innerJoin(pairs, eq(pairs.id, checkins.entityPairId))
    .where(eq(pairs.partnerBId, id))
    .limit(1);

  return c.json(
    success({
      song_count: Number(songCountRow?.c ?? 0),
      has_active_checkin: !!activeHit,
      has_checkin_history: !!historyHit,
    })
  );
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

  // Block only if there is a live queue entry — an active check-in cannot be orphaned.
  const [activeHit] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .innerJoin(pairs, eq(pairs.id, checkins.entityPairId))
    .innerJoin(queueEntries, eq(queueEntries.checkinId, checkins.id))
    .where(eq(pairs.partnerBId, id))
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

  // Collect all pair IDs for this partner so we can handle them correctly.
  // Pairs that have historical checkins (RESTRICT FK on checkins.entityPairId) cannot
  // be deleted — instead we null out their partnerBId so the pair row survives for
  // history while the partner record itself is removed.
  // Pairs with no checkin history are safe to delete outright.
  const partnerPairs = await db
    .select({ id: pairs.id })
    .from(pairs)
    .where(eq(pairs.partnerBId, id));
  const partnerPairIds = partnerPairs.map((p) => p.id);

  const pairsWithHistory =
    partnerPairIds.length > 0
      ? await db
          .select({ entityPairId: checkins.entityPairId })
          .from(checkins)
          .where(inArray(checkins.entityPairId, partnerPairIds))
          .groupBy(checkins.entityPairId)
      : [];
  const historicPairIds = new Set(pairsWithHistory.map((r) => r.entityPairId).filter(Boolean) as string[]);

  await db.transaction(async (tx) => {
    await tx
      .update(songs)
      .set({ partnerId: null })
      .where(and(eq(songs.partnerId, id), eq(songs.userId, userId)));

    // Pairs with history: null out partnerBId so the pair row persists for FK integrity.
    const toOrphan = partnerPairIds.filter((pid) => historicPairIds.has(pid));
    if (toOrphan.length > 0) {
      await tx.update(pairs).set({ partnerBId: null }).where(inArray(pairs.id, toOrphan));
    }

    // Pairs without history: safe to delete entirely.
    const toDelete = partnerPairIds.filter((pid) => !historicPairIds.has(pid));
    if (toDelete.length > 0) {
      await tx.delete(pairs).where(inArray(pairs.id, toDelete));
    }

    await tx.delete(partners).where(and(eq(partners.id, id), eq(partners.userId, userId)));
  });
  return c.body(null, 204);
});
