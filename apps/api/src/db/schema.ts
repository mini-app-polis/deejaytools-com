import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const eventStatusEnum = pgEnum("event_status", [
  "upcoming",
  "active",
  "completed",
  "cancelled",
]);
export const sessionStatusEnum = pgEnum("session_status", [
  "scheduled",
  "checkin_open",
  "in_progress",
  "completed",
  "cancelled",
]);
export const checkinStatusEnum = pgEnum("checkin_status", [
  "waiting",
  "on_deck",
  "running",
  "completed",
  "withdrawn",
]);
export const queueTypeEnum = pgEnum("queue_type", ["priority", "standard"]);
export const partnerRoleEnum = pgEnum("partner_role", ["leader", "follower"]);

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

export const songs = pgTable("songs", {
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
}, (t) => ({
  songsUserIdx: index("idx_songs_user_id").on(t.userId),
}));

export const events = pgTable("events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  date: text("date"),
  status: eventStatusEnum("status").notNull().default("upcoming"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    partnerId: text("partner_id").references(() => partners.id),
    songId: text("song_id").references(() => songs.id),
    division: text("division").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    evIdx: index("idx_event_registrations_event_id").on(t.eventId),
    usrIdx: index("idx_event_registrations_user_id").on(t.userId),
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
    maxSlots: integer("max_slots").notNull().default(7),
    maxPriorityRuns: integer("max_priority_runs").notNull().default(3),
    status: sessionStatusEnum("status").notNull().default("scheduled"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    eventIdx: index("idx_sessions_event_id").on(t.eventId),
  })
);

export const sessionDivisions = pgTable("session_divisions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  divisionName: text("division_name").notNull(),
  isPriority: boolean("is_priority").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const checkins = pgTable(
  "checkins",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    eventRegistrationId: text("event_registration_id").references(
      () => eventRegistrations.id
    ),
    pairId: text("pair_id")
      .notNull()
      .references(() => pairs.id),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id),
    songId: text("song_id").references(() => songs.id),
    division: text("division").notNull().default("Other"),
    queueType: queueTypeEnum("queue_type").notNull(),
    queuePosition: integer("queue_position").notNull(),
    status: checkinStatusEnum("status").notNull().default("waiting"),
    checkedInAt: bigint("checked_in_at", { mode: "number" }).notNull(),
    lastRunAt: bigint("last_run_at", { mode: "number" }),
  },
  (t) => ({
    sessIdx: index("idx_checkins_session_id").on(t.sessionId),
    pairIdx: index("idx_checkins_pair_id").on(t.pairId),
    subIdx: index("idx_checkins_submitted_by").on(t.submittedByUserId),
    activePairUq: uniqueIndex("idx_checkins_unique_active")
      .on(t.sessionId, t.pairId)
      .where(sql`${t.status} IN ('waiting', 'on_deck', 'running')`),
  })
);

export const floorSlots = pgTable(
  "floor_slots",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    slotNumber: integer("slot_number").notNull(),
    checkinId: text("checkin_id").references(() => checkins.id),
    assignedAt: bigint("assigned_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    slotUq: uniqueIndex("uq_floor_slots_session_slot").on(t.sessionId, t.slotNumber),
    fsSessIdx: index("idx_floor_slots_session_id").on(t.sessionId),
  })
);
