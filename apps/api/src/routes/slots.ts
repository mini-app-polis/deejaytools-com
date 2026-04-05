import { CommonErrors, error, success, successList } from "common-typescript-utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { checkins, floorSlots, sessions } from "../db/schema.js";
import { loadPairDisplayNames } from "../lib/pair-display.js";
import { requireAdmin } from "../middleware/auth.js";

const listQuery = z.object({
  session_id: z.string().min(1, "session_id is required"),
});

const fillBody = z.object({
  session_id: z.string().min(1),
});

const clearQuery = z.object({
  session_id: z.string().min(1, "session_id is required"),
});

const slotNumberParam = z.object({
  slot_number: z.coerce.number().int().positive(),
});

const clearBody = z.object({
  withdraw_checkin: z.boolean().optional(),
});

export const slotRoutes = new Hono();

type SlotRow = {
  id: string;
  session_id: string;
  slot_number: number;
  checkin_id: string | null;
  assigned_at: number;
};

type SlotEnriched = SlotRow & {
  pair_display_name?: string;
  division?: string;
  queue_type?: string;
  song_id?: string | null;
};

function mapSlotRow(
  slot: {
    id: string;
    sessionId: string;
    slotNumber: number;
    checkinId: string | null;
    assignedAt: number;
  },
  checkin:
    | {
        pairId: string;
        division: string;
        queueType: string;
        songId: string | null;
      }
    | undefined,
  displays: Map<string, string>
): SlotEnriched {
  const base: SlotRow = {
    id: slot.id,
    session_id: slot.sessionId,
    slot_number: slot.slotNumber,
    checkin_id: slot.checkinId,
    assigned_at: slot.assignedAt,
  };
  if (!slot.checkinId || !checkin) {
    return base;
  }
  return {
    ...base,
    pair_display_name: displays.get(checkin.pairId) ?? "— / —",
    division: checkin.division,
    queue_type: checkin.queueType,
    song_id: checkin.songId,
  };
}

slotRoutes.get("/", zValidator("query", listQuery), async (c) => {
  const { session_id } = c.req.valid("query");

  const rows = await db
    .select({
      id: floorSlots.id,
      sessionId: floorSlots.sessionId,
      slotNumber: floorSlots.slotNumber,
      checkinId: floorSlots.checkinId,
      assignedAt: floorSlots.assignedAt,
      pairId: checkins.pairId,
      division: checkins.division,
      queueType: checkins.queueType,
      songId: checkins.songId,
    })
    .from(floorSlots)
    .leftJoin(checkins, eq(checkins.id, floorSlots.checkinId))
    .where(eq(floorSlots.sessionId, session_id))
    .orderBy(asc(floorSlots.slotNumber));

  const pairIds = rows
    .filter((r) => r.checkinId && r.pairId)
    .map((r) => r.pairId as string);
  const displays = await loadPairDisplayNames(pairIds);

  const results = rows.map((r) =>
    mapSlotRow(
      {
        id: r.id,
        sessionId: r.sessionId,
        slotNumber: r.slotNumber,
        checkinId: r.checkinId,
        assignedAt: r.assignedAt,
      },
      r.checkinId && r.pairId
        ? {
            pairId: r.pairId,
            division: r.division!,
            queueType: r.queueType!,
            songId: r.songId,
          }
        : undefined,
      displays
    )
  );

  return c.json(successList(results));
});

slotRoutes.post("/fill", requireAdmin, zValidator("json", fillBody), async (c) => {
  const { session_id } = c.req.valid("json");

  const [session] = await db.select().from(sessions).where(eq(sessions.id, session_id)).limit(1);
  if (!session) {
    return c.json(CommonErrors.notFound("Session"), 404);
  }
  if (session.status !== "in_progress") {
    return c.json(
      error(
        "SESSION_NOT_IN_PROGRESS",
        "Fill is only allowed while the session is in_progress."
      ),
      409
    );
  }

  const [emptySlot] = await db
    .select({
      id: floorSlots.id,
      sessionId: floorSlots.sessionId,
      slotNumber: floorSlots.slotNumber,
      checkinId: floorSlots.checkinId,
      assignedAt: floorSlots.assignedAt,
    })
    .from(floorSlots)
    .where(and(eq(floorSlots.sessionId, session_id), isNull(floorSlots.checkinId)))
    .orderBy(asc(floorSlots.slotNumber))
    .limit(1);

  if (!emptySlot) {
    return c.json(
      error("NO_EMPTY_SLOTS", "All floor slots already have a check-in assigned."),
      409
    );
  }

  const [nextCheckin] = await db
    .select({
      id: checkins.id,
      pairId: checkins.pairId,
      division: checkins.division,
      queueType: checkins.queueType,
      songId: checkins.songId,
    })
    .from(checkins)
    .where(and(eq(checkins.sessionId, session_id), eq(checkins.status, "waiting")))
    .orderBy(
      sql`(CASE WHEN ${checkins.queueType}::text = 'priority' THEN 0 ELSE 1 END)`,
      asc(checkins.queuePosition)
    )
    .limit(1);

  if (!nextCheckin) {
    return c.json(
      error("NO_CHECKINS_WAITING", "No waiting check-ins available to assign to a slot."),
      409
    );
  }

  const now = Date.now();

  await db.transaction(async (tx) => {
    await tx
      .update(floorSlots)
      .set({ checkinId: nextCheckin.id, assignedAt: now })
      .where(eq(floorSlots.id, emptySlot.id));
    await tx
      .update(checkins)
      .set({ status: "on_deck" })
      .where(eq(checkins.id, nextCheckin.id));
  });

  const [filled] = await db
    .select({
      id: floorSlots.id,
      sessionId: floorSlots.sessionId,
      slotNumber: floorSlots.slotNumber,
      checkinId: floorSlots.checkinId,
      assignedAt: floorSlots.assignedAt,
      pairId: checkins.pairId,
      division: checkins.division,
      queueType: checkins.queueType,
      songId: checkins.songId,
    })
    .from(floorSlots)
    .leftJoin(checkins, eq(checkins.id, floorSlots.checkinId))
    .where(eq(floorSlots.id, emptySlot.id))
    .limit(1);

  const displays = await loadPairDisplayNames(
    filled?.pairId ? [filled.pairId] : []
  );

  const payload = mapSlotRow(
    {
      id: filled!.id,
      sessionId: filled!.sessionId,
      slotNumber: filled!.slotNumber,
      checkinId: filled!.checkinId,
      assignedAt: filled!.assignedAt,
    },
    filled?.checkinId && filled.pairId
      ? {
          pairId: filled.pairId,
          division: filled.division!,
          queueType: filled.queueType!,
          songId: filled.songId,
        }
      : undefined,
    displays
  );

  return c.json(success(payload));
});

slotRoutes.patch(
  "/:slot_number/clear",
  requireAdmin,
  zValidator("query", clearQuery),
  zValidator("param", slotNumberParam),
  async (c) => {
    const { session_id } = c.req.valid("query");
    const { slot_number } = c.req.valid("param");
    let json: unknown = {};
    try {
      json = await c.req.json();
    } catch {
      /* no body */
    }
    const parsed = clearBody.safeParse(json);
    if (!parsed.success) {
      return c.json(CommonErrors.validationError(parsed.error.issues), 400);
    }
    const withdrawCheckin = parsed.data.withdraw_checkin === true;

    const [slotRow] = await db
      .select({
        id: floorSlots.id,
        sessionId: floorSlots.sessionId,
        slotNumber: floorSlots.slotNumber,
        checkinId: floorSlots.checkinId,
        assignedAt: floorSlots.assignedAt,
      })
      .from(floorSlots)
      .where(
        and(eq(floorSlots.sessionId, session_id), eq(floorSlots.slotNumber, slot_number))
      )
      .limit(1);

    if (!slotRow) {
      return c.json(CommonErrors.notFound("Slot"), 404);
    }

    if (!slotRow.checkinId) {
      return c.json(error("SLOT_ALREADY_EMPTY", "This slot does not have a check-in assigned."), 409);
    }

    const [chk] = await db
      .select()
      .from(checkins)
      .where(eq(checkins.id, slotRow.checkinId))
      .limit(1);

    if (!chk) {
      await db.transaction(async (tx) => {
        await tx
          .update(floorSlots)
          .set({ checkinId: null })
          .where(eq(floorSlots.id, slotRow.id));
      });
      const displays = new Map<string, string>();
      return c.json(
        success(
          mapSlotRow(
            {
              id: slotRow.id,
              sessionId: slotRow.sessionId,
              slotNumber: slotRow.slotNumber,
              checkinId: null,
              assignedAt: slotRow.assignedAt,
            },
            undefined,
            displays
          )
        )
      );
    }

    await db.transaction(async (tx) => {
      if (withdrawCheckin) {
        await tx
          .update(checkins)
          .set({ status: "withdrawn" })
          .where(eq(checkins.id, chk.id));
      } else {
        const [maxRow] = await tx
          .select({ mx: max(checkins.queuePosition) })
          .from(checkins)
          .where(
            and(eq(checkins.sessionId, session_id), eq(checkins.queueType, chk.queueType))
          );
        const nextPos = (maxRow?.mx ?? 0) + 1;
        await tx
          .update(checkins)
          .set({ status: "waiting", queuePosition: nextPos })
          .where(eq(checkins.id, chk.id));
      }
      await tx
        .update(floorSlots)
        .set({ checkinId: null })
        .where(eq(floorSlots.id, slotRow.id));
    });

    const [cleared] = await db
      .select({
        id: floorSlots.id,
        sessionId: floorSlots.sessionId,
        slotNumber: floorSlots.slotNumber,
        checkinId: floorSlots.checkinId,
        assignedAt: floorSlots.assignedAt,
      })
      .from(floorSlots)
      .where(eq(floorSlots.id, slotRow.id))
      .limit(1);

    const displays = new Map<string, string>();
    return c.json(
      success(
        mapSlotRow(
          {
            id: cleared!.id,
            sessionId: cleared!.sessionId,
            slotNumber: cleared!.slotNumber,
            checkinId: cleared!.checkinId,
            assignedAt: cleared!.assignedAt,
          },
          undefined,
          displays
        )
      )
    );
  }
);
