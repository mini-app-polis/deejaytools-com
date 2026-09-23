import type { z } from "zod";
import {
  ApiAdminEventSongSubmissionSchema,
  ApiAdminSongSchema,
  ApiAdminUserSchema,
  ApiAuthMeSchema,
  ApiCheckinCreatedSchema,
  ApiEventDivisionEntitiesSchema,
  ApiEventSchema,
  ApiEventSongSubmissionSchema,
  ApiLeadingPairSchema,
  ApiManagedPartnershipSchema,
  ApiMyCheckinSchema,
  ApiPartnerSchema,
  ApiQueueEntrySchema,
  ApiRunSchema,
  ApiSessionSchema,
  ApiSongSchema,
  ApiTeamSchema,
  ApiTestInjectionSchema,
} from "@/schemas";

/**
 * Schema-valid test fixtures.
 *
 * The app checks every API response against its schema (src/api/contract),
 * strictly in tests. A fixture is therefore a claim about what the API can
 * return, and a partial one is a claim the API never makes. Each factory
 * spreads a complete default under the overrides a test cares about and
 * parses the result, so a fixture that could not come from the API fails
 * here, with the schema's message, instead of as a toast deep in a render.
 */
function factory<S extends z.ZodTypeAny>(schema: S, defaults: z.input<S>) {
  return (overrides: Partial<z.input<S>> = {}): z.output<S> =>
    schema.parse({ ...defaults, ...overrides });
}

const T = 1_750_000_000_000;

export const fx = {
  event: factory(ApiEventSchema, {
    id: "ev-1", name: "Test Event", start_date: "2026-06-01", end_date: "2026-06-03",
    timezone: "America/Chicago", season_year: "2026", status: "upcoming",
    created_by: "user_admin", created_at: T, updated_at: T,
  }),
  session: factory(ApiSessionSchema, {
    id: "s-1", event_id: null, name: "Session", date: "2026-06-01",
    checkin_opens_at: T, floor_trial_starts_at: T + 3_600_000, floor_trial_ends_at: T + 7_200_000,
    active_priority_max: 6, active_non_priority_max: 4, status: "scheduled",
    created_by: "user_admin", created_at: T,
  }),
  queueEntry: factory(ApiQueueEntrySchema, {
    queueEntryId: "qe-1", checkinId: "ci-1", position: 1, enteredQueueAt: T,
    entityPairId: "pair-1", entitySoloUserId: null, entityLabel: "Leader & Follower",
    divisionName: "Classic", songId: "song-1", notes: null, initialQueue: "non_priority",
    checkedInAt: T,
  }),
  myCheckin: factory(ApiMyCheckinSchema, {
    id: "ci-1", sessionId: "s-1", eventName: null, sessionName: "Session",
    sessionFloorTrialStartsAt: T, sessionStatus: "checkin_open", eventTimezone: null,
    divisionName: "Classic", entityLabel: "Leader & Follower", songDisplayName: null,
    songProcessedFilename: null, notes: null, checkedInAt: T, queueEntryId: "qe-1",
    queueType: "non_priority", queuePosition: 1, overallPosition: 1,
  }),
  song: factory(ApiSongSchema, {
    id: "song-1", user_id: "user_1", partner_id: null, display_name: null,
    original_filename: null, drive_file_id: null, drive_folder_id: null,
    processed_filename: null, division: null, routine_name: null,
    personal_descriptor: null, season_year: null, is_legacy: false,
    created_at: T, updated_at: T,
  }),
  partner: factory(ApiPartnerSchema, {
    id: "p-1", user_id: "user_1", first_name: "Pat", last_name: "Partner",
    partner_role: "follower", email: null, linked_user_id: null,
    created_at: T, updated_at: T, display_name: "Pat Partner",
  }),
  leadingPair: factory(ApiLeadingPairSchema, {
    id: "pair-1", partner_b_id: "p-1", display_name: "Leader & Follower",
  }),
  run: factory(ApiRunSchema, {
    id: "run-1", completed_at: T, division_name: "Classic", session_id: "s-1",
    session_floor_trial_starts_at: null, event_id: null, event_name: null,
    song_id: "song-1", song_label: "Song", entity_label: "Leader & Follower",
    entity_key: "pair:pair-1", completed_by_label: "Admin",
  }),
  adminUser: factory(ApiAdminUserSchema, {
    id: "user_1", email: "user@example.com", first_name: null, last_name: null,
    role: "user", created_at: T, song_count: 0, partner_count: 0,
  }),
  adminSong: factory(ApiAdminSongSchema, {
    id: "song-1", song_label: "Song", display_name: null, division: null,
    routine_name: null, personal_descriptor: null, season_year: null, is_legacy: false,
    created_at: T, deleted_at: null,
    owner: { id: "user_1", email: "user@example.com", full_name: null },
    partner: null,
  }),
  testInjection: factory(ApiTestInjectionSchema, {
    pair_id: "pair-1", created_at: T, leader_name: "Test Leader", follower_name: null,
    session_id: null, session_name: null, division_name: null,
    queue_status: "off_queue", position: null,
  }),
  authMe: factory(ApiAuthMeSchema, {
    id: "user_1", email: "user@example.com", display_name: null, first_name: null,
    last_name: null, role: "user", created_at: T, updated_at: T,
  }),
  team: factory(ApiTeamSchema, {
    id: "team-1", user_id: "user_1", identifier: "Team One", created_at: T, updated_at: T,
  }),
  managedPartnership: factory(ApiManagedPartnershipSchema, {
    id: "mp-1", user_id: "user_1", leader_first_name: "Lee", leader_last_name: "Leader",
    follower_first_name: "Fay", follower_last_name: "Follower", created_at: T, updated_at: T,
  }),
  eventSongSubmission: factory(ApiEventSongSubmissionSchema, {
    id: "sub-1", event_id: "ev-1", event_name: "Test Event", event_start_date: "2026-06-01",
    event_status: "upcoming", song_id: "song-1", song_label: "Song", division: null,
    round: "prelims_and_finals", created_at: T,
  }),
  adminEventSongSubmission: factory(ApiAdminEventSongSubmissionSchema, {
    id: "sub-1", event_id: "ev-1", event_name: "Test Event", division: null,
    song_id: "song-1", song_label: "Song", partnership_label: "Leader & Follower",
    submitter_email: "user@example.com", created_at: T,
  }),
  eventDivisionEntities: factory(ApiEventDivisionEntitiesSchema, {
    division: "Classic", entities: [],
  }),
  checkinCreated: factory(ApiCheckinCreatedSchema, {
    id: "ci-1", sessionId: "s-1", divisionName: "Classic", initialQueue: "non_priority",
  }),
};
