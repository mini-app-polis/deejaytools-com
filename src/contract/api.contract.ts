/**
 * Live contract suite: the web app's endpoint catalog, checked against a
 * running API.
 *
 * The unit tests prove the app handles the responses its fixtures describe.
 * This suite proves the API actually sends them. It walks the catalog in
 * `src/api/endpoints.ts` against a development deployment, validating every
 * response with the same `call()` the app uses, in strict mode — so a field
 * the API renames, drops, retypes or makes nullable fails here, before the
 * app ever sees it. That is the guarantee a rewrite of the API has to meet.
 *
 * It also pins the parts of the contract a schema cannot see: the response
 * envelope, and which endpoints demand a signed-in user.
 *
 * Writes are real. Everything the suite creates hangs off one event named
 * with RUN_PREFIX and owned by the test user, and is deleted at the end —
 * and any leftovers from a run that died are swept at the start. See
 * `harness.ts` for the guards that keep it off production.
 *
 * Run: pnpm test:contract  (needs CONTRACT_API_URL, CONTRACT_CLERK_SECRET_KEY,
 * CONTRACT_USER_ID; the test user must be an admin in that environment).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allEndpoints, checkEndpoint, endpoints } from "@/api/endpoints";
import { ClerkTestSession } from "./clerk";
import { ApiStatusError, type Client, Ledger, loadConfig, makeClient, sleep, strictContracts } from "./harness";

const RUN_PREFIX = "Contract Suite";
const DIVISION = "Classic";
/** The API's scheduler ticks every 30 s; allow three ticks. */
const QUEUE_FILL_TIMEOUT_MS = 95_000;
const QUEUE_POLL_MS = 5_000;

/**
 * Endpoints this suite deliberately does not call, and why. Each is still
 * covered by the unit fixtures, which are validated against the same schema.
 */
const NOT_EXERCISED: Record<string, string> = {
  "songs.uploadChunk": "uploads to Google Drive",
  "songs.remove": "needs an uploaded song (Google Drive)",
  "checkins.create": "needs an uploaded song submitted to the event (Google Drive)",
  "checkins.withdraw": "needs a check-in, which needs an uploaded song",
  "eventSongSubmissions.create": "enqueues a Google Drive copy",
  "eventSongSubmissions.remove": "needs a submission, which needs an uploaded song",
  "feedback.submit": "sends a real email",
};

/** Endpoints the unauthenticated probe cannot judge by status alone. */
const PROBE_EXEMPT = new Set([
  // Validates the body before it checks the token, so an empty body is a 400.
  "auth.sync",
  // Multipart upload; see NOT_EXERCISED.
  "songs.uploadChunk",
  // Public and has a side effect; see NOT_EXERCISED.
  "feedback.submit",
]);

const cfg = loadConfig();
let session: ClerkTestSession;
let api: Client;
let ledger: Ledger;

const state: {
  eventId?: string;
  sessionId?: string;
  partnerId?: string;
  teamId?: string;
  managedPartnershipId?: string;
} = {};

async function waitForActive(sessionId: string): Promise<string> {
  const deadline = Date.now() + QUEUE_FILL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const active = await ledger.hit(endpoints.queue.active, { params: { sessionId } });
    if (active.length > 0) return active[0].queueEntryId;
    await sleep(QUEUE_POLL_MS);
  }
  throw new Error(
    `No queue entry became active within ${QUEUE_FILL_TIMEOUT_MS / 1000}s — is the API's scheduler running?`
  );
}

beforeAll(async () => {
  strictContracts();
  session = await ClerkTestSession.start(cfg.clerkSecretKey, cfg.userId);
  api = makeClient(cfg.apiUrl, session);
  ledger = new Ledger(api);
  for (const [id, reason] of Object.entries(NOT_EXERCISED)) ledger.skip({ id }, reason);

  // auth.sync goes through fetch in the app (it runs before the client is
  // usable), so it is validated with checkEndpoint, as the app does.
  const res = await api.raw("POST", endpoints.auth.sync.path(), {
    email: session.user.email,
    firstName: session.user.firstName ?? undefined,
    lastName: session.user.lastName ?? undefined,
  });
  if (res.status === 401) {
    throw new Error(
      "The API rejected the development Clerk token at /auth/sync — is CONTRACT_API_URL a development deployment?"
    );
  }
  expect(res.status).toBe(200);
  const json = (await res.json()) as { data: unknown };
  checkEndpoint(endpoints.auth.sync, json.data);
  ledger.mark(endpoints.auth.sync);

  const me = await ledger.hit(endpoints.auth.me);
  if (me.role !== "admin") {
    throw new Error(
      `Contract user ${me.email} is not an admin in this environment. Promote it once from the Admin page.`
    );
  }

  // Sweep what a crashed run left behind. Deleting the event removes its
  // sessions, check-ins and queue entries with it.
  const events = await api.get<{ id: string; name: string; created_by: string }[]>(endpoints.events.list.path());
  for (const e of events) {
    if (e.name.startsWith(RUN_PREFIX) && e.created_by === me.id) {
      await api.del(endpoints.events.remove.path({ id: e.id })).catch(() => undefined);
    }
  }
}, 60_000);

afterAll(async () => {
  const cleanup: [string, () => Promise<unknown>][] = [
    ["admin.clearTestCheckins", () => ledger.hit(endpoints.admin.clearTestCheckins)],
    ["partners.remove", async () => state.partnerId && ledger.hit(endpoints.partners.remove, { params: { id: state.partnerId } })],
    ["teams.remove", async () => state.teamId && ledger.hit(endpoints.teams.remove, { params: { id: state.teamId } })],
    [
      "managedPartnerships.remove",
      async () =>
        state.managedPartnershipId &&
        ledger.hit(endpoints.managedPartnerships.remove, { params: { id: state.managedPartnershipId } }),
    ],
    ["sessions.remove", async () => state.sessionId && ledger.hit(endpoints.sessions.remove, { params: { id: state.sessionId } })],
    ["events.remove", async () => state.eventId && ledger.hit(endpoints.events.remove, { params: { id: state.eventId } })],
  ];
  const failures: string[] = [];
  if (ledger) {
    for (const [name, step] of cleanup) {
      try {
        await step();
      } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  await session?.end();

  if (ledger) {
    const { exercised, skipped, unaccounted } = ledger.report();
    console.info(
      `Contract coverage: ${exercised.length} exercised, ${skipped.length} skipped` +
        skipped.map(([id, why]) => `\n  skipped ${id} — ${why}`).join("")
    );
    if (unaccounted.length) {
      failures.push(
        `Endpoints neither exercised nor skipped with a reason: ${unaccounted.join(", ")}. ` +
          "Exercise them here or add them to NOT_EXERCISED."
      );
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
}, 120_000);

describe("access", () => {
  it("rejects every non-public endpoint without a token, with the error envelope", async () => {
    const anon = makeClient(cfg.apiUrl, null);
    const params = { id: "contract-probe", sessionId: "contract-probe", eventId: "contract-probe" };
    const wrong: string[] = [];
    for (const ep of allEndpoints()) {
      if (PROBE_EXEMPT.has(ep.id)) continue;
      const res = await anon.raw(ep.method, ep.path(params), ep.method === "GET" ? undefined : {});
      if (ep.access === "public") {
        if (res.status === 401 || res.status === 403) wrong.push(`${ep.id}: public but ${res.status}`);
        continue;
      }
      if (res.status !== 401) {
        wrong.push(`${ep.id}: expected 401, got ${res.status}`);
        continue;
      }
      const body = (await res.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null;
      if (typeof body?.error?.code !== "string" || typeof body?.error?.message !== "string") {
        wrong.push(`${ep.id}: 401 without the {error:{code,message}} envelope`);
      }
    }
    expect(wrong).toEqual([]);
  }, 60_000);
});

describe("contract", () => {
  it("profile", async () => {
    const me = await ledger.hit(endpoints.auth.me);
    await ledger.hit(endpoints.auth.updateMe, {
      body: { firstName: me.first_name || "Contract", lastName: me.last_name || "User" },
    });
  });

  it("events", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const created = await ledger.hit(endpoints.events.create, {
      body: { name: `${RUN_PREFIX} ${new Date().toISOString()}`, start_date: today, end_date: tomorrow },
    });
    state.eventId = created.id;
    await ledger.hit(endpoints.events.update, { params: { id: created.id }, body: { name: `${created.name} (updated)` } });
    const got = await ledger.hit(endpoints.events.get, { params: { id: created.id } });
    expect(got.id).toBe(created.id);
    const list = await ledger.hit(endpoints.events.list);
    expect(list.some((e) => e.id === created.id)).toBe(true);
    await ledger.hit(endpoints.events.entities, { params: { id: created.id } });
  });

  it("sessions", async () => {
    const now = Date.now();
    // Floor trial already under way, so the scheduler runs this session.
    // Active slots start at zero: nothing leaves the waiting queue until the
    // queue test opens a slot, which keeps its ordering deterministic.
    const created = await ledger.hit(endpoints.sessions.create, {
      body: {
        event_id: state.eventId,
        name: `${RUN_PREFIX} session`,
        checkin_opens_at: now - 3_600_000,
        floor_trial_starts_at: now - 60_000,
        floor_trial_ends_at: now + 7_200_000,
        active_priority_max: 0,
        active_non_priority_max: 0,
        divisions: [{ division_name: DIVISION, is_priority: false }],
      },
    });
    state.sessionId = created.id;
    await ledger.hit(endpoints.sessions.update, {
      params: { id: created.id },
      body: { name: `${RUN_PREFIX} session (updated)` },
    });
    await ledger.hit(endpoints.sessions.setDivisions, {
      params: { id: created.id },
      body: { divisions: [{ division_name: DIVISION, is_priority: false, sort_order: 0 }] },
    });
    const got = await ledger.hit(endpoints.sessions.get, { params: { id: created.id } });
    expect((got.divisions ?? []).map((d) => d.division_name)).toEqual([DIVISION]);
    const forEvent = await ledger.hit(endpoints.sessions.list, { params: { eventId: state.eventId! } });
    expect(forEvent.map((s) => s.id)).toContain(created.id);
    await ledger.hit(endpoints.sessions.list);
  });

  it("partners and pairs", async () => {
    const partner = await ledger.hit(endpoints.partners.create, {
      body: { first_name: "Contract", last_name: "Partner", partner_role: "follower" },
    });
    state.partnerId = partner.id;
    await ledger.hit(endpoints.partners.update, { params: { id: partner.id }, body: { first_name: "Contracted" } });
    const list = await ledger.hit(endpoints.partners.list);
    expect(list.some((p) => p.id === partner.id)).toBe(true);
    const pair = await ledger.hit(endpoints.pairs.findOrCreate, { body: { partner_id: partner.id } });
    const again = await ledger.hit(endpoints.pairs.findOrCreate, { body: { partner_id: partner.id } });
    expect(again.id).toBe(pair.id);
    const leading = await ledger.hit(endpoints.partners.leadingPairs);
    expect(leading.some((p) => p.id === pair.id)).toBe(true);
    await ledger.hit(endpoints.partners.associations, { params: { id: partner.id } });
  });

  it("teams", async () => {
    const team = await ledger.hit(endpoints.teams.create, { body: { identifier: `Contract Team ${Date.now()}` } });
    state.teamId = team.id;
    await ledger.hit(endpoints.teams.update, { params: { id: team.id }, body: { identifier: `Contract Team ${Date.now()} B` } });
    await ledger.hit(endpoints.teams.list);
    await ledger.hit(endpoints.teams.remove, { params: { id: team.id } });
    state.teamId = undefined;
  });

  it("managed partnerships", async () => {
    const body = {
      leader_first_name: "Contract",
      leader_last_name: "Leader",
      follower_first_name: "Contract",
      follower_last_name: "Follower",
    };
    const mp = await ledger.hit(endpoints.managedPartnerships.create, { body });
    state.managedPartnershipId = mp.id;
    await ledger.hit(endpoints.managedPartnerships.update, {
      params: { id: mp.id },
      body: { ...body, follower_last_name: "Follows" },
    });
    await ledger.hit(endpoints.managedPartnerships.list);
    await ledger.hit(endpoints.managedPartnerships.remove, { params: { id: mp.id } });
    state.managedPartnershipId = undefined;
  });

  it("the user's own lists", async () => {
    await ledger.hit(endpoints.songs.list);
    await ledger.hit(endpoints.checkins.mine);
    await ledger.hit(endpoints.eventSongSubmissions.list);
    await ledger.hit(endpoints.eventSongSubmissions.list, { params: { eventId: state.eventId! } });
  });

  it("admin reads", async () => {
    const me = await ledger.hit(endpoints.auth.me);
    const users = await ledger.hit(endpoints.admin.users, { params: { q: me.email ?? undefined } });
    expect(users.some((u) => u.id === me.id)).toBe(true);
    await ledger.hit(endpoints.admin.users);
    // Re-asserting the caller's own admin role is the one role change that
    // cannot lock anyone out.
    await ledger.hit(endpoints.admin.setUserRole, { params: { id: me.id }, body: { role: "admin" } });
    await ledger.hit(endpoints.admin.userPartners, { params: { id: me.id } });
    await ledger.hit(endpoints.admin.userEventSongSubmissions, { params: { id: me.id, eventId: state.eventId! } });
    await ledger.hit(endpoints.admin.songs);
    await ledger.hit(endpoints.admin.eventSongSubmissions, { params: { eventId: state.eventId! } });
  });

  it("queue", async () => {
    const sessionId = state.sessionId!;
    for (const n of [1, 2, 3]) {
      await ledger.hit(endpoints.admin.injectCheckin, {
        body: {
          sessionId,
          divisionName: DIVISION,
          leaderFirstName: "Contract",
          leaderLastName: `Leader${n}`,
          followerFirstName: "Contract",
          followerLastName: `Follower${n}`,
          notes: RUN_PREFIX,
        },
      });
    }
    const injected = await ledger.hit(endpoints.admin.testCheckins);
    expect(injected.filter((t) => t.session_id === sessionId)).toHaveLength(3);

    await ledger.hit(endpoints.queue.priority, { params: { sessionId } });
    await ledger.hit(endpoints.queue.nonPriority, { params: { sessionId } });
    const waiting = await ledger.hit(endpoints.queue.waiting, { params: { sessionId } });
    expect(waiting).toHaveLength(3);

    const sameQueue = waiting.filter((w) => w.subQueue === waiting[0].subQueue);
    expect(sameQueue.length).toBeGreaterThanOrEqual(2);
    await ledger.hit(endpoints.queue.moveDown, { body: { queueEntryId: sameQueue[0].queueEntryId } });
    await ledger.hit(endpoints.queue.withdraw, { body: { queueEntryId: sameQueue[sameQueue.length - 1].queueEntryId } });

    // Open one slot in each queue; the scheduler fills them.
    await ledger.hit(endpoints.sessions.update, {
      params: { id: sessionId },
      body: { active_priority_max: 1, active_non_priority_max: 1 },
    });
    const first = await waitForActive(sessionId);
    await ledger.hit(endpoints.queue.complete, { body: { queueEntryId: first } });
    const second = await waitForActive(sessionId);
    await ledger.hit(endpoints.queue.incomplete, { body: { queueEntryId: second } });

    const runs = await ledger.hit(endpoints.runs.list, { params: { query: `session_id=${encodeURIComponent(sessionId)}` } });
    expect(runs.length).toBeGreaterThan(0);
    await ledger.hit(endpoints.runs.list);
  }, 240_000);

  it("rejects what the contract says it must", async () => {
    // A 404 must come back as the error envelope, not a bare body.
    await expect(api.get(endpoints.events.get.path({ id: "contract-missing" }))).rejects.toBeInstanceOf(ApiStatusError);
  });
});
