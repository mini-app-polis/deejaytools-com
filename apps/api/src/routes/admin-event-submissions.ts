/**
 * Admin event song submission routes (stubbed persistence).
 *
 * Admin-only, cross-user aggregate: all song submissions for a given event.
 * Future query joins event_song_submissions → songs (division + partnership)
 * → events for the given event_id, so admins can view songs per event per
 * division. Read-only — no writes on this surface.
 */
import { success } from "common-typescript-utils";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validate.js";
import { requireAdmin } from "../middleware/auth.js";

const listQuery = z.object({
  event_id: z.string().min(1),
});

export const adminEventSubmissionRoutes = new Hono();

adminEventSubmissionRoutes.get(
  "/",
  requireAdmin,
  zValidator("query", listQuery),
  async (c) => {
    // STUB(db): needs event_song_submissions table — remove when schema lands
    return c.json(success([], { stub: true }), 200);
  }
);
