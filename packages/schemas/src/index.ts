import { z } from "zod";

// ---------------------------------------------------------------------------
// Domain enums (used in request bodies / shared across API + frontend)
// ---------------------------------------------------------------------------

/**
 * Master list of competition divisions. This is the single source of truth
 * used across the admin panel, the upload form, and any future consumers.
 * "My Division Is Not Listed" is a UI-only escape hatch — it is not included
 * here so consumers that need it can append it themselves.
 */
export const DIVISIONS = [
  "Classic",
  "Showcase",
  "Rising Star Classic",
  "Rising Star Showcase",
  "Sophisticated",
  "Masters",
  "Teams",
  "ProAm LeaderAm",
  "ProAm FollowerAm",
  "NovInt Routines",
  "Juniors",
  "Young Adult",
  "Exhibition",
  "Superstar",
  "Cabaret",
  "Carolina Shag Divisions",
  "My Division Is Not Listed",
] as const;

export type Division = (typeof DIVISIONS)[number];

export const SessionStatusSchema = z.enum([
  "scheduled",
  "checkin_open",
  "in_progress",
  "completed",
  "cancelled",
]);

export const createCheckinBodySchema = z
  .object({
    sessionId: z.string().min(1),
    divisionName: z.string().min(1),
    entityPairId: z.string().nullish(),
    entitySoloUserId: z.string().nullish(),
    entityManagedPartnershipId: z.string().nullish(),
    songId: z.string().min(1),
    notes: z.string().nullish(),
  })
  .refine(
    (b) =>
      [b.entityPairId, b.entitySoloUserId, b.entityManagedPartnershipId].filter(Boolean).length ===
      1,
    {
      message:
        "Exactly one of entityPairId / entitySoloUserId / entityManagedPartnershipId must be provided",
    }
  );

export const PartnerRoleSchema = z.enum(["leader", "follower"]);
export type PartnerRole = z.infer<typeof PartnerRoleSchema>;

// ---------------------------------------------------------------------------
// API response schemas — Zod validators for every GET endpoint payload.
//
// TypeScript types are derived via z.infer so there is a single source of
// truth: the Zod schema drives both compile-time checking and runtime
// validation in contract tests.
// ---------------------------------------------------------------------------

export const ApiEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  timezone: z.string(),
  status: z.string(),
  created_by: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
});
export type ApiEvent = z.infer<typeof ApiEventSchema>;

export const ApiSessionDivisionSchema = z.object({
  id: z.string(),
  division_name: z.string(),
  is_priority: z.boolean(),
  sort_order: z.number(),
  priority_run_limit: z.number().nullable(),
});
export type ApiSessionDivision = z.infer<typeof ApiSessionDivisionSchema>;

export const ApiSessionSchema = z.object({
  id: z.string(),
  event_id: z.string().nullable(),
  name: z.string(),
  date: z.string().nullable(),
  checkin_opens_at: z.number(),
  floor_trial_starts_at: z.number(),
  floor_trial_ends_at: z.number(),
  active_priority_max: z.number(),
  active_non_priority_max: z.number(),
  status: z.string(),
  created_by: z.string(),
  created_at: z.number(),
  // Optional fields — present on GET /v1/sessions (list) and GET /v1/sessions/:id (detail)
  event_timezone: z.string().nullable().optional(),
  // Detail-endpoint-only fields
  event_name: z.string().nullable().optional(),
  active_checkin_division: z.string().optional(),
  divisions: z.array(ApiSessionDivisionSchema).optional(),
  queue_depth: z
    .object({ priority: z.number(), non_priority: z.number(), active: z.number() })
    .optional(),
  has_active_checkin: z.boolean().optional(),
});
export type ApiSession = z.infer<typeof ApiSessionSchema>;

export const ApiQueueEntrySchema = z.object({
  queueEntryId: z.string(),
  checkinId: z.string(),
  position: z.number(),
  enteredQueueAt: z.number(),
  entityPairId: z.string().nullable(),
  entitySoloUserId: z.string().nullable(),
  entityLabel: z.string(),
  divisionName: z.string(),
  songId: z.string().nullable(),
  songDisplayName: z.string().nullable().optional(),
  songProcessedFilename: z.string().nullable().optional(),
  notes: z.string().nullable(),
  initialQueue: z.string(),
  checkedInAt: z.number(),
  /** Present on /waiting — distinguishes priority vs non-priority entries. */
  subQueue: z.enum(["priority", "non_priority"]).optional(),
});
export type ApiQueueEntry = z.infer<typeof ApiQueueEntrySchema>;

export const ApiMyCheckinSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  eventName: z.string().nullable(),
  sessionName: z.string(),
  sessionFloorTrialStartsAt: z.number(),
  sessionStatus: z.string(),
  eventTimezone: z.string().nullable(),
  divisionName: z.string(),
  entityLabel: z.string(),
  songDisplayName: z.string().nullable(),
  songProcessedFilename: z.string().nullable(),
  notes: z.string().nullable(),
  checkedInAt: z.number(),
  queueEntryId: z.string(),
  queueType: z.string(),
  queuePosition: z.number(),
  overallPosition: z.number(),
  runCount: z.number().optional().default(0),
});
export type ApiMyCheckin = z.infer<typeof ApiMyCheckinSchema>;

export const ApiSongSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  partner_id: z.string().nullable(),
  display_name: z.string().nullable(),
  original_filename: z.string().nullable(),
  drive_file_id: z.string().nullable(),
  drive_folder_id: z.string().nullable(),
  processed_filename: z.string().nullable(),
  division: z.string().nullable(),
  routine_name: z.string().nullable(),
  personal_descriptor: z.string().nullable(),
  season_year: z.string().nullable(),
  /**
   * True when this row was created via the legacy-claim flow rather than an
   * audio upload. Legacy rows are metadata-only (no Drive file, no playable
   * audio) and the UI surfaces them differently so users/admins aren't
   * misled into expecting playback.
   */
  is_legacy: z.boolean(),
  created_at: z.number(),
  updated_at: z.number(),
  partner_first_name: z.string().nullable().optional(),
  partner_last_name: z.string().nullable().optional(),
});
export type ApiSong = z.infer<typeof ApiSongSchema>;

export const ApiPartnerSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  first_name: z.string(),
  last_name: z.string(),
  partner_role: z.string(),
  email: z.string().nullable(),
  linked_user_id: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
  display_name: z.string(),
});
export type ApiPartner = z.infer<typeof ApiPartnerSchema>;

export const ApiLeadingPairSchema = z.object({
  id: z.string(),
  partner_b_id: z.string().nullable(),
  display_name: z.string(),
});
export type ApiLeadingPair = z.infer<typeof ApiLeadingPairSchema>;

export const ApiRunSchema = z.object({
  id: z.string(),
  completed_at: z.number(),
  division_name: z.string(),
  session_id: z.string(),
  session_floor_trial_starts_at: z.number().nullable(),
  event_id: z.string().nullable(),
  event_name: z.string().nullable(),
  song_id: z.string(),
  song_label: z.string(),
  entity_label: z.string(),
  completed_by_label: z.string(),
});
export type ApiRun = z.infer<typeof ApiRunSchema>;

export const ApiAdminSongOwnerSchema = z.object({
  id: z.string(),
  email: z.string(),
  full_name: z.string().nullable(),
});

export const ApiAdminSongPartnerSchema = z.object({
  id: z.string(),
  full_name: z.string().nullable(),
  /** Set when the partner has been claimed by a real DeejayTools account. */
  linked_user_email: z.string().nullable(),
});

export const ApiAdminSongSchema = z.object({
  id: z.string(),
  /** Pre-rendered "Partnership Division Year Routine v##" display label. */
  song_label: z.string(),
  display_name: z.string().nullable(),
  division: z.string().nullable(),
  routine_name: z.string().nullable(),
  /** Free-text per-song descriptor the uploader chose (e.g. "98%", "v3"). */
  personal_descriptor: z.string().nullable(),
  season_year: z.string().nullable(),
  /**
   * True when this row was claimed from the legacy catalog rather than
   * uploaded as audio. Legacy rows have no Drive file and live only as
   * metadata, so the admin UI flags them visually to avoid confusion
   * with real uploads.
   */
  is_legacy: z.boolean(),
  created_at: z.number(),
  /** Epoch ms when soft-deleted, or null for live rows. */
  deleted_at: z.number().nullable(),
  /** Primary owner — the user who uploaded the file. */
  owner: ApiAdminSongOwnerSchema,
  /** Secondary owner — the partner record, if any. */
  partner: ApiAdminSongPartnerSchema.nullable(),
});
export type ApiAdminSong = z.infer<typeof ApiAdminSongSchema>;

export const ApiAdminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  role: z.enum(["user", "admin"]),
  created_at: z.number(),
  /** Total songs uploaded by this user. */
  song_count: z.number(),
  /** Total partner records owned by this user. */
  partner_count: z.number(),
});
export type ApiAdminUser = z.infer<typeof ApiAdminUserSchema>;

/** Shape returned by GET /v1/admin/checkins/test */
export const ApiTestInjectionSchema = z.object({
  pair_id: z.string(),
  created_at: z.number(),
  leader_name: z.string(),
  follower_name: z.string().nullable(),
  session_id: z.string().nullable(),
  session_name: z.string().nullable(),
  division_name: z.string().nullable(),
  queue_status: z.enum(["active", "priority", "non_priority", "off_queue"]),
  position: z.number().nullable(),
});
export type ApiTestInjection = z.infer<typeof ApiTestInjectionSchema>;

export const ApiAuthMeSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  role: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
});
export type ApiAuthMe = z.infer<typeof ApiAuthMeSchema>;

export const ApiLegacySongSchema = z.object({
  id: z.string(),
  partnership: z.string(),
  division: z.string().nullable(),
  routine_name: z.string().nullable(),
  descriptor: z.string().nullable(),
  version: z.string().nullable(),
  submitted_at: z.string().nullable(),
});
export type ApiLegacySong = z.infer<typeof ApiLegacySongSchema>;

export const ApiTeamSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  identifier: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
});
export type ApiTeam = z.infer<typeof ApiTeamSchema>;

export const teamIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9 ]+$/, "Team name may only contain letters, numbers, and spaces")
  .min(1)
  .max(100);

export const createTeamBodySchema = z.object({
  identifier: teamIdentifierSchema,
});

export const ApiManagedPartnershipSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  leader_first_name: z.string(),
  leader_last_name: z.string(),
  follower_first_name: z.string(),
  follower_last_name: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
});
export type ApiManagedPartnership = z.infer<typeof ApiManagedPartnershipSchema>;

export const createManagedPartnershipBodySchema = z.object({
  leader_first_name: z.string().trim().min(1).max(100),
  leader_last_name: z.string().trim().min(1).max(100),
  follower_first_name: z.string().trim().min(1).max(100),
  follower_last_name: z.string().trim().min(1).max(100),
});

export const ApiEventSongSubmissionSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  event_name: z.string(),
  event_start_date: z.string(),
  event_status: z.string(),
  song_id: z.string(),
  song_label: z.string(),
  division: z.string().nullable(),
  created_at: z.number(),
});
export type ApiEventSongSubmission = z.infer<typeof ApiEventSongSubmissionSchema>;

export const createEventSongSubmissionBodySchema = z.object({
  event_id: z.string().min(1),
  song_id: z.string().min(1),
});

/**
 * Admin-facing joined row for event song submissions (cross-user).
 * Future query: event_song_submissions → songs (division + partnership) → events.
 */
export const ApiAdminEventSongSubmissionSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  event_name: z.string(),
  division: z.string().nullable(),
  song_id: z.string(),
  song_label: z.string(),
  partnership_label: z.string(),
  submitter_email: z.string(),
  created_at: z.number(),
});
export type ApiAdminEventSongSubmission = z.infer<typeof ApiAdminEventSongSubmissionSchema>;
