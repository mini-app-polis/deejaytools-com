import { CommonErrors, createLogger, error, success, successList } from "common-typescript-utils";
import { createTeamBodySchema } from "@deejaytools/schemas";
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { teams } from "../db/schema.js";
import { titleCaseIfNoCaps } from "../lib/text.js";
import { zValidator } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";

const logger = createLogger("deejaytools-api");

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

function mapTeam(row: typeof teams.$inferSelect) {
  return {
    id: row.id,
    user_id: row.userId,
    identifier: row.identifier,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export const teamsRoutes = new Hono();

teamsRoutes.get("/", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const rows = await db
    .select()
    .from(teams)
    .where(eq(teams.userId, userId))
    .orderBy(desc(teams.createdAt));
  return c.json(successList(rows.map(mapTeam)));
});

teamsRoutes.post("/", requireAuth, zValidator("json", createTeamBodySchema), async (c) => {
  const userId = c.get("user").userId;
  const body = c.req.valid("json");
  const now = Date.now();
  const id = crypto.randomUUID();
  const identifier = titleCaseIfNoCaps(body.identifier);

  try {
    await db.insert(teams).values({
      id,
      userId,
      identifier,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(error("conflict", "You already have a team with that name."), 409);
    }
    logger.error({
      event: "team_create_failed",
      category: "api",
      context: { userId, identifier },
      error: err,
    });
    return c.json(CommonErrors.internalError(), 500);
  }

  const [row] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return c.json(success(mapTeam(row!)), 201);
});

teamsRoutes.patch("/:id", requireAuth, zValidator("json", createTeamBodySchema), async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const identifier = titleCaseIfNoCaps(body.identifier);

  const [existing] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json(CommonErrors.notFound("Team"), 404);
  }

  const now = Date.now();
  try {
    await db
      .update(teams)
      .set({ identifier, updatedAt: now })
      .where(and(eq(teams.id, id), eq(teams.userId, userId)));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return c.json(error("conflict", "You already have a team with that name."), 409);
    }
    throw err;
  }

  const [row] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return c.json(success(mapTeam(row!)));
});

teamsRoutes.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json(CommonErrors.notFound("Team"), 404);
  }

  await db.delete(teams).where(and(eq(teams.id, id), eq(teams.userId, userId)));
  return c.body(null, 204);
});
