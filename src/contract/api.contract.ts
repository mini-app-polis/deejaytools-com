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
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { allEndpoints, checkEndpoint, endpoints } from "@/api/endpoints";
import { ClerkTestSession } from "./clerk";
import { ApiStatusError, type Client, Ledger, loadConfig, makeClient, sleep, strictContracts } from "./harness";

const RUN_PREFIX = "Contract Suite";
const DIVISION = "Classic";
const TIMEZONE = "America/Chicago";
/** The API's scheduler ticks every 30 s; allow three ticks. */
const QUEUE_FILL_TIMEOUT_MS = 95_000;
const QUEUE_POLL_MS = 5_000;
/** The API answers the last chunk at once and uploads to Drive afterwards. */
const DRIVE_UPLOAD_TIMEOUT_MS = 60_000;
/** Event copies and trashing run from the drive_jobs queue, one batch per
 * scheduler tick; allow three ticks. */
const DRIVE_JOB_TIMEOUT_MS = 95_000;

/**
 * Endpoints this suite deliberately does not call, and why. Each is still
 * covered by the unit fixtures, which are validated against the same schema.
 */
const NOT_EXERCISED: Record<string, string> = {
  "feedback.submit": "sends a real email",
};

/** Endpoints the unauthenticated probe cannot judge by status alone. */
const PROBE_EXEMPT = new Set([
  // Validates the body before it checks the token, so an empty body is a 400.
  "auth.sync",
  // Multipart; exercised by the song upload test instead.
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
  songId?: string;
  submissionId?: string;
  checkinId?: string;
} = {};

/**
 * A job on the API's Drive queue, as the operator endpoint lists it. No page
 * calls that endpoint, so it is not in the catalog and is read through the
 * raw client: here it is only a window onto work the API does in the
 * background, which no response the app sees ever reports.
 */
interface DriveJob {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
  submission_id: string | null;
}

async function listDriveJobs(): Promise<DriveJob[]> {
  return api.get<DriveJob[]>("/v1/admin/drive-jobs?limit=200");
}

/**
 * Wait until `pick` finds at least `count` Drive jobs and all of them are
 * done. A job that has failed even once fails the wait at once, with
 * Drive's reason: its retry is minutes away, and the first error is the
 * one worth reading.
 */
async function waitForDriveJobs(what: string, pick: (jobs: DriveJob[]) => DriveJob[], count: number): Promise<void> {
  const deadline = Date.now() + DRIVE_JOB_TIMEOUT_MS;
  for (;;) {
    const jobs = pick(await listDriveJobs());
    const broken = jobs.find((j) => j.status === "failed" || j.last_error);
    if (broken) {
      throw new Error(
        `The ${what} Drive job failed (attempt ${broken.attempts}): ${broken.last_error}. See drive_job_retrying in the dev API logs.`
      );
    }
    if (jobs.length >= count && jobs.every((j) => j.status === "done")) return;
    if (Date.now() > deadline) {
      throw new Error(
        `The ${what} Drive jobs were not done after ${DRIVE_JOB_TIMEOUT_MS / 1000}s ` +
          `(${jobs.map((j) => j.status).join(", ") || "none queued"}) — is the API's scheduler running?`
      );
    }
    await sleep(QUEUE_POLL_MS);
  }
}

/**
 * A calendar date (YYYY-MM-DD) in `timezone`, `offsetDays` from today. The
 * API checks session times against the event's dates in the event's own
 * timezone, so dates built in UTC go wrong every evening in Chicago, when
 * UTC has already reached tomorrow.
 */
function dateIn(timezone: string, offsetDays: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

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
  // sessions, check-ins, queue entries and song submissions with it (and
  // trashes the submissions' Drive copies), which leaves its songs free to
  // delete.
  const events = await api.get<{ id: string; name: string; created_by: string }[]>(endpoints.events.list.path());
  for (const e of events) {
    if (e.name.startsWith(RUN_PREFIX) && e.created_by === me.id) {
      await api.del(endpoints.events.remove.path({ id: e.id })).catch(() => undefined);
    }
  }
  const songs = await api.get<{ id: string; routine_name: string | null }[]>(endpoints.songs.list.path());
  for (const s of songs) {
    if (s.routine_name?.startsWith(RUN_PREFIX)) {
      await api.del(endpoints.songs.remove.path({ id: s.id })).catch(() => undefined);
    }
  }
  // The partner "partners and pairs" creates, under either of the names it
  // has in that test. Last: deleting a partner whose pair still has
  // check-ins keeps the pair, and the events' deletion above removed those.
  const partners = await api.get<{ id: string; first_name: string; last_name: string }[]>(endpoints.partners.list.path());
  for (const p of partners) {
    if (p.last_name === "Partner" && /^Contract(ed)?$/.test(p.first_name)) {
      await api.del(endpoints.partners.remove.path({ id: p.id })).catch(() => undefined);
    }
  }
}, 60_000);

afterAll(async () => {
  // In dependency order. A song with a live check-in cannot be deleted, so
  // the check-in goes first. The partner goes after the session: a pair
  // that still has check-ins is kept, partner cleared, when its partner is
  // deleted, and deleting the session is what removes those check-ins.
  // Removing the submission and the song queues their Drive files for
  // trashing, as the dancer test does on success.
  const cleanup: [string, () => Promise<unknown>][] = [
    ["checkins.withdraw", async () => state.checkinId && ledger.hit(endpoints.checkins.withdraw, { params: { id: state.checkinId } })],
    [
      "eventSongSubmissions.remove",
      async () => state.submissionId && ledger.hit(endpoints.eventSongSubmissions.remove, { params: { id: state.submissionId } }),
    ],
    ["songs.remove", async () => state.songId && ledger.hit(endpoints.songs.remove, { params: { id: state.songId } })],
    ["admin.clearTestCheckins", () => ledger.hit(endpoints.admin.clearTestCheckins)],
    ["sessions.remove", async () => state.sessionId && ledger.hit(endpoints.sessions.remove, { params: { id: state.sessionId } })],
    ["events.remove", async () => state.eventId && ledger.hit(endpoints.events.remove, { params: { id: state.eventId } })],
    ["partners.remove", async () => state.partnerId && ledger.hit(endpoints.partners.remove, { params: { id: state.partnerId } })],
    ["teams.remove", async () => state.teamId && ledger.hit(endpoints.teams.remove, { params: { id: state.teamId } })],
    [
      "managedPartnerships.remove",
      async () =>
        state.managedPartnershipId &&
        ledger.hit(endpoints.managedPartnerships.remove, { params: { id: state.managedPartnershipId } }),
    ],
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
    // Yesterday through tomorrow: the session opens an hour ago and runs two
    // hours on, which can cross midnight either way.
    const created = await ledger.hit(endpoints.events.create, {
      body: {
        name: `${RUN_PREFIX} ${new Date().toISOString()}`,
        start_date: dateIn(TIMEZONE, -1),
        end_date: dateIn(TIMEZONE, 1),
        timezone: TIMEZONE,
      },
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

  // The real round trip to Google Drive: the app's own upload code sends a
  // small MP3, and the API tags it and uploads it to the dev Drive folder in
  // the background. The song is attached to the partner from "partners and
  // pairs", as the upload form attaches it, so the dancer test below can
  // check in with it; that test deletes it. Deleting a song (or a
  // submission) moves its Drive files into that folder's _deprecated
  // subfolder, so each run leaves two tiny files there: the song and its
  // event copy.
  it("song upload reaches Google Drive", async () => {
    vi.stubEnv("VITE_API_URL", cfg.apiUrl);
    const { uploadSongInChunks } = await import("@/lib/chunkedSongUpload");
    const routineName = `${RUN_PREFIX} ${Date.now()}`;
    const partnerId = state.partnerId!;
    // An empty ID3v2 header passes the API's MP3 check; the rest stands in
    // for audio frames.
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0, ...new Uint8Array(4096).fill(0x55)]);
    await uploadSongInChunks({
      file: new File([bytes], "contract-suite.mp3", { type: "audio/mpeg" }),
      getToken: () => session.token(),
      buildFormFields: () => ({ division: DIVISION, routine_name: routineName, partner_id: partnerId }),
      retryDelayMs: 0,
    });
    ledger.mark(endpoints.songs.uploadChunk);

    // The API deletes the song again if the Drive upload fails, so a song
    // that appears and then vanishes means Drive refused it.
    let seen = false;
    const deadline = Date.now() + DRIVE_UPLOAD_TIMEOUT_MS;
    for (;;) {
      const song = (await ledger.hit(endpoints.songs.list)).find((s) => s.routine_name === routineName);
      if (song) {
        seen = true;
        state.songId = song.id;
        if (song.drive_file_id) {
          expect(song.processed_filename).toMatch(/\.mp3$/);
          expect(song.partner_id).toBe(partnerId);
          break;
        }
      } else if (seen) {
        throw new Error(
          "The API removed the uploaded song: its Google Drive upload failed. See song_background_upload_failed in the dev API logs."
        );
      }
      if (Date.now() > deadline) {
        throw new Error(`The song had no Google Drive file after ${DRIVE_UPLOAD_TIMEOUT_MS / 1000}s.`);
      }
      await sleep(2_000);
    }
    vi.unstubAllEnvs();
  }, 90_000);

  // The dancer's side of floor trial day, end to end: enter the uploaded
  // song in the event, check in with it, find it in the queue, withdraw,
  // then take the song back out. Check-in requires, in the order the API
  // checks: the window open (checkin_opens_at ≤ now ≤ floor_trial_ends_at);
  // a live song of the caller's; an entity the caller owns — here the pair
  // they lead with the song's partner; no live entry for that entity in the
  // session; the song submitted to the session's event; and a division the
  // session runs. The session admits no one to Active (active slots 0), so
  // the entry stays in the standard queue, first in line.
  //
  // Submitting queues the song's per-event Drive copy, made on a later
  // scheduler tick; the test waits for it, since that copy is what the DJ
  // plays from and nothing else exercises it. The upload test waited for the
  // song's own Drive file, so the copy has a source: submitting before that
  // also works (the finished build re-queues the copy), but would make this
  // wait depend on the build. Removing the submission and the song then
  // queue both files for trashing, which the test also waits for.
  it("a dancer submits the song, checks in, and withdraws", async () => {
    const sessionId = state.sessionId!;
    const songId = state.songId!;
    const song = (await ledger.hit(endpoints.songs.list)).find((s) => s.id === songId);
    expect(song?.drive_file_id).toBeTruthy();

    const submission = await ledger.hit(endpoints.eventSongSubmissions.create, {
      body: { event_id: state.eventId!, song_id: songId },
    });
    state.submissionId = submission.id;
    // No override sent, so the division is the song's own.
    expect(submission).toMatchObject({ event_id: state.eventId, song_id: songId, division: DIVISION, round: "prelims_and_finals" });
    const forEvent = await ledger.hit(endpoints.eventSongSubmissions.list, { params: { eventId: state.eventId! } });
    expect(forEvent.map((s) => s.id)).toContain(submission.id);

    // The pair "partners and pairs" made: the user leading the song's partner.
    const pair = await ledger.hit(endpoints.pairs.findOrCreate, { body: { partner_id: state.partnerId! } });
    const body = { sessionId, divisionName: DIVISION, entityPairId: pair.id, songId };
    const checkin = await ledger.hit(endpoints.checkins.create, { body });
    state.checkinId = checkin.id;
    expect(checkin).toMatchObject({ sessionId, divisionName: DIVISION, initialQueue: "non_priority" });
    // One live entry per entity per session.
    await expect(api.post(endpoints.checkins.create.path(), body)).rejects.toMatchObject({ status: 409 });

    const mine = (await ledger.hit(endpoints.checkins.mine)).find((c) => c.id === checkin.id);
    expect(mine).toMatchObject({
      sessionId,
      entityPairId: pair.id,
      songDisplayName: song!.display_name,
      queueType: "non_priority",
      queuePosition: 1,
      overallPosition: 1,
    });
    const waiting = await ledger.hit(endpoints.queue.waiting, { params: { sessionId } });
    expect(waiting.find((w) => w.checkinId === checkin.id)).toMatchObject({
      queueEntryId: mine!.queueEntryId,
      songId,
      subQueue: "non_priority",
    });

    await ledger.hit(endpoints.checkins.withdraw, { params: { id: checkin.id } });
    state.checkinId = undefined;
    expect((await ledger.hit(endpoints.checkins.mine)).some((c) => c.id === checkin.id)).toBe(false);
    expect((await ledger.hit(endpoints.queue.waiting, { params: { sessionId } })).some((w) => w.checkinId === checkin.id)).toBe(
      false
    );

    await waitForDriveJobs(
      "event copy",
      (jobs) => jobs.filter((j) => j.kind === "copy" && j.submission_id === submission.id),
      1
    );

    // Trash jobs carry only a file id, which the API never shows, so they
    // are told apart as the ones that were not there before.
    const before = new Set((await listDriveJobs()).map((j) => j.id));
    await ledger.hit(endpoints.eventSongSubmissions.remove, { params: { id: submission.id } });
    state.submissionId = undefined;
    const left = await ledger.hit(endpoints.eventSongSubmissions.list, { params: { eventId: state.eventId! } });
    expect(left.some((s) => s.id === submission.id)).toBe(false);
    await ledger.hit(endpoints.songs.remove, { params: { id: songId } });
    state.songId = undefined;
    expect((await ledger.hit(endpoints.songs.list)).some((s) => s.id === songId)).toBe(false);
    await waitForDriveJobs(
      "trash (event copy and song file)",
      (jobs) => jobs.filter((j) => j.kind === "trash" && !before.has(j.id)),
      2
    );
  }, 240_000);

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
