import { z } from "zod";
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
  ApiPairRefSchema,
  ApiPartnerAssociationsSchema,
  ApiPartnerSchema,
  ApiQueueEntrySchema,
  ApiRunSchema,
  ApiSessionSchema,
  ApiSongSchema,
  ApiSongUploadChunkSchema,
  ApiTeamSchema,
  ApiTestInjectionCreatedSchema,
  ApiTestInjectionSchema,
  createCheckinBodySchema,
  createEventSongSubmissionBodySchema,
  createManagedPartnershipBodySchema,
  createTeamBodySchema,
} from "@/schemas";
import { checkResponse } from "./contract";

/**
 * The web app's API contract: every call it makes, in one place.
 *
 * Each entry names the method, who may call it, the path, and the schema
 * the response must satisfy. Pages and components go through `call()` and
 * never build a path or cast a response themselves, so this file is the
 * complete, checkable statement of what the app expects from the API —
 * and the list the live contract suite walks.
 *
 * `transport: "fetch"` marks the three calls that deliberately bypass the
 * client (auth sync runs before it is usable, the chunked upload owns its
 * retry loop, feedback is public). They validate with `checkEndpoint()`.
 */
export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Who may call it: anyone, any signed-in user, or an admin. */
export type Access = "public" | "user" | "admin";

// Loose on the input type: a schema with defaults (e.g. runCount) has an
// input shape that differs from its output.
type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

export interface Endpoint<P, B, R> {
  readonly id: string;
  readonly method: HttpMethod;
  readonly access: Access;
  readonly path: (params: P) => string;
  /** The request body's schema, where the contract shares one. */
  readonly request?: Schema<B>;
  /** The response's schema; `null` for a 204 with no body. */
  readonly response: Schema<R> | null;
  readonly transport?: "client" | "fetch";
}

function endpoint<P = void, B = void, R = void>(e: Endpoint<P, B, R>): Endpoint<P, B, R> {
  return e;
}

const ack = <K extends string>(key: K) => z.object({ [key]: z.literal(true) } as Record<K, z.ZodLiteral<true>>);
const id = (p: { id: string }) => encodeURIComponent(p.id);
const withQuery = (base: string, query?: string) => (query ? `${base}?${query}` : base);

type Body = Record<string, unknown>;

export const endpoints = {
  auth: {
    me: endpoint<void, void, z.infer<typeof ApiAuthMeSchema>>({
      id: "auth.me", method: "GET", access: "user",
      path: () => "/v1/auth/me", response: ApiAuthMeSchema,
    }),
    updateMe: endpoint<void, Body, z.infer<typeof ApiAuthMeSchema>>({
      id: "auth.updateMe", method: "PATCH", access: "user",
      path: () => "/v1/auth/me", response: ApiAuthMeSchema,
    }),
    sync: endpoint<void, Body, z.infer<typeof ApiAuthMeSchema>>({
      id: "auth.sync", method: "POST", access: "user", transport: "fetch",
      path: () => "/v1/auth/sync", response: ApiAuthMeSchema,
    }),
  },

  events: {
    list: endpoint<void, void, z.infer<typeof ApiEventSchema>[]>({
      id: "events.list", method: "GET", access: "public",
      path: () => "/v1/events", response: z.array(ApiEventSchema),
    }),
    get: endpoint<{ id: string }, void, z.infer<typeof ApiEventSchema>>({
      id: "events.get", method: "GET", access: "public",
      path: (p) => `/v1/events/${id(p)}`, response: ApiEventSchema,
    }),
    entities: endpoint<{ id: string }, void, z.infer<typeof ApiEventDivisionEntitiesSchema>[]>({
      id: "events.entities", method: "GET", access: "user",
      path: (p) => `/v1/events/${id(p)}/entities`, response: z.array(ApiEventDivisionEntitiesSchema),
    }),
    create: endpoint<void, Body, z.infer<typeof ApiEventSchema>>({
      id: "events.create", method: "POST", access: "admin",
      path: () => "/v1/events", response: ApiEventSchema,
    }),
    update: endpoint<{ id: string }, Body, z.infer<typeof ApiEventSchema>>({
      id: "events.update", method: "PATCH", access: "admin",
      path: (p) => `/v1/events/${id(p)}`, response: ApiEventSchema,
    }),
    remove: endpoint<{ id: string }, void, { deleted: true }>({
      id: "events.remove", method: "DELETE", access: "admin",
      path: (p) => `/v1/events/${id(p)}`, response: ack("deleted"),
    }),
  },

  sessions: {
    list: endpoint<{ eventId?: string } | void, void, z.infer<typeof ApiSessionSchema>[]>({
      id: "sessions.list", method: "GET", access: "public",
      path: (p) =>
        p && p.eventId ? `/v1/sessions?event_id=${encodeURIComponent(p.eventId)}` : "/v1/sessions",
      response: z.array(ApiSessionSchema),
    }),
    get: endpoint<{ id: string }, void, z.infer<typeof ApiSessionSchema>>({
      id: "sessions.get", method: "GET", access: "public",
      path: (p) => `/v1/sessions/${id(p)}`, response: ApiSessionSchema,
    }),
    create: endpoint<void, Body, z.infer<typeof ApiSessionSchema>>({
      id: "sessions.create", method: "POST", access: "admin",
      path: () => "/v1/sessions", response: ApiSessionSchema,
    }),
    update: endpoint<{ id: string }, Body, z.infer<typeof ApiSessionSchema>>({
      id: "sessions.update", method: "PATCH", access: "admin",
      path: (p) => `/v1/sessions/${id(p)}`, response: ApiSessionSchema,
    }),
    setDivisions: endpoint<{ id: string }, Body, z.infer<typeof ApiSessionSchema>>({
      id: "sessions.setDivisions", method: "PUT", access: "admin",
      path: (p) => `/v1/sessions/${id(p)}/divisions`, response: ApiSessionSchema,
    }),
    remove: endpoint<{ id: string }, void, { deleted: true }>({
      id: "sessions.remove", method: "DELETE", access: "admin",
      path: (p) => `/v1/sessions/${id(p)}`, response: ack("deleted"),
    }),
  },

  queue: {
    active: endpoint<{ sessionId: string }, void, z.infer<typeof ApiQueueEntrySchema>[]>({
      id: "queue.active", method: "GET", access: "public",
      path: (p) => `/v1/queue/${encodeURIComponent(p.sessionId)}/active`,
      response: z.array(ApiQueueEntrySchema),
    }),
    waiting: endpoint<{ sessionId: string }, void, z.infer<typeof ApiQueueEntrySchema>[]>({
      id: "queue.waiting", method: "GET", access: "public",
      path: (p) => `/v1/queue/${encodeURIComponent(p.sessionId)}/waiting`,
      response: z.array(ApiQueueEntrySchema),
    }),
    priority: endpoint<{ sessionId: string }, void, z.infer<typeof ApiQueueEntrySchema>[]>({
      id: "queue.priority", method: "GET", access: "admin",
      path: (p) => `/v1/queue/${encodeURIComponent(p.sessionId)}/priority`,
      response: z.array(ApiQueueEntrySchema),
    }),
    nonPriority: endpoint<{ sessionId: string }, void, z.infer<typeof ApiQueueEntrySchema>[]>({
      id: "queue.nonPriority", method: "GET", access: "admin",
      path: (p) => `/v1/queue/${encodeURIComponent(p.sessionId)}/non-priority`,
      response: z.array(ApiQueueEntrySchema),
    }),
    complete: endpoint<void, { queueEntryId: string }, { completed: true }>({
      id: "queue.complete", method: "POST", access: "admin",
      path: () => "/v1/queue/complete", response: ack("completed"),
    }),
    incomplete: endpoint<void, { queueEntryId: string }, { rotated: true }>({
      id: "queue.incomplete", method: "POST", access: "admin",
      path: () => "/v1/queue/incomplete", response: ack("rotated"),
    }),
    moveDown: endpoint<void, { queueEntryId: string }, { moved: true }>({
      id: "queue.moveDown", method: "POST", access: "admin",
      path: () => "/v1/queue/move-down", response: ack("moved"),
    }),
    withdraw: endpoint<void, { queueEntryId: string }, { withdrawn: true }>({
      id: "queue.withdraw", method: "POST", access: "admin",
      path: () => "/v1/queue/withdraw", response: ack("withdrawn"),
    }),
  },

  checkins: {
    create: endpoint<void, z.input<typeof createCheckinBodySchema>, z.infer<typeof ApiCheckinCreatedSchema>>({
      id: "checkins.create", method: "POST", access: "user",
      path: () => "/v1/checkins", request: createCheckinBodySchema, response: ApiCheckinCreatedSchema,
    }),
    mine: endpoint<void, void, z.infer<typeof ApiMyCheckinSchema>[]>({
      id: "checkins.mine", method: "GET", access: "user",
      path: () => "/v1/checkins/mine", response: z.array(ApiMyCheckinSchema),
    }),
    withdraw: endpoint<{ id: string }, void, { withdrawn: true }>({
      id: "checkins.withdraw", method: "DELETE", access: "user",
      path: (p) => `/v1/checkins/${id(p)}`, response: ack("withdrawn"),
    }),
  },

  songs: {
    list: endpoint<void, void, z.infer<typeof ApiSongSchema>[]>({
      id: "songs.list", method: "GET", access: "user",
      path: () => "/v1/songs", response: z.array(ApiSongSchema),
    }),
    remove: endpoint<{ id: string }, void, void>({
      id: "songs.remove", method: "DELETE", access: "user",
      path: (p) => `/v1/songs/${id(p)}`, response: null,
    }),
    uploadChunk: endpoint<void, FormData, z.infer<typeof ApiSongUploadChunkSchema>>({
      id: "songs.uploadChunk", method: "POST", access: "user", transport: "fetch",
      path: () => "/v1/songs/upload/chunk", response: ApiSongUploadChunkSchema,
    }),
  },

  partners: {
    list: endpoint<void, void, z.infer<typeof ApiPartnerSchema>[]>({
      id: "partners.list", method: "GET", access: "user",
      path: () => "/v1/partners", response: z.array(ApiPartnerSchema),
    }),
    create: endpoint<void, Body, z.infer<typeof ApiPartnerSchema>>({
      id: "partners.create", method: "POST", access: "user",
      path: () => "/v1/partners", response: ApiPartnerSchema,
    }),
    update: endpoint<{ id: string }, Body, z.infer<typeof ApiPartnerSchema>>({
      id: "partners.update", method: "PATCH", access: "user",
      path: (p) => `/v1/partners/${id(p)}`, response: ApiPartnerSchema,
    }),
    associations: endpoint<{ id: string }, void, z.infer<typeof ApiPartnerAssociationsSchema>>({
      id: "partners.associations", method: "GET", access: "user",
      path: (p) => `/v1/partners/${id(p)}/associations`, response: ApiPartnerAssociationsSchema,
    }),
    remove: endpoint<{ id: string }, void, void>({
      id: "partners.remove", method: "DELETE", access: "user",
      path: (p) => `/v1/partners/${id(p)}`, response: null,
    }),
    leadingPairs: endpoint<void, void, z.infer<typeof ApiLeadingPairSchema>[]>({
      id: "partners.leadingPairs", method: "GET", access: "user",
      path: () => "/v1/partners/leading-pairs", response: z.array(ApiLeadingPairSchema),
    }),
  },

  pairs: {
    findOrCreate: endpoint<void, { partner_id: string }, z.infer<typeof ApiPairRefSchema>>({
      id: "pairs.findOrCreate", method: "POST", access: "user",
      path: () => "/v1/pairs/find-or-create", response: ApiPairRefSchema,
    }),
  },

  teams: {
    list: endpoint<void, void, z.infer<typeof ApiTeamSchema>[]>({
      id: "teams.list", method: "GET", access: "user",
      path: () => "/v1/teams", response: z.array(ApiTeamSchema),
    }),
    create: endpoint<void, z.input<typeof createTeamBodySchema>, z.infer<typeof ApiTeamSchema>>({
      id: "teams.create", method: "POST", access: "user",
      path: () => "/v1/teams", request: createTeamBodySchema, response: ApiTeamSchema,
    }),
    update: endpoint<{ id: string }, z.input<typeof createTeamBodySchema>, z.infer<typeof ApiTeamSchema>>({
      id: "teams.update", method: "PATCH", access: "user",
      path: (p) => `/v1/teams/${id(p)}`, request: createTeamBodySchema, response: ApiTeamSchema,
    }),
    remove: endpoint<{ id: string }, void, void>({
      id: "teams.remove", method: "DELETE", access: "user",
      path: (p) => `/v1/teams/${id(p)}`, response: null,
    }),
  },

  managedPartnerships: {
    list: endpoint<void, void, z.infer<typeof ApiManagedPartnershipSchema>[]>({
      id: "managedPartnerships.list", method: "GET", access: "user",
      path: () => "/v1/managed-partnerships", response: z.array(ApiManagedPartnershipSchema),
    }),
    create: endpoint<void, z.input<typeof createManagedPartnershipBodySchema>, z.infer<typeof ApiManagedPartnershipSchema>>({
      id: "managedPartnerships.create", method: "POST", access: "user",
      path: () => "/v1/managed-partnerships", request: createManagedPartnershipBodySchema,
      response: ApiManagedPartnershipSchema,
    }),
    update: endpoint<{ id: string }, z.input<typeof createManagedPartnershipBodySchema>, z.infer<typeof ApiManagedPartnershipSchema>>({
      id: "managedPartnerships.update", method: "PATCH", access: "user",
      path: (p) => `/v1/managed-partnerships/${id(p)}`, request: createManagedPartnershipBodySchema,
      response: ApiManagedPartnershipSchema,
    }),
    remove: endpoint<{ id: string }, void, void>({
      id: "managedPartnerships.remove", method: "DELETE", access: "user",
      path: (p) => `/v1/managed-partnerships/${id(p)}`, response: null,
    }),
  },

  eventSongSubmissions: {
    list: endpoint<{ eventId?: string } | void, void, z.infer<typeof ApiEventSongSubmissionSchema>[]>({
      id: "eventSongSubmissions.list", method: "GET", access: "user",
      path: (p) =>
        p && p.eventId
          ? `/v1/event-song-submissions?event_id=${encodeURIComponent(p.eventId)}`
          : "/v1/event-song-submissions",
      response: z.array(ApiEventSongSubmissionSchema),
    }),
    create: endpoint<void, z.input<typeof createEventSongSubmissionBodySchema>, z.infer<typeof ApiEventSongSubmissionSchema>>({
      id: "eventSongSubmissions.create", method: "POST", access: "user",
      path: () => "/v1/event-song-submissions", request: createEventSongSubmissionBodySchema,
      response: ApiEventSongSubmissionSchema,
    }),
    remove: endpoint<{ id: string }, void, void>({
      id: "eventSongSubmissions.remove", method: "DELETE", access: "user",
      path: (p) => `/v1/event-song-submissions/${id(p)}`, response: null,
    }),
  },

  feedback: {
    submit: endpoint<void, Body, null>({
      id: "feedback.submit", method: "POST", access: "public", transport: "fetch",
      path: () => "/v1/feedback", response: z.null(),
    }),
  },

  runs: {
    list: endpoint<{ query?: string } | void, void, z.infer<typeof ApiRunSchema>[]>({
      id: "runs.list", method: "GET", access: "admin",
      path: (p) => withQuery("/v1/runs", p ? p.query : undefined), response: z.array(ApiRunSchema),
    }),
  },

  admin: {
    users: endpoint<{ q?: string } | void, void, z.infer<typeof ApiAdminUserSchema>[]>({
      id: "admin.users", method: "GET", access: "admin",
      path: (p) =>
        p && p.q ? `/v1/admin/users?q=${encodeURIComponent(p.q)}` : "/v1/admin/users",
      response: z.array(ApiAdminUserSchema),
    }),
    setUserRole: endpoint<{ id: string }, { role: "user" | "admin" }, z.infer<typeof ApiAdminUserSchema>>({
      id: "admin.setUserRole", method: "PATCH", access: "admin",
      path: (p) => `/v1/admin/users/${id(p)}/role`, response: ApiAdminUserSchema,
    }),
    userPartners: endpoint<{ id: string }, void, z.infer<typeof ApiPartnerSchema>[]>({
      id: "admin.userPartners", method: "GET", access: "admin",
      path: (p) => `/v1/admin/users/${id(p)}/partners`, response: z.array(ApiPartnerSchema),
    }),
    userEventSongSubmissions: endpoint<{ id: string; eventId: string }, void, z.infer<typeof ApiEventSongSubmissionSchema>[]>({
      id: "admin.userEventSongSubmissions", method: "GET", access: "admin",
      path: (p) =>
        `/v1/admin/users/${id(p)}/event-song-submissions?event_id=${encodeURIComponent(p.eventId)}`,
      response: z.array(ApiEventSongSubmissionSchema),
    }),
    songs: endpoint<{ query?: string } | void, void, z.infer<typeof ApiAdminSongSchema>[]>({
      id: "admin.songs", method: "GET", access: "admin",
      path: (p) => withQuery("/v1/admin/songs", p ? p.query : undefined),
      response: z.array(ApiAdminSongSchema),
    }),
    eventSongSubmissions: endpoint<{ eventId: string }, void, z.infer<typeof ApiAdminEventSongSubmissionSchema>[]>({
      id: "admin.eventSongSubmissions", method: "GET", access: "admin",
      path: (p) => `/v1/admin/event-song-submissions?event_id=${encodeURIComponent(p.eventId)}`,
      response: z.array(ApiAdminEventSongSubmissionSchema),
    }),
    injectCheckin: endpoint<void, Body, z.infer<typeof ApiTestInjectionCreatedSchema>>({
      id: "admin.injectCheckin", method: "POST", access: "admin",
      path: () => "/v1/admin/checkins", response: ApiTestInjectionCreatedSchema,
    }),
    testCheckins: endpoint<void, void, z.infer<typeof ApiTestInjectionSchema>[]>({
      id: "admin.testCheckins", method: "GET", access: "admin",
      path: () => "/v1/admin/checkins/test", response: z.array(ApiTestInjectionSchema),
    }),
    clearTestCheckins: endpoint<void, void, { deleted: number }>({
      id: "admin.clearTestCheckins", method: "DELETE", access: "admin",
      path: () => "/v1/admin/checkins/test", response: z.object({ deleted: z.number() }),
    }),
  },
} as const;

/** Every endpoint as a flat list — what the contract suite iterates. */
export function allEndpoints(): Endpoint<unknown, unknown, unknown>[] {
  const out: Endpoint<unknown, unknown, unknown>[] = [];
  for (const group of Object.values(endpoints)) {
    for (const ep of Object.values(group)) out.push(ep as Endpoint<unknown, unknown, unknown>);
  }
  return out;
}

/** The subset of the API client `call()` needs. */
export interface Transport {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  del(path: string): Promise<unknown>;
}

// Params (or a body) are optional exactly when `void` is one of their
// allowed values — `void` itself, or e.g. `{ eventId?: string } | void`.
type Args<P, B> = [void] extends [P]
  ? [void] extends [B]
    ? [opts?: { params?: P; body?: B }]
    : [opts: { params?: P; body: B }]
  : [void] extends [B]
    ? [opts: { params: P; body?: B }]
    : [opts: { params: P; body: B }];

/** Call an endpoint through the API client and validate what comes back. */
export async function call<P, B, R>(
  api: Transport,
  ep: Endpoint<P, B, R>,
  ...args: Args<P, B>
): Promise<R> {
  const opts = (args[0] ?? {}) as { params?: P; body?: B };
  const path = ep.path(opts.params as P);
  let data: unknown;
  switch (ep.method) {
    case "GET":
      data = await api.get<unknown>(path);
      break;
    case "POST":
      data = await api.post<unknown>(path, opts.body);
      break;
    case "PATCH":
      data = await api.patch<unknown>(path, opts.body);
      break;
    case "PUT":
      data = await api.put<unknown>(path, opts.body);
      break;
    case "DELETE":
      data = await api.del(path);
      break;
  }
  return checkEndpoint(ep, data);
}

/** Validate a response obtained outside `call()` (the `transport: "fetch"` endpoints). */
export function checkEndpoint<P, B, R>(ep: Endpoint<P, B, R>, data: unknown): R {
  if (ep.response === null) return undefined as R;
  return checkResponse(ep.id, ep.response, data);
}
