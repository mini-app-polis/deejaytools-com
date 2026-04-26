import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const sessionStatusEnum = pgEnum("session_status", [
  "scheduled",
  "checkin_open",
  "in_progress",
  "completed",
  "cancelled",
]);
export const partnerRoleEnum = pgEnum("partner_role", ["leader", "follower"]);

export const queueTypeEnum = pgEnum("queue_type", ["priority", "non_priority", "active"]);

export const queueEventActionEnum = pgEnum("queue_event_action", [
  "checked_in",
  "promoted_to_active",
  "run_completed",
  "run_incomplete_rotated",
  "withdrawn",
]);

export const initialQueueEnum = pgEnum("initial_queue", ["priority", "non_priority"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const partners = pgTable(
  "partners",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    partnerRole: partnerRoleEnum("partner_role").notNull().default("follower"),
    email: text("email"),
    linkedUserId: text("linked_user_id").references(() => users.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    userIdx: index("idx_partners_user_id").on(t.userId),
    linkedIdx: index("idx_partners_linked_user_id").on(t.linkedUserId),
    emailIdx: index("idx_partners_email").on(t.email),
  })
);

export const pairs = pgTable(
  "pairs",
  {
    id: text("id").primaryKey(),
    userAId: text("user_a_id")
      .notNull()
      .references(() => users.id),
    partnerBId: text("partner_b_id").references(() => partners.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    userPartnerUq: uniqueIndex("uq_pairs_user_partner").on(t.userAId, t.partnerBId),
  })
);

export const songs = pgTable(
  "songs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    partnerId: text("partner_id").references(() => partners.id),
    displayName: text("display_name"),
    originalFilename: text("original_filename"),
    driveFileId: text("drive_file_id"),
    driveFolderId: text("drive_folder_id"),
    processedFilename: text("processed_filename"),
    division: text("division"),
    routineName: text("routine_name"),
    personalDescriptor: text("personal_descriptor"),
    seasonYear: text("season_year"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    songsUserIdx: index("idx_songs_user_id").on(t.userId),
  })
);

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    dateRangeCheck: check("ck_events_date_range", sql`${t.startDate} <= ${t.endDate}`),
  })
);


export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").references(() => events.id),
    name: text("name").notNull(),
    date: text("date"),
    checkinOpensAt: bigint("checkin_opens_at", { mode: "number" }).notNull(),
    floorTrialStartsAt: bigint("floor_trial_starts_at", { mode: "number" }).notNull(),
    floorTrialEndsAt: bigint("floor_trial_ends_at", { mode: "number" }).notNull(),
    activePriorityMax: integer("active_priority_max").notNull().default(6),
    activeNonPriorityMax: integer("active_non_priority_max").notNull().default(4),
    status: sessionStatusEnum("status").notNull().default("scheduled"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    eventIdx: index("idx_sessions_event_id").on(t.eventId),
    activeCapsCheck: check(
      "ck_sessions_active_caps",
      sql`${t.activeNonPriorityMax} <= ${t.activePriorityMax} AND ${t.activePriorityMax} >= 0`
    ),
  })
);

export const sessionDivisions = pgTable(
  "session_divisions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    divisionName: text("division_name").notNull(),
    isPriority: boolean("is_priority").notNull().default(false),
    priorityRunLimit: integer("priority_run_limit").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    sessionDivisionUq: uniqueIndex("uq_session_divisions_session_division").on(
      t.sessionId,
      t.divisionName
    ),
  })
);

export const checkins = pgTable(
  "checkins",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    divisionName: text("division_name").notNull(),
    entityPairId: text("entity_pair_id").references(() => pairs.id, { onDelete: "restrict" }),
    entitySoloUserId: text("entity_solo_user_id").references(() => users.id, { onDelete: "restrict" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "restrict" }),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id),
    initialQueue: initialQueueEnum("initial_queue").notNull(),
    notes: text("notes"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    sessIdx: index("idx_checkins_session_id").on(t.sessionId),
    pairIdx: index("idx_checkins_entity_pair_id").on(t.entityPairId),
    soloIdx: index("idx_checkins_entity_solo_user_id").on(t.entitySoloUserId),
    entityXor: check(
      "ck_checkins_entity_xor",
      sql`(${t.entityPairId} IS NOT NULL AND ${t.entitySoloUserId} IS NULL)
           OR (${t.entityPairId} IS NULL AND ${t.entitySoloUserId} IS NOT NULL)`
    ),
  })
);

export const queueEntries = pgTable(
  "queue_entries",
  {
    id: text("id").primaryKey(),
    checkinId: text("checkin_id")
      .notNull()
      .unique()
      .references(() => checkins.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    entityPairId: text("entity_pair_id").references(() => pairs.id, { onDelete: "restrict" }),
    entitySoloUserId: text("entity_solo_user_id").references(() => users.id, { onDelete: "restrict" }),
    queueType: queueTypeEnum("queue_type").notNull(),
    position: integer("position").notNull(),
    enteredQueueAt: bigint("entered_queue_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    positionUq: uniqueIndex("uq_queue_entries_session_queue_position").on(
      t.sessionId,
      t.queueType,
      t.position
    ),
    pairLiveUq: uniqueIndex("uq_queue_entries_session_pair_live")
      .on(t.sessionId, t.entityPairId)
      .where(sql`${t.entityPairId} IS NOT NULL`),
    soloLiveUq: uniqueIndex("uq_queue_entries_session_solo_live")
      .on(t.sessionId, t.entitySoloUserId)
      .where(sql`${t.entitySoloUserId} IS NOT NULL`),
    sessionIdx: index("idx_queue_entries_session_id").on(t.sessionId),
    entityXor: check(
      "ck_queue_entries_entity_xor",
      sql`(${t.entityPairId} IS NOT NULL AND ${t.entitySoloUserId} IS NULL)
           OR (${t.entityPairId} IS NULL AND ${t.entitySoloUserId} IS NOT NULL)`
    ),
    positionPositive: check("ck_queue_entries_position_positive", sql`${t.position} >= 1`),
  })
);

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    checkinId: text("checkin_id")
      .notNull()
      .unique()
      .references(() => checkins.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    eventId: text("event_id").references(() => events.id),
    divisionName: text("division_name").notNull(),
    entityPairId: text("entity_pair_id").references(() => pairs.id, { onDelete: "restrict" }),
    entitySoloUserId: text("entity_solo_user_id").references(() => users.id, { onDelete: "restrict" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "restrict" }),
    completedAt: bigint("completed_at", { mode: "number" }).notNull(),
    completedByUserId: text("completed_by_user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => ({
    sessIdx: index("idx_runs_session_id").on(t.sessionId),
    eventIdx: index("idx_runs_event_id").on(t.eventId),
    pairDivIdx: index("idx_runs_pair_division").on(t.entityPairId, t.divisionName),
    soloDivIdx: index("idx_runs_solo_division").on(t.entitySoloUserId, t.divisionName),
    entityXor: check(
      "ck_runs_entity_xor",
      sql`(${t.entityPairId} IS NOT NULL AND ${t.entitySoloUserId} IS NULL)
           OR (${t.entityPairId} IS NULL AND ${t.entitySoloUserId} IS NOT NULL)`
    ),
  })
);

export const queueEvents = pgTable(
  "queue_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    checkinId: text("checkin_id").references(() => checkins.id),
    action: queueEventActionEnum("action").notNull(),
    fromQueue: queueTypeEnum("from_queue"),
    fromPosition: integer("from_position"),
    toQueue: queueTypeEnum("to_queue"),
    toPosition: integer("to_position"),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    sessTimeIdx: index("idx_queue_events_session_created").on(t.sessionId, t.createdAt),
  })
);

export const eventDivisionRunLimits = pgTable(
  "event_division_run_limits",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    divisionName: text("division_name").notNull(),
    priorityRunLimit: integer("priority_run_limit").notNull(),
  },
  (t) => ({
    pk: uniqueIndex("uq_event_division_run_limits_pk").on(t.eventId, t.divisionName),
  })
);
