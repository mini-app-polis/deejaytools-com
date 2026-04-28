import { CommonErrors, createLogger, error, success, successList } from "common-typescript-utils";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  checkins,
  pairs,
  partners,
  queueEntries,
  queueEvents,
  runs,
  sessions,
  songs,
  users,
} from "../db/schema.js";
import { zValidator } from "../lib/validate.js";
import { determineInitialQueue, loadAdmissionContext } from "../lib/queue/admission.js";
import { entityHasLiveEntry } from "../lib/queue/singleEntry.js";
import { nextBottomPosition } from "../lib/queue/compaction.js";
import { requireAdmin } from "../middleware/auth.js";

const logger = createLogger("deejaytools-api");

export const adminCheckinRoutes = new Hono();

const PLACEHOLDER_SONG_DISPLAY_NAME = "[Admin Test Placeholder]";

/** All synthetic users created by admin injection match this email pattern. */
const STUB_EMAIL_PATTERN = "admin-injected-%@test.local";

const injectBody = z.object({
  sessionId: z.string().min(1),
  divisionName: z.string().min(1),
  leaderFirstName: z.string().min(1),
  leaderLastName: z.string().min(1),
  followerFirstName: z.string().min(1),
  followerLastName: z.string().min(1),
  notes: z.string().nullish(),
});

/**
 * POST /v1/admin/checkins
 *
 * Admin-only test bypass for injecting a check-in without going through the
 * normal user flow. Creates fresh stub user + partner + pair rows for each
 * injection (no dedup — throwaway test data) and reuses a single placeholder
 * song owned by the admin. Bypasses the session check-in time window.
 *
 * Intended for testing only. Not exposed in the regular check-in flow.
 */
adminCheckinRoutes.post("/", requireAdmin, zValidator("json", injectBody), async (c) => {
  const adminUserId = c.get("user").userId;
  const body = c.req.valid("json");
  const now = Date.now();

  const leaderFirst = body.leaderFirstName.trim();
  const leaderLast = body.leaderLastName.trim();
  const followerFirst = body.followerFirstName.trim();
  const followerLast = body.followerLastName.trim();

  // 1) Confirm the session exists. Time-window checks are intentionally skipped.
  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, body.sessionId));
  if (!session) return c.json(CommonErrors.notFound("Session"), 404);

  // 2) Get-or-create the shared placeholder song. Owned by the admin so it appears
  // in /v1/songs for the admin's UI. Reused across all injections.
  let [placeholderSong] = await db
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.userId, adminUserId), eq(songs.displayName, PLACEHOLDER_SONG_DISPLAY_NAME)))
    .limit(1);

  if (!placeholderSong) {
    const songId = crypto.randomUUID();
    await db.insert(songs).values({
      id: songId,
      userId: adminUserId,
      partnerId: null,
      displayName: PLACEHOLDER_SONG_DISPLAY_NAME,
      originalFilename: null,
      processedFilename: null,
      driveFileId: null,
      driveFolderId: null,
      division: null,
      routineName: null,
      personalDescriptor: null,
      seasonYear: null,
      createdAt: now,
      updatedAt: now,
    });
    placeholderSong = { id: songId };
  }
  const songId = placeholderSong.id;

  // 3) Create stub leader user (synthetic email so it doesn't collide with real users).
  const stubUserId = crypto.randomUUID();
  const stubEmail = `admin-injected-${stubUserId}@test.local`;
  await db.insert(users).values({
    id: stubUserId,
    email: stubEmail,
    displayName: `${leaderFirst} ${leaderLast}`,
    firstName: leaderFirst,
    lastName: leaderLast,
    role: "user",
    createdAt: now,
    updatedAt: now,
  });

  // 4) Create stub follower partner profile, owned by the stub leader.
  const stubPartnerId = crypto.randomUUID();
  await db.insert(partners).values({
    id: stubPartnerId,
    userId: stubUserId,
    firstName: followerFirst,
    lastName: followerLast,
    partnerRole: "follower",
    email: null,
    linkedUserId: null,
    createdAt: now,
    updatedAt: now,
  });

  // 5) Create the pair (leader stub user → follower stub partner).
  const pairId = crypto.randomUUID();
  await db.insert(pairs).values({
    id: pairId,
    userAId: stubUserId,
    partnerBId: stubPartnerId,
    createdAt: now,
  });

  // 6) Determine initial queue using the existing admission logic.
  let initialQueue: "priority" | "non_priority";
  try {
    const ctx = await loadAdmissionContext(body.sessionId, body.divisionName);
    initialQueue = await determineInitialQueue({ pairId }, ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Admission lookup failed";
    return c.json(CommonErrors.badRequest(msg), 400);
  }

  // 7) Defensive single-entry check (shouldn't fire since pair is brand-new).
  if (await entityHasLiveEntry({ pairId }, body.sessionId)) {
    return c.json(
      error("conflict", "This entity already has a live queue entry in this session"),
      409
    );
  }

  // 8) Insert checkin + queueEntry + queueEvent in a single transaction.
  const checkinId = crypto.randomUUID();
  const queueEntryId = crypto.randomUUID();
  const queueEventRowId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(checkins).values({
        id: checkinId,
        sessionId: body.sessionId,
        divisionName: body.divisionName,
        entityPairId: pairId,
        entitySoloUserId: null,
        songId,
        submittedByUserId: adminUserId,
        initialQueue,
        notes: body.notes?.trim() || null,
        createdAt: now,
      });

      const position = await nextBottomPosition(tx, body.sessionId, initialQueue);

      await tx.insert(queueEntries).values({
        id: queueEntryId,
        checkinId,
        sessionId: body.sessionId,
        entityPairId: pairId,
        entitySoloUserId: null,
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
        actorUserId: adminUserId,
        reason: "admin_test_injection",
        createdAt: now,
      });
    });
  } catch (err) {
    logger.error({
      event: "admin_checkin_inject_failed",
      category: "api",
      context: {
        sessionId: body.sessionId,
        divisionName: body.divisionName,
        adminUserId,
        stubUserId,
        stubPartnerId,
        pairId,
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
      pair: {
        id: pairId,
        partner_b_id: stubPartnerId,
        display_name: `${leaderFirst} ${leaderLast} & ${followerFirst} ${followerLast}`,
      },
    }),
    201
  );
});

/**
 * GET /v1/admin/checkins/test
 *
 * Lists every synthetic test injection currently in the database, joined to
 * its pair, partner, latest checkin, session, and (if still live) queue entry.
 * Used by the AdminPage Test Inject tab to show what test data exists so it
 * can be reviewed and cleaned up.
 */
adminCheckinRoutes.get("/test", requireAdmin, async (c) => {
  const rows = await db
    .select({
      pairId: pairs.id,
      pairCreatedAt: pairs.createdAt,
      leaderFirst: users.firstName,
      leaderLast: users.lastName,
      followerFirst: partners.firstName,
      followerLast: partners.lastName,
      checkinId: checkins.id,
      sessionId: checkins.sessionId,
      sessionName: sessions.name,
      divisionName: checkins.divisionName,
      initialQueue: checkins.initialQueue,
      queueType: queueEntries.queueType,
      position: queueEntries.position,
    })
    .from(users)
    .innerJoin(pairs, eq(pairs.userAId, users.id))
    .leftJoin(partners, eq(partners.id, pairs.partnerBId))
    .leftJoin(checkins, eq(checkins.entityPairId, pairs.id))
    .leftJoin(sessions, eq(sessions.id, checkins.sessionId))
    .leftJoin(queueEntries, eq(queueEntries.checkinId, checkins.id))
    .where(like(users.email, STUB_EMAIL_PATTERN))
    .orderBy(desc(pairs.createdAt));

  return c.json(
    successList(
      rows.map((r) => ({
        pair_id: r.pairId,
        created_at: r.pairCreatedAt,
        leader_name: [r.leaderFirst, r.leaderLast].filter(Boolean).join(" "),
        follower_name:
          r.followerFirst || r.followerLast
            ? [r.followerFirst, r.followerLast].filter(Boolean).join(" ")
            : null,
        session_id: r.sessionId,
        session_name: r.sessionName,
        division_name: r.divisionName,
        // queueType is null when off-queue (completed, withdrawn, or no checkin yet).
        // queue status: "active" | "priority" | "non_priority" | "off_queue"
        queue_status: r.queueType ?? "off_queue",
        position: r.position,
      }))
    )
  );
});

/**
 * DELETE /v1/admin/checkins/test
 *
 * Hard-deletes every row tied to admin test injections, in FK-safe order:
 * queue_events → queue_entries → runs → checkins → pairs → partners → synthetic users.
 * The shared placeholder song is intentionally kept so the next injection reuses it.
 *
 * Returns the count of synthetic users (= test injections) that were removed.
 */
adminCheckinRoutes.delete("/test", requireAdmin, async (c) => {
  // 1) Find all synthetic users.
  const stubUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, STUB_EMAIL_PATTERN));
  const stubUserIds = stubUsers.map((u) => u.id);

  if (stubUserIds.length === 0) {
    return c.json(success({ deleted: 0 }));
  }

  // 2) Find all pairs led by a synthetic user.
  const stubPairs = await db
    .select({ id: pairs.id })
    .from(pairs)
    .where(inArray(pairs.userAId, stubUserIds));
  const stubPairIds = stubPairs.map((p) => p.id);

  // 3) Find all checkins for those pairs.
  const stubCheckins = stubPairIds.length
    ? await db
        .select({ id: checkins.id })
        .from(checkins)
        .where(inArray(checkins.entityPairId, stubPairIds))
    : [];
  const stubCheckinIds = stubCheckins.map((ck) => ck.id);

  // 4) Cascade-delete in FK-safe order.
  await db.transaction(async (tx) => {
    if (stubCheckinIds.length) {
      await tx.delete(queueEvents).where(inArray(queueEvents.checkinId, stubCheckinIds));
      await tx.delete(queueEntries).where(inArray(queueEntries.checkinId, stubCheckinIds));
      await tx.delete(runs).where(inArray(runs.checkinId, stubCheckinIds));
      await tx.delete(checkins).where(inArray(checkins.id, stubCheckinIds));
    }
    if (stubPairIds.length) {
      await tx.delete(pairs).where(inArray(pairs.id, stubPairIds));
    }
    await tx.delete(partners).where(inArray(partners.userId, stubUserIds));
    await tx.delete(users).where(inArray(users.id, stubUserIds));
  });

  return c.json(success({ deleted: stubUserIds.length }));
});
