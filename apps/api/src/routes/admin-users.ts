import { CommonErrors, createLogger, error, success, successList } from "common-typescript-utils";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { partners, songs, users } from "../db/schema.js";
import { zValidator } from "../lib/validate.js";
import { requireAdmin } from "../middleware/auth.js";

const logger = createLogger("deejaytools-api");

export const adminUserRoutes = new Hono();

const listQuery = z.object({
  /** Free-text filter against email + first/last name (case-insensitive). */
  q: z.string().optional(),
  /** Restrict to a single role. */
  role: z.enum(["user", "admin"]).optional(),
});

/**
 * GET /v1/admin/users
 *
 * Admin-only directory of every account on the platform. Returns the fields
 * the Users tab needs to render the table — id, email, names, role, the
 * createdAt epoch, and per-user counts of songs + partners — sorted
 * oldest-first so newly created accounts surface naturally at the bottom.
 *
 * The song/partner counts are correlated subqueries rather than GROUP BY
 * joins. With LEFT JOIN + GROUP BY a user with N songs and M partners
 * would produce N*M rows that need to be deduplicated; the subquery form
 * stays at one row per user and is straightforward to read. The `::int`
 * cast forces postgres.js to deliver the count as a JS number — without
 * it, COUNT(*) returns bigint and arrives here as a string.
 *
 * Query params:
 *   - q:    optional search across email / first_name / last_name (ILIKE)
 *   - role: optional exact-match filter ("user" | "admin")
 *
 * The response envelope is the standard {data: [...]} from successList so
 * the frontend wrapper can unbox it the same way it does for all other list
 * endpoints.
 */
adminUserRoutes.get("/", requireAdmin, zValidator("query", listQuery), async (c) => {
  const { q, role } = c.req.valid("query");

  const conditions = [];
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    conditions.push(
      or(
        ilike(users.email, term),
        ilike(users.firstName, term),
        ilike(users.lastName, term)
      )
    );
  }
  if (role) {
    conditions.push(eq(users.role, role));
  }

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      createdAt: users.createdAt,
      songCount: sql<number>`(SELECT COUNT(*)::int FROM ${songs} WHERE ${songs.userId} = ${users.id})`,
      partnerCount: sql<number>`(SELECT COUNT(*)::int FROM ${partners} WHERE ${partners.userId} = ${users.id})`,
    })
    .from(users)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(users.createdAt));

  return c.json(
    successList(
      rows.map((r) => ({
        id: r.id,
        email: r.email,
        first_name: r.firstName,
        last_name: r.lastName,
        role: r.role,
        created_at: r.createdAt,
        // postgres.js sometimes still hands counts back as strings even with
        // ::int (driver quirk for some bigint cases). Coerce defensively so
        // the frontend always sees a number.
        song_count: Number(r.songCount ?? 0),
        partner_count: Number(r.partnerCount ?? 0),
      }))
    )
  );
});

const updateRoleParam = z.object({ id: z.string().min(1) });
const updateRoleBody = z.object({ role: z.enum(["user", "admin"]) });

/**
 * PATCH /v1/admin/users/:id/role
 *
 * Promote or demote a single user. Wrapped in two safety checks:
 *   1. requireAdmin — only existing admins can call this
 *   2. self-demote guard — an admin cannot change their own role away from
 *      "admin", because doing so would lock the platform out if they were
 *      the only admin and is almost always a misclick. Demoting another
 *      admin's account is fine.
 *
 * The endpoint is idempotent: PATCHing a user to the role they already have
 * is a no-op that still returns 200 with the current row.
 */
adminUserRoutes.patch(
  "/:id/role",
  requireAdmin,
  zValidator("param", updateRoleParam),
  zValidator("json", updateRoleBody),
  async (c) => {
    const { id } = c.req.valid("param");
    const { role } = c.req.valid("json");
    const callerId = c.get("user").userId;

    if (id === callerId && role !== "admin") {
      logger.warn({
        event: "admin_self_demote_blocked",
        category: "api",
        context: { user_id: callerId },
      });
      // Custom message via the generic error() builder — CommonErrors.forbidden()
      // doesn't accept a message in this version of common-typescript-utils.
      return c.json(
        error("forbidden", "You cannot change your own admin role."),
        403
      );
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (existing.length === 0) {
      return c.json(CommonErrors.notFound(), 404);
    }

    await db
      .update(users)
      .set({ role, updatedAt: Date.now() })
      .where(eq(users.id, id));

    // Mirror the GET shape exactly — including song/partner counts — so the
    // PATCH response satisfies ApiAdminUser and the frontend can drop the
    // returned row straight into local state.
    const [updated] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        createdAt: users.createdAt,
        songCount: sql<number>`(SELECT COUNT(*)::int FROM ${songs} WHERE ${songs.userId} = ${users.id})`,
        partnerCount: sql<number>`(SELECT COUNT(*)::int FROM ${partners} WHERE ${partners.userId} = ${users.id})`,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return c.json(
      success({
        id: updated!.id,
        email: updated!.email,
        first_name: updated!.firstName,
        last_name: updated!.lastName,
        role: updated!.role,
        created_at: updated!.createdAt,
        song_count: Number(updated!.songCount ?? 0),
        partner_count: Number(updated!.partnerCount ?? 0),
      })
    );
  }
);
