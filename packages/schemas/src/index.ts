import { z } from "zod";

// ---------------------------------------------------------------------------
// Domain enums (used in request bodies / shared across API + frontend)
// ---------------------------------------------------------------------------

/**
 * Divisions in display order, grouped by how competitors think about them.
 *
 * This is the source of truth for both order and grouping — DIVISIONS is
 * derived from it, so a division added to a group automatically appears in
 * every list and the two can never disagree.
 *
 * Pills render one row per group. Dropdowns and checkbox lists use the flat
 * DIVISIONS order and ignore the grouping.
 */
export const DIVISION_GROUPS = [
  ["Classic", "Showcase", "Rising Star Classic", "Rising Star Showcase"],
  ["ProAm LeaderAm", "ProAm FollowerAm", "NovInt Routines"],
  ["Sophisticated", "Masters", "Juniors", "Young Adult"],
  ["Exhibition", "Superstar"],
  ["Carolina Shag Divisions"],
  ["Teams", "Cabaret"],
  ["My Division Is Not Listed"],
] as const;

export type Division = (typeof DIVISION_GROUPS)[number][number];

export const DIVISIONS: readonly Division[] = DIVISION_GROUPS.flat();

/**
 * Divisions where the entity is ordered amateur-first rather than
 * leader-first, because the pairing is a pro with an amateur and the amateur
 * is the competitor being scored.
 *
 * "ProAm LeaderAm" needs no reordering — the leader IS the amateur, so the
 * default leader-first order is already amateur-first. Only "ProAm FollowerAm"
 * inverts.
 */
export function isFollowerAmDivision(division: string | null | undefined): boolean {
  return division?.trim() === "ProAm FollowerAm";
}

/**
 * Stable identifier for the competing entity a song belongs to.
 *
 * Precedence mirrors how the entity is built for filenames: a managed
 * partnership names itself, otherwise the partner record defines the pairing,
 * otherwise the song is a solo entry owned by the uploader.
 *
 * Prefixed by source table so ids from different tables can never collide —
 * without the prefix a partner id equal to a user id would silently merge two
 * unrelated entities.
 *
 * Keyed by id rather than by resolved name: two partner records describing the
 * same real-world couple are treated as different entities. That is deliberate
 * — matching on names breaks on spelling variants, middle names and typos.
 */
export function songEntityKey(song: {
  userId: string;
  partnerId?: string | null;
  managedPartnershipId?: string | null;
}): string {
  if (song.managedPartnershipId) return `mp:${song.managedPartnershipId}`;
  if (song.partnerId) return `pt:${song.partnerId}`;
  return `us:${song.userId}`;
}

/**
 * Key for the one-song-per-entity-per-division slot within an event.
 *
 * A null division groups all of an entity's division-less songs into a single
 * slot. That is intentional: an entry with no division stated is still one
 * entry.
 */
export function entitySlotKey(entityKey: string, division: string | null | undefined): string {
  return `${entityKey}::${division?.trim() ?? ""}`;
}

export const SUBMISSION_ROUNDS = ["prelims_and_finals", "prelims_only", "finals_only"] as const;
export type SubmissionRound = (typeof SUBMISSION_ROUNDS)[number];

/** The only division where a prelims/finals split is offered. */
export const ROUND_SPLIT_DIVISION = "Classic";

/**
 * Rounds a submission occupies. A song entered for both rounds fills both
 * slots, so nothing else can be added for that entity and division.
 */
export function roundsOccupied(round: SubmissionRound): readonly ("prelims" | "finals")[] {
  switch (round) {
    case "prelims_only":
      return ["prelims"];
    case "finals_only":
      return ["finals"];
    case "prelims_and_finals":
      return ["prelims", "finals"];
  }
}

/**
 * Can two submissions for the same entity and division coexist?
 *
 * Only when their occupied rounds are disjoint — in practice a
 * prelims_only paired with a finals_only. Every other combination overlaps.
 */
export function roundsConflict(a: SubmissionRound, b: SubmissionRound): boolean {
  const bOccupied = new Set(roundsOccupied(b));
  return roundsOccupied(a).some((r) => bOccupied.has(r));
}

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
    on_behalf_of_user_id: z.string().trim().nullish(),
    songId: z.string().min(1),
    notes: z.string().nullish(),
  })
  .refine(
    (b) => {
      const entityCount = [b.entityPairId, b.entitySoloUserId, b.entityManagedPartnershipId].filter(
        Boolean
      ).length;
      // On-behalf check-ins let the server derive the entity from the song.
      if (b.on_behalf_of_user_id) return entityCount === 0;
      return entityCount === 1;
    },
    { message: "Exactly one entity must be provided (or none when checking in on behalf)" }
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

// ---------------------------------------------------------------------------
// "The Open" — dedicated submission path
// ---------------------------------------------------------------------------

/** Display name used in copy that points people at the dedicated Open page. */
export const OPEN_EVENT_LABEL = "The Open";

/**
 * Does this event name refer to "The Open"?
 *
 * The Open never accepts songs through the generic event-submissions page —
 * it routes to its own dedicated submission page instead, and its submissions
 * take a distinct Drive filename convention. Every consumer that needs to make
 * that distinction goes through this one predicate, so the rule lives in
 * exactly one place.
 *
 * The name is lowercased and stripped of everything that is not a letter or
 * digit, then must START WITH "theopen". That covers "The Open", "theopen",
 * "THE OPEN 2026", "The-Open", and "The Open - Swing Dance Championships".
 *
 * Two deliberate choices:
 *
 * - A bare leading "Open" does NOT match. It used to, which meant an unrelated
 *   "Open Practice Night" was rerouted to the Open submission page.
 * - startsWith, not includes. Normalization removes spaces, so `includes`
 *   matches across word boundaries — "Breathe Open Air" becomes
 *   "breatheopenair", which contains "theopen".
 *
 * Cost of this being strict: a name that leads with something else, like
 * "2026 The Open", will not match. Rename the event or widen this predicate.
 */
export function isOpenEvent(eventName: string | null | undefined): boolean {
  if (!eventName) return false;
  const normalized = eventName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.startsWith("theopen");
}

export const ApiEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  timezone: z.string(),
  season_year: z.string(),
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
  entityManagedPartnershipId: z.string().nullable().optional(),
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
  /** 'partner' for real partners; 'solo' | 'team' | 'other' for portal placeholders. */
  partner_kind: z.string().nullable().optional(),
  managed_partnership_id: z.string().nullable().optional(),
  managed_leader_first_name: z.string().nullable().optional(),
  managed_leader_last_name: z.string().nullable().optional(),
  managed_follower_first_name: z.string().nullable().optional(),
  managed_follower_last_name: z.string().nullable().optional(),
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
  entity_key: z.string(),
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
  /** Effective division for this submission (stored override or the song's). */
  division: z.string().nullable(),
  round: z.enum(SUBMISSION_ROUNDS),
  created_at: z.number(),
});
export type ApiEventSongSubmission = z.infer<typeof ApiEventSongSubmissionSchema>;

export const createEventSongSubmissionBodySchema = z.object({
  event_id: z.string().min(1),
  song_id: z.string().min(1),
  /**
   * Overrides the song's own division for this event only. Defaults to the
   * song's. Constrained to the known list: an arbitrary string here would
   * bypass the one-song-per-division rule (a differently-cased or
   * whitespace-padded value compares unequal) and create a stray Drive folder.
   */
  division: z.enum(DIVISIONS as unknown as [Division, ...Division[]]).optional(),
  /** Classic on The Open only; rejected elsewhere. Defaults to prelims_and_finals. */
  round: z.enum(SUBMISSION_ROUNDS).optional(),
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

/**
 * One competing entity that has at least one song submitted to an event.
 *
 * Deliberately carries no song identity — no title, filename, routine name or
 * song id. The event page shows who is entered and in which divisions; what
 * they are dancing to stays private until the floor.
 */
export const ApiEventEntitySchema = z.object({
  /** Stable per-entity key from `songEntityKey` — `mp:` / `pt:` / `us:` prefixed. */
  entity_key: z.string(),
  label: z.string(),
  /** Distinct effective divisions, in DIVISIONS display order. */
  divisions: z.array(z.string()),
});
export type ApiEventEntity = z.infer<typeof ApiEventEntitySchema>;
