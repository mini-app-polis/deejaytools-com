import { CommonErrors, createLogger, error, success } from "common-typescript-utils";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { checkins, pairs, queueEntries, queueEvents, sessions } from "../db/schema.js";
import { zValidator } from "../lib/validate.js";
import { determineInitialQueue, loadAdmissionContext } from "../lib/queue/admission.js";
import { entityHasLiveEntry } from "../lib/queue/singleEntry.js";
import { nextBottomPosition } from "../lib/queue/compaction.js";
import { requireAuth } from "../middleware/auth.js";

const logger = createLogger("deejaytools-api");

export const checkinRoutes = new Hono();

const createCheckinBody = z
  .object({
    sessionId: z.string().min(1),
    divisionName: z.string().min(1),
    entityPairId: z.string().nullish(),
    entitySoloUserId: z.string().nullish(),
    songId: z.string().min(1),
    notes: z.string().nullish(),
  })
  .refine(
    (b) =>
      (Boolean(b.entityPairId) && !b.entitySoloUserId) ||
      (!b.entityPairId && Boolean(b.entitySoloUserId)),
    { message: "Exactly one of entityPairId / entitySoloUserId must be provided" }
  );

/** POST /v1/checkins — create a new check-in for an entity in an open session. */
checkinRoutes.post(
  "/",
  requireAuth,
  zValidator("json", createCheckinBody),
  async (c) => {
    const userId = c.get("user").userId;
    const body = c.req.valid("json");
    const now = Date.now();

    const [session] = await db
      .select({
        id: sessions.id,
        eventId: sessions.eventId,
        checkinOpensAt: sessions.checkinOpensAt,
        floorTrialEndsAt: sessions.floorTrialEndsAt,
      })
      .from(sessions)
      .where(eq(sessions.id, body.sessionId));
    if (!session) return c.json(CommonErrors.notFound("Session"), 404);
    if (now < session.checkinOpensAt)
      return c.json(CommonErrors.badRequest("Check-in has not opened yet"), 400);
    if (now > session.floorTrialEndsAt)
      return c.json(CommonErrors.badRequest("Check-in is closed for this session"), 400);

    if (body.entityPairId) {
      const [pair] = await db
        .select({ userAId: pairs.userAId, partnerBId: pairs.partnerBId })
        .from(pairs)
        .where(eq(pairs.id, body.entityPairId));
      if (!pair) return c.json(CommonErrors.badRequest("Pair not found"), 400);
      if (pair.userAId !== userId)
        return c.json(CommonErrors.badRequest("You are not a member of this pair"), 400);
    } else {
      if (body.entitySoloUserId !== userId)
        return c.json(CommonErrors.badRequest("You may only submit a solo check-in for yourself"), 400);
    }

    const entity = {
      pairId: body.entityPairId ?? undefined,
      soloUserId: body.entitySoloUserId ?? undefined,
    };
    if (await entityHasLiveEntry(entity, body.sessionId))
      return c.json(
        error("conflict", "This entity already has a live queue entry in this session"),
        409
      );

    let initialQueue: "priority" | "non_priority";
    try {
      const ctx = await loadAdmissionContext(body.sessionId, body.divisionName);
      initialQueue = await determineInitialQueue(entity, ctx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Admission lookup failed";
      return c.json(CommonErrors.badRequest(msg), 400);
    }

    const checkinId = crypto.randomUUID();
    const queueEntryId = crypto.randomUUID();
    const queueEventRowId = crypto.randomUUID();

    try {
      await db.transaction(async (tx) => {
        await tx.insert(checkins).values({
          id: checkinId,
          sessionId: body.sessionId,
          divisionName: body.divisionName,
          entityPairId: body.entityPairId ?? null,
          entitySoloUserId: body.entitySoloUserId ?? null,
          songId: body.songId,
          submittedByUserId: userId,
          initialQueue,
          notes: body.notes ?? null,
          createdAt: now,
        });

        const position = await nextBottomPosition(tx, body.sessionId, initialQueue);

        await tx.insert(queueEntries).values({
          id: queueEntryId,
          checkinId,
          sessionId: body.sessionId,
          entityPairId: body.entityPairId ?? null,
          entitySoloUserId: body.entitySoloUserId ?? null,
          queueType: initialQueue,
          position,
          enteredQueueAt: now,
        });

        await tx.insert(queueEvents).values({
          id: queueEventRowId,
          sessionId: body.sessionId,
          checkinId,
          action: "checked_in",
          fromQueue: null,
          fromPosition: null,
          toQueue: initialQueue,
          toPosition: position,
          actorUserId: userId,
          reason: null,
          createdAt: now,
        });
      });
    } catch (err) {
      logger.error({
        event: "checkin_create_failed",
        category: "api",
        context: {
          sessionId: body.sessionId,
          divisionName: body.divisionName,
          userId,
          entityPairId: body.entityPairId ?? null,
          entitySoloUserId: body.entitySoloUserId ?? null,
        },
        error: err,
      });
      return c.json(
        error("conflict", "Check-in conflicted with concurrent activity; please retry"),
        409
      );
    }

    return c.json(
      success({
        id: checkinId,
        sessionId: body.sessionId,
        divisionName: body.divisionName,
        initialQueue,
      }),
      201
    );
  }
);
