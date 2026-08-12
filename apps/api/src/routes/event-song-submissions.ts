/**
 * Event song submission routes (stubbed persistence).
 *
 * Future `event_song_submissions` table:
 *   - id                   text PRIMARY KEY
 *   - event_id             text NOT NULL → events.id
 *   - song_id              text NOT NULL → songs.id
 *   - submitted_by_user_id text NOT NULL → users.id
 *   - created_at           bigint NOT NULL
 *   - UNIQUE (event_id, song_id)
 *
 * Division and partnership are NOT stored here — they derive from the joined
 * song row (and its partner / managed partnership) when listing submissions.
 */
import { error, success } from "common-typescript-utils";
import { createEventSongSubmissionBodySchema } from "@deejaytools/schemas";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";

const listQuery = z.object({
  event_id: z.string().optional(),
});

export const eventSongSubmissionRoutes = new Hono();

eventSongSubmissionRoutes.get("/", requireAuth, zValidator("query", listQuery), async (c) => {
  // STUB(db): needs event_song_submissions table — remove when schema lands
  return c.json(success([], { stub: true }), 200);
});

eventSongSubmissionRoutes.post(
  "/",
  requireAuth,
  zValidator("json", createEventSongSubmissionBodySchema),
  async (c) => {
    // STUB(db): needs event_song_submissions table — remove when schema lands
    return c.json(
      error(
        "DB_STUB_PENDING",
        "Event song submissions are not persisted yet — database schema pending."
      ),
      501
    );
  }
);

eventSongSubmissionRoutes.delete("/:id", requireAuth, async (c) => {
  // STUB(db): needs event_song_submissions table — remove when schema lands
  return c.json(
    error(
      "DB_STUB_PENDING",
      "Event song submissions are not persisted yet — database schema pending."
    ),
    501
  );
});
