import { z } from "zod";

export const DivisionSchema = z.enum([
  "Newcomer",
  "Novice",
  "Intermediate",
  "Advanced",
  "All-Star",
  "Champion",
  "Invitational",
  "Other",
]);

export const SessionStatusSchema = z.enum([
  "scheduled",
  "checkin_open",
  "in_progress",
  "completed",
  "cancelled",
]);

export const CheckinStatusSchema = z.enum([
  "waiting",
  "on_deck",
  "running",
  "completed",
  "withdrawn",
]);

export const QueueTypeSchema = z.enum(["priority", "non_priority", "active"]);

export const createCheckinBodySchema = z
  .object({
    sessionId: z.string().min(1),
    divisionName: z.string().min(1),
    entityPairId: z.string().nullish(),
    entitySoloUserId: z.string().nullish(),
    songId: z.string().min(1),
    notes: z.string().nullish(),
    eventRegistrationId: z.string().nullish(),
  })
  .refine(
    (b) => Boolean(b.entityPairId) !== Boolean(b.entitySoloUserId),
    { message: "Exactly one of entityPairId / entitySoloUserId" }
  );

export const EventStatusSchema = z.enum([
  "upcoming",
  "active",
  "completed",
  "cancelled",
]);

export const PartnerRoleSchema = z.enum(["leader", "follower"]);
export type PartnerRole = z.infer<typeof PartnerRoleSchema>;

// ---------------------------------------------------------------------------
// API response types — canonical shapes returned by the Hono API routes.
// Frontend pages and hooks should import from here instead of defining local
// copies, so the compiler flags any drift between API and UI.
// ---------------------------------------------------------------------------

export type ApiEvent = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  timezone: string;
  status: string;
  created_by: string;
  created_at: number;
  updated_at: number;
};

export type ApiSessionDivision = {
  id: string;
  division_name: string;
  is_priority: boolean;
  sort_order: number;
  priority_run_limit: number | null;
};

export type ApiSession = {
  id: string;
  event_id: string | null;
  event_timezone: string | null;
  name: string;
  date: string | null;
  status: string;
  checkin_opens_at: number;
  floor_trial_starts_at: number;
  floor_trial_ends_at: number;
  active_priority_max: number;
  active_non_priority_max: number;
  created_by: string;
  created_at: number;
  /**
   * Populated on GET /v1/sessions/:id (detail endpoint) but not on the list.
   * The name of the parent event, if any.
   */
  event_name?: string | null;
  /**
   * Populated on GET /v1/sessions/:id only. The division the current user's
   * active check-in is in, if they have one for this session.
   */
  active_checkin_division?: string;
  divisions?: ApiSessionDivision[];
  queue_depth?: { priority: number; non_priority: number; active: number };
  has_active_checkin?: boolean;
};

export type ApiQueueEntry = {
  queueEntryId: string;
  checkinId: string;
  position: number;
  enteredQueueAt: number;
  entityPairId: string | null;
  entitySoloUserId: string | null;
  entityLabel: string;
  divisionName: string;
  songId: string | null;
  notes: string | null;
  initialQueue: string;
  checkedInAt: number;
  subQueue?: "priority" | "non_priority";
};

export type ApiSong = {
  id: string;
  user_id: string;
  partner_id: string | null;
  display_name: string | null;
  original_filename: string | null;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  processed_filename: string | null;
  division: string | null;
  routine_name: string | null;
  personal_descriptor: string | null;
  season_year: string | null;
  created_at: number;
  updated_at: number;
  partner_first_name?: string | null;
  partner_last_name?: string | null;
};

export type ApiPartner = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export type ApiLeadingPair = {
  id: string;
  partner_b_id: string | null;
  display_name: string;
};

export type ApiRun = {
  id: string;
  completed_at: number;
  division_name: string;
  session_id: string;
  session_floor_trial_starts_at: number | null;
  event_id: string | null;
  event_name: string | null;
  song_id: string;
  song_label: string;
  entity_label: string;
  completed_by_label: string;
};

export type ApiAdminUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: "user" | "admin";
  created_at: number;
};

/** Shape returned by GET /v1/admin/test-injections (admin-checkins list). */
export type ApiTestInjection = {
  pair_id: string;
  created_at: number;
  leader_name: string;
  follower_name: string | null;
  session_id: string | null;
  session_name: string | null;
  division_name: string | null;
  queue_status: "active" | "priority" | "non_priority" | "off_queue";
  position: number | null;
};

export type ApiAuthMe = {
  id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  created_at: number;
  updated_at: number;
};

export type ApiLegacySong = {
  id: string;
  partnership: string;
  division: string | null;
  routine_name: string | null;
  descriptor: string | null;
  version: string | null;
  submitted_at: string | null;
};
