import { CommonErrors, success, successList } from "common-typescript-utils";
import { EventStatusSchema } from "@deejaytools/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { events } from "../db/schema.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const createEvent = z.object({
  name: z.string().min(1),
  date: z.string().optional(),
  status: EventStatusSchema.optional(),
});

const patchEvent = createEvent.partial();

export const eventRoutes = new Hono();

function mapEvent(row: typeof events.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    status: row.status,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

eventRoutes.get("/", async (c) => {
  const rows = await db.select().from(events).orderBy(desc(events.createdAt));
  return c.json(successList(rows.map(mapEvent)));
});

eventRoutes.get("/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!row) {
    return c.json(CommonErrors.notFound("Event"), 404);
  }
  return c.json(success(mapEvent(row)));
});

eventRoutes.post("/", requireAdmin, zValidator("json", createEvent), async (c) => {
  const body = c.req.valid("json");
  const uid = c.get("user").userId;
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.insert(events).values({
    id,
    name: body.name,
    date: body.date ?? null,
    status: body.status ?? "upcoming",
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return c.json(success(mapEvent(row!)), 201);
});

eventRoutes.patch("/:id", requireAdmin, zValidator("json", patchEvent), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!existing) {
    return c.json(CommonErrors.notFound("Event"), 404);
  }
  const now = Date.now();
  await db
    .update(events)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.date !== undefined && { date: body.date }),
      ...(body.status !== undefined && { status: body.status }),
      updatedAt: now,
    })
    .where(eq(events.id, id));
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return c.json(success(mapEvent(row!)));
});

eventRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!existing) {
    return c.json(CommonErrors.notFound("Event"), 404);
  }
  await db.delete(events).where(eq(events.id, id));
  return c.json(success({ deleted: true }));
});
