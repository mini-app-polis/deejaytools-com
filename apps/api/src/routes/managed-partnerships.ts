import { CommonErrors, createLogger, success, successList } from "common-typescript-utils";
import { createManagedPartnershipBodySchema } from "@deejaytools/schemas";
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { managedPartnerships } from "../db/schema.js";
import { zValidator } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";

const logger = createLogger("deejaytools-api");

function mapManagedPartnership(row: typeof managedPartnerships.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    leader_first_name: row.leaderFirstName,
    leader_last_name: row.leaderLastName,
    follower_first_name: row.followerFirstName,
    follower_last_name: row.followerLastName,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export const managedPartnershipsRoutes = new Hono();

managedPartnershipsRoutes.get("/", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const rows = await db
    .select()
    .from(managedPartnerships)
    .where(eq(managedPartnerships.userId, userId))
    .orderBy(desc(managedPartnerships.createdAt));
  return c.json(successList(rows.map(mapManagedPartnership)));
});

managedPartnershipsRoutes.post(
  "/",
  requireAuth,
  zValidator("json", createManagedPartnershipBodySchema),
  async (c) => {
    const userId = c.get("user").userId;
    const body = c.req.valid("json");
    const now = Date.now();
    const id = crypto.randomUUID();

    try {
      await db.insert(managedPartnerships).values({
        id,
        userId,
        leaderFirstName: body.leader_first_name.trim(),
        leaderLastName: body.leader_last_name.trim(),
        followerFirstName: body.follower_first_name.trim(),
        followerLastName: body.follower_last_name.trim(),
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      logger.error({
        event: "managed_partnership_create_failed",
        category: "api",
        context: { userId },
        error: err,
      });
      return c.json(CommonErrors.internalError(), 500);
    }

    const [row] = await db
      .select()
      .from(managedPartnerships)
      .where(eq(managedPartnerships.id, id))
      .limit(1);
    return c.json(success(mapManagedPartnership(row!)), 201);
  }
);

managedPartnershipsRoutes.patch(
  "/:id",
  requireAuth,
  zValidator("json", createManagedPartnershipBodySchema),
  async (c) => {
    const userId = c.get("user").userId;
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [existing] = await db
      .select()
      .from(managedPartnerships)
      .where(and(eq(managedPartnerships.id, id), eq(managedPartnerships.userId, userId)))
      .limit(1);

    if (!existing) {
      return c.json(CommonErrors.notFound("Managed partnership"), 404);
    }

    const now = Date.now();
    try {
      await db
        .update(managedPartnerships)
        .set({
          leaderFirstName: body.leader_first_name.trim(),
          leaderLastName: body.leader_last_name.trim(),
          followerFirstName: body.follower_first_name.trim(),
          followerLastName: body.follower_last_name.trim(),
          updatedAt: now,
        })
        .where(and(eq(managedPartnerships.id, id), eq(managedPartnerships.userId, userId)));
    } catch (err) {
      logger.error({
        event: "managed_partnership_update_failed",
        category: "api",
        context: { userId, managedPartnershipId: id },
        error: err,
      });
      return c.json(CommonErrors.internalError(), 500);
    }

    const [row] = await db
      .select()
      .from(managedPartnerships)
      .where(eq(managedPartnerships.id, id))
      .limit(1);
    return c.json(success(mapManagedPartnership(row!)));
  }
);

managedPartnershipsRoutes.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(managedPartnerships)
    .where(and(eq(managedPartnerships.id, id), eq(managedPartnerships.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json(CommonErrors.notFound("Managed partnership"), 404);
  }

  try {
    await db
      .delete(managedPartnerships)
      .where(and(eq(managedPartnerships.id, id), eq(managedPartnerships.userId, userId)));
  } catch (err) {
    logger.error({
      event: "managed_partnership_delete_failed",
      category: "api",
      context: { userId, managedPartnershipId: id },
      error: err,
    });
    return c.json(CommonErrors.internalError(), 500);
  }

  return c.body(null, 204);
});
