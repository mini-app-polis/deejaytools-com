/**
 * Teams routes (stubbed persistence).
 *
 * Future `teams` table:
 *   - id          text PRIMARY KEY
 *   - user_id     text NOT NULL → users.id
 *   - identifier  text NOT NULL
 *   - created_at  bigint NOT NULL
 *   - updated_at  bigint NOT NULL
 *   - UNIQUE (user_id, identifier)
 */
import { error, success } from "common-typescript-utils";
import { createTeamBodySchema } from "@deejaytools/schemas";
import { Hono } from "hono";
import { zValidator } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";

export const teamsRoutes = new Hono();

teamsRoutes.get("/", requireAuth, async (c) => {
  // STUB(db): needs `teams` table — remove when schema lands
  return c.json(success([], { stub: true }), 200);
});

teamsRoutes.post("/", requireAuth, zValidator("json", createTeamBodySchema), async (c) => {
  // STUB(db): needs `teams` table — remove when schema lands
  return c.json(
    error("DB_STUB_PENDING", "Teams are not persisted yet — database schema pending."),
    501
  );
});

teamsRoutes.patch("/:id", requireAuth, zValidator("json", createTeamBodySchema), async (c) => {
  // STUB(db): needs `teams` table — remove when schema lands
  return c.json(
    error("DB_STUB_PENDING", "Teams are not persisted yet — database schema pending."),
    501
  );
});

teamsRoutes.delete("/:id", requireAuth, async (c) => {
  // STUB(db): needs `teams` table — remove when schema lands
  return c.json(
    error("DB_STUB_PENDING", "Teams are not persisted yet — database schema pending."),
    501
  );
});
