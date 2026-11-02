/* global __ENV, console */
/**
 * Event load test: one venue's traffic against the development API, from
 * one address (api-deejaytools ADR-0013). Run with k6; see load/README.md.
 *
 * Three scenarios share one session the script creates:
 *   steady  phones open the session page and poll it, as SessionDetailPage
 *           does: sessions.get, queue.active and queue.waiting every 60 s,
 *           anonymous, from a random start offset; signed-in phones also
 *           read auth.me and checkins.mine with their token on page load
 *           and checkins.mine again when the tab regains focus.
 *   reload  a burst of page loads (what one page load requests is in
 *           pageLoad() below).
 *   rush    the check-in window opens and dancers check in: the check-in
 *           dialog's reads, POST /v1/checkins (which takes the session's
 *           lock), then the reads the app refetches after a check-in.
 *
 * It writes to the API it targets, so it refuses to run unless the API is
 * the development one (or local) and the Clerk key is a development key.
 * Plain JavaScript for k6's runtime: it cannot import the app's TypeScript,
 * so the paths below mirror src/api/endpoints.ts.
 */
import http from "k6/http";
import exec from "k6/execution";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Configuration and guards
// ---------------------------------------------------------------------------

/** The only hosts the script may call: it creates and deletes data. */
const ALLOWED_HOSTS = ["api-dev.deejaytools.com", "localhost", "127.0.0.1"];
const CLERK_API = "https://api.clerk.com/v1";

function env(name, fallback) {
  const v = (__ENV[name] || "").trim();
  return v || fallback;
}

function num(name, fallback) {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got ${raw}`);
  return n;
}

function loadConfig() {
  const names = [
    "CONTRACT_API_URL",
    "CONTRACT_CLERK_SECRET_KEY",
    "CONTRACT_USER_ID",
    "CONTRACT_DANCER_USER_ID",
    "CONTRACT_STAFF_USER_ID",
  ];
  const missing = names.filter((n) => !env(n));
  if (missing.length) throw new Error(`Load test not configured: set ${missing.join(", ")}.`);
  const apiUrl = env("CONTRACT_API_URL").replace(/\/$/, "");
  const host = (apiUrl.match(/^https?:\/\/([^/:]+)/) || [])[1];
  if (!host || !ALLOWED_HOSTS.includes(host)) {
    throw new Error(`Refusing to run against ${host || apiUrl}: only ${ALLOWED_HOSTS.join(", ")}.`);
  }
  const clerkSecretKey = env("CONTRACT_CLERK_SECRET_KEY");
  if (!clerkSecretKey.startsWith("sk_test_")) {
    throw new Error("Refusing to run: CONTRACT_CLERK_SECRET_KEY is not a development-instance key (sk_test_…).");
  }
  const users = {
    admin: env("CONTRACT_USER_ID"),
    dancer: env("CONTRACT_DANCER_USER_ID"),
    staff: env("CONTRACT_STAFF_USER_ID"),
  };
  if (new Set(Object.values(users)).size !== 3) {
    throw new Error("Refusing to run: the three CONTRACT_*USER_ID values must be three different users.");
  }

  const cfg = {
    apiUrl,
    clerkSecretKey,
    users,
    /** Sent as the browser would; Cloudflare's cache key includes it. */
    origin: env("LOAD_ORIGIN", "https://dev.deejaytools-com.pages.dev"),
    phones: num("LOAD_PHONES", 3000),
    /** One phone in this many is signed in. */
    signedInEvery: num("LOAD_SIGNED_IN_EVERY", 3),
    rampSeconds: num("LOAD_RAMP_SECONDS", 180),
    durationSeconds: num("LOAD_DURATION_SECONDS", 600),
    /** Chance a phone's tab regains focus in a given minute. */
    focusPerMinute: num("LOAD_FOCUS_PER_MINUTE", 0.25),
    reloads: num("LOAD_RELOADS", 1000),
    reloadSeconds: num("LOAD_RELOAD_SECONDS", 10),
    reloadAt: num("LOAD_RELOAD_AT_SECONDS", 300),
    rushCheckins: num("LOAD_RUSH_CHECKINS", 300),
    rushSeconds: num("LOAD_RUSH_SECONDS", 60),
    rushAt: num("LOAD_RUSH_AT_SECONDS", 420),
    /** 1: each rush check-in first makes the check-in dialog's reads. */
    rushFormReads: num("LOAD_RUSH_FORM_READS", 1) > 0,
    /** Gap between setup and teardown requests: under Cloudflare's 50 per 10 s. */
    setupGapMs: num("LOAD_SETUP_GAP_MS", 220),
  };
  if (cfg.signedInEvery < 1) throw new Error("LOAD_SIGNED_IN_EVERY must be at least 1.");
  if (cfg.reloadAt + cfg.reloadSeconds > cfg.durationSeconds) {
    throw new Error("The reload burst must end before LOAD_DURATION_SECONDS.");
  }
  if (cfg.rushCheckins > 0 && cfg.rushAt + cfg.rushSeconds + 30 > cfg.durationSeconds) {
    throw new Error("The check-in rush must end at least 30 s before LOAD_DURATION_SECONDS.");
  }
  if (cfg.rushSeconds < 10) throw new Error("LOAD_RUSH_SECONDS must be at least 10.");
  return cfg;
}

const CFG = loadConfig();

/** Names that mark what a run creates, so a later run can sweep it. */
const RUN_PREFIX = "Load Test";
const PARTNER_FIRST_NAME = "Loadtest";
const DIVISION = "Classic";
const TIMEZONE = "America/Chicago";
/** How often the session page polls (SessionDetailPage QUEUE_POLL_MS). */
const POLL_SECONDS = 60;
/** Time to fill in the check-in dialog before submitting. */
const THINK_MIN_SECONDS = 3;
const THINK_MAX_SECONDS = 8;

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Reads, without the requests a limit refused (counted below instead). */
const readMs = new Trend("read_ms", true);
/** POST /v1/checkins, without the requests a limit refused. */
const checkinMs = new Trend("checkin_ms", true);
/** Cloudflare refused it: a non-JSON 4xx from the edge (1015 rate limit, a challenge). */
const cfBlock = new Counter("cf_block");
/** The API's own 429 on an anonymous request: keyed on the venue's address. */
const api429Address = new Counter("api_429_address");
/**
 * The API's own 429 on a signed-in request: keyed on the user. Every
 * signed-in phone here shares one of a few test users, which no real dancer
 * does, so this counts the test's sharing, not a capacity failure.
 */
const api429SharedUser = new Counter("api_429_shared_user");
const http5xx = new Counter("http_5xx");
/** A 4xx other than 429: a request this script got wrong, or a refused check-in. */
const unexpected4xx = new Counter("unexpected_4xx");
const networkErrors = new Counter("network_errors");
const checkinsCreated = new Counter("checkins_created");

/** cf-cache-status of the anonymous reads, one counter per value (tagged by endpoint). */
const CACHE_STATUSES = ["HIT", "MISS", "EXPIRED", "STALE", "UPDATING", "REVALIDATED", "BYPASS", "DYNAMIC", "NONE"];
const cfCache = Object.fromEntries(CACHE_STATUSES.map((s) => [s, new Counter(`cf_cache_${s.toLowerCase()}`)]));

const READ_ENDPOINTS = [
  "version",
  "sessions.get",
  "queue.active",
  "queue.waiting",
  "auth.me",
  "checkins.mine",
  "events.list",
  "partners.leadingPairs",
  "songs.list",
  "eventSongSubmissions.list",
];
const CACHED_ENDPOINTS = ["sessions.get", "queue.active", "queue.waiting"];
const SCENARIOS = ["steady", "reload", "rush"];

/**
 * Pass criteria, and display-only thresholds (always pass) that make k6's
 * summary break the results down by scenario and endpoint.
 */
function thresholds() {
  const t = {
    read_ms: ["p(95)<500"],
    checkin_ms: ["p(95)<2000"],
    http_5xx: ["count==0"],
    cf_block: ["count==0"],
    api_429_address: ["count==0"],
    network_errors: ["count==0"],
    unexpected_4xx: ["count==0"],
    api_429_shared_user: ["count>=0"],
    checkins_created: ["count>=0"],
    dropped_iterations: ["count>=0"],
  };
  for (const s of SCENARIOS) {
    t[`read_ms{scenario:${s}}`] = ["p(95)<500"];
    t[`cf_block{scenario:${s}}`] = ["count>=0"];
    t[`api_429_shared_user{scenario:${s}}`] = ["count>=0"];
    t[`http_5xx{scenario:${s}}`] = ["count>=0"];
    t[`http_reqs{scenario:${s}}`] = ["count>=0"];
  }
  for (const auth of ["anon", "user"]) t[`cf_block{auth:${auth}}`] = ["count>=0"];
  for (const e of READ_ENDPOINTS) {
    t[`read_ms{endpoint:${e}}`] = ["p(95)>=0"];
    t[`http_reqs{endpoint:${e}}`] = ["count>=0"];
  }
  t["http_reqs{endpoint:checkins.create}"] = ["count>=0"];
  for (const e of CACHED_ENDPOINTS) {
    for (const s of CACHE_STATUSES) t[`cf_cache_${s.toLowerCase()}{endpoint:${e}}`] = ["count>=0"];
  }
  return t;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const scenarios = {
  steady: {
    executor: "ramping-vus",
    exec: "steady",
    startVUs: 0,
    stages: [
      { duration: `${CFG.rampSeconds}s`, target: CFG.phones },
      { duration: `${Math.max(0, CFG.durationSeconds - CFG.rampSeconds)}s`, target: CFG.phones },
    ],
    gracefulRampDown: "0s",
    gracefulStop: "5s",
  },
};
if (CFG.reloads > 0) {
  scenarios.reload = {
    executor: "constant-arrival-rate",
    exec: "reload",
    startTime: `${CFG.reloadAt}s`,
    rate: CFG.reloads,
    timeUnit: `${CFG.reloadSeconds}s`,
    duration: `${CFG.reloadSeconds}s`,
    preAllocatedVUs: Math.max(1, Math.ceil(CFG.reloads / 4)),
    maxVUs: Math.max(1, CFG.reloads),
    gracefulStop: "30s",
  };
}
if (CFG.rushCheckins > 0) {
  scenarios.rush = {
    executor: "per-vu-iterations",
    exec: "rush",
    // A little early: each VU waits for the window to open (setup's opensAt).
    startTime: `${Math.max(0, CFG.rushAt - 5)}s`,
    vus: CFG.rushCheckins,
    iterations: 1,
    maxDuration: `${CFG.rushSeconds + 60}s`,
    gracefulStop: "30s",
  };
}

export const options = {
  scenarios,
  thresholds: thresholds(),
  // Bodies are read only where the script needs them (responseType: "text").
  discardResponseBodies: true,
  // Setup creates the rush's partners, songs, pairs and submissions at a
  // pace Cloudflare's per-IP rule allows; teardown deletes them the same way.
  setupTimeout: "30m",
  teardownTimeout: "30m",
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  userAgent: "deejaytools-load-test (k6)",
};

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

function header(res, name) {
  const want = name.toLowerCase();
  for (const k of Object.keys(res.headers || {})) {
    if (k.toLowerCase() === want) return res.headers[k];
  }
  return undefined;
}

function isJson(res) {
  return (header(res, "Content-Type") || "").includes("application/json");
}

function request(method, path, { token = null, body = undefined, endpoint, kind, text = false } = {}) {
  const headers = { Accept: "application/json", Origin: CFG.origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const params = {
    headers,
    tags: { endpoint, kind, auth: token ? "user" : "anon" },
  };
  if (text) params.responseType = "text";
  return {
    method,
    url: `${CFG.apiUrl}${path}`,
    body: body === undefined ? null : JSON.stringify(body),
    params,
  };
}

function send(req) {
  const res = http.request(req.method, req.url, req.body, req.params);
  record(res, req.params.tags);
  return res;
}

function sendAll(reqs) {
  const out = http.batch(reqs.map((r) => [r.method, r.url, r.body, r.params]));
  out.forEach((res, i) => record(res, reqs[i].params.tags));
  return out;
}

/** Classify a load request's response into the metrics above. */
function record(res, tags) {
  const mtags = { endpoint: tags.endpoint, auth: tags.auth, scenario: exec.scenario.name };
  if (res.status === 0) {
    networkErrors.add(1, mtags);
    return;
  }
  let limited = false;
  if (res.status >= 400 && res.status < 500 && !isJson(res)) {
    cfBlock.add(1, mtags);
    limited = true;
  } else if (res.status === 429) {
    (tags.auth === "user" ? api429SharedUser : api429Address).add(1, mtags);
    limited = true;
  } else if (res.status >= 500) {
    http5xx.add(1, mtags);
  } else if (res.status >= 400) {
    unexpected4xx.add(1, mtags);
    if (res.body) console.warn(`${tags.endpoint} ${res.status}: ${String(res.body).slice(0, 200)}`);
  }
  if (tags.auth === "anon" && tags.kind === "read") {
    const status = (header(res, "Cf-Cache-Status") || "NONE").toUpperCase();
    (cfCache[status] || cfCache.NONE).add(1, mtags);
  }
  if (!limited) {
    if (tags.kind === "read") readMs.add(res.timings.duration, mtags);
    if (tags.kind === "checkin") checkinMs.add(res.timings.duration, mtags);
  }
  check(res, { "not refused or failed": (r) => r.status >= 200 && r.status < 400 }, mtags);
}

// The app's reads, as src/api/endpoints.ts builds them.
const reads = {
  version: () => request("GET", "/version", { endpoint: "version", kind: "read" }),
  session: (id) => request("GET", `/v1/sessions/${id}`, { endpoint: "sessions.get", kind: "read" }),
  active: (id) => request("GET", `/v1/queue/${id}/active`, { endpoint: "queue.active", kind: "read" }),
  waiting: (id) => request("GET", `/v1/queue/${id}/waiting`, { endpoint: "queue.waiting", kind: "read" }),
  me: (token) => request("GET", "/v1/auth/me", { token, endpoint: "auth.me", kind: "read", text: true }),
  mine: (token) => request("GET", "/v1/checkins/mine", { token, endpoint: "checkins.mine", kind: "read" }),
  events: () => request("GET", "/v1/events", { endpoint: "events.list", kind: "read" }),
  leadingPairs: (token) =>
    request("GET", "/v1/partners/leading-pairs", { token, endpoint: "partners.leadingPairs", kind: "read" }),
  songs: (token) => request("GET", "/v1/songs", { token, endpoint: "songs.list", kind: "read" }),
  submissions: (token, eventId) =>
    request("GET", `/v1/event-song-submissions?event_id=${encodeURIComponent(eventId)}`, {
      token,
      endpoint: "eventSongSubmissions.list",
      kind: "read",
    }),
};

/** The session page's three polled reads: public, sent without a token. */
function polledReads(sessionId) {
  return [reads.session(sessionId), reads.active(sessionId), reads.waiting(sessionId)];
}

/** The signed-in user a phone uses, or null for a signed-out phone. */
function phoneUser(data, phone) {
  if (phone % CFG.signedInEvery !== 0) return null;
  // Alternate the two plain test users between signed-in phones.
  return (phone / CFG.signedInEvery) % 2 === 0 ? data.users.dancer : data.users.staff;
}

/** The caller's event staff roles from a GET /v1/auth/me response; none if unreadable. */
function eventRoles(res) {
  try {
    return (JSON.parse(res.body).data || {}).event_roles || [];
  } catch {
    return [];
  }
}

/**
 * One load of /sessions/:id, as the app makes it: the nav's GET /version and
 * the page's three public reads, all without a token; signed in, also
 * GET /v1/auth/me and GET /v1/checkins/mine with it, and the public events
 * list when auth.me says the caller is on an event's staff (the nav's
 * useStaffEvents). AuthSync's POST /v1/auth/sync runs once per tab, not on a
 * reload, and the site's own files and Clerk's calls go to other hosts.
 */
function pageLoad(data, user) {
  const batch = [reads.version(), ...polledReads(data.sessionId)];
  if (user) batch.push(reads.me(user.token), reads.mine(user.token));
  const res = sendAll(batch);
  if (user) {
    const me = res[batch.length - 2];
    if (eventRoles(me).length > 0) send(reads.events());
  }
}

/**
 * The tab regaining focus: TanStack Query refetches the page's stale queries
 * (older than the app's 30 s staleTime): the three polled reads and, signed
 * in, checkins.mine. auth.me and /version never go stale.
 */
function focus(data, user) {
  const batch = polledReads(data.sessionId);
  if (user) batch.push(reads.mine(user.token));
  sendAll(batch);
}

// ---------------------------------------------------------------------------
// Scenario functions
// ---------------------------------------------------------------------------

/** One phone: one page load, then one poll cycle per iteration. */
export function steady(data) {
  const user = phoneUser(data, exec.vu.idInTest);
  if (exec.vu.iterationInScenario === 0) {
    pageLoad(data, user);
    // The page's polling starts at a random offset (SessionDetailPage).
    sleep(Math.random() * POLL_SECONDS);
  }
  const start = Date.now();
  sendAll(polledReads(data.sessionId));
  if (Math.random() < CFG.focusPerMinute) {
    sleep(Math.max(0, Math.random() * POLL_SECONDS - (Date.now() - start) / 1000));
    focus(data, user);
  }
  sleep(Math.max(0, POLL_SECONDS - (Date.now() - start) / 1000));
}

/** One page load in the reload burst. */
export function reload(data) {
  pageLoad(data, phoneUser(data, exec.scenario.iterationInTest));
}

/**
 * One dancer checking in when the window opens. Arrivals are front-loaded
 * (exponential, mean a quarter of the rush), each opens the check-in dialog,
 * takes a few seconds over it, and submits within the rush. All of them
 * check in as the admin test user, each with its own pair and song (setup).
 */
export function rush(data) {
  const i = exec.scenario.iterationInTest;
  const entity = data.entities[i];
  if (!entity) return;
  const token = data.users.admin.token;
  const latest = CFG.rushSeconds - THINK_MAX_SECONDS;
  const arrival = Math.min(latest, (-Math.log(1 - Math.random()) * CFG.rushSeconds) / 4);
  const think = THINK_MIN_SECONDS + Math.random() * (THINK_MAX_SECONDS - THINK_MIN_SECONDS);
  // A quarter second after opening at the earliest, for clock skew.
  sleep(Math.max(0, (data.opensAt + 250 - Date.now()) / 1000 + arrival));

  if (CFG.rushFormReads) {
    sendAll([reads.leadingPairs(token), reads.songs(token), reads.submissions(token, data.eventId)]);
  }
  sleep(think);
  const res = send(
    request("POST", "/v1/checkins", {
      token,
      endpoint: "checkins.create",
      kind: "checkin",
      text: true,
      body: {
        sessionId: data.sessionId,
        divisionName: DIVISION,
        entityPairId: entity.pairId,
        entityManagedPartnershipId: null,
        songId: entity.songId,
      },
    })
  );
  if (res.status !== 201) return;
  checkinsCreated.add(1);
  // The check-in mutation invalidates these, and the page refetches them.
  sendAll([...polledReads(data.sessionId), reads.mine(token)]);
}

// ---------------------------------------------------------------------------
// Setup and teardown (paced, retried, outside the measured metrics)
// ---------------------------------------------------------------------------

let nextSlot = 0;

function pace() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + CFG.setupGapMs;
  if (at > now) sleep((at - now) / 1000);
}

/** A setup request: paced, and sent again after a rate limit lifts. */
function admin(token, method, path, body) {
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}`, Origin: CFG.origin };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  for (let attempt = 0; ; attempt++) {
    pace();
    const res = http.request(method, `${CFG.apiUrl}${path}`, body === undefined ? null : JSON.stringify(body), {
      headers,
      tags: { endpoint: "setup", kind: "setup" },
      responseType: "text",
    });
    if (res.status === 429 && attempt < 5) {
      // Cloudflare's block lasts 10 s; the API says how long in Retry-After.
      const wait = isJson(res) ? Number(header(res, "Retry-After")) || 5 : 11;
      sleep(wait);
      continue;
    }
    return res;
  }
}

function ok(res, what) {
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${what} failed: ${res.status} ${String(res.body).slice(0, 300)}`);
  }
  return res.status === 204 ? undefined : JSON.parse(res.body).data;
}

function clerk(method, path, body) {
  const res = http.request(method, `${CLERK_API}${path}`, body === undefined ? null : JSON.stringify(body), {
    headers: { Authorization: `Bearer ${CFG.clerkSecretKey}`, "Content-Type": "application/json" },
    tags: { endpoint: "clerk", kind: "setup" },
    responseType: "text",
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Clerk ${method} ${path} failed: ${res.status} ${String(res.body).slice(0, 300)}`);
  }
  return JSON.parse(res.body);
}

/**
 * Sign a test user in as the contract suite does (src/contract/clerk.ts,
 * harness.ts signInAs): a Clerk session made with the development secret
 * key, a token from it, and POST /v1/auth/sync. The token is minted once,
 * to last the whole run, so the load itself makes no calls to Clerk.
 */
function signIn(userId, lifetimeSeconds) {
  const u = clerk("GET", `/users/${encodeURIComponent(userId)}`);
  const email =
    (u.email_addresses.find((e) => e.id === u.primary_email_address_id) || u.email_addresses[0] || {})
      .email_address;
  if (!email) throw new Error(`Clerk user ${userId} has no email address`);
  const session = clerk("POST", "/sessions", { user_id: userId });
  const { jwt } = clerk("POST", `/sessions/${encodeURIComponent(session.id)}/tokens`, {
    expires_in_seconds: lifetimeSeconds,
  });
  ok(
    admin(jwt, "POST", "/v1/auth/sync", {
      email,
      firstName: u.first_name || undefined,
      lastName: u.last_name || undefined,
    }),
    `Syncing ${email}`
  );
  return { token: jwt, sessionId: session.id, email };
}

function day(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

/** Delete what a run (this one, or one that crashed) left behind. */
function sweep(token, meId) {
  // Deleting an event removes its sessions, check-ins, queue entries and
  // song submissions; that frees the songs, then the partners.
  const events = ok(admin(token, "GET", "/v1/events"), "Listing events");
  for (const e of events) {
    if (e.name.startsWith(RUN_PREFIX) && e.created_by === meId) admin(token, "DELETE", `/v1/events/${e.id}`);
  }
  const songs = ok(admin(token, "GET", "/v1/songs"), "Listing songs");
  for (const s of songs) {
    if ((s.routine_name || "").startsWith(RUN_PREFIX) && !s.shared_with_me) {
      admin(token, "DELETE", `/v1/songs/${s.id}`);
    }
  }
  const partners = ok(admin(token, "GET", "/v1/partners"), "Listing partners");
  for (const p of partners) {
    if (p.first_name === PARTNER_FIRST_NAME) admin(token, "DELETE", `/v1/partners/${p.id}`);
  }
}

export function setup() {
  const started = Date.now();
  // Long enough for setup, the run and teardown, with room to spare.
  const lifetime = Math.ceil(CFG.durationSeconds + 3 * 3600);
  const users = {
    admin: signIn(CFG.users.admin, lifetime),
    dancer: signIn(CFG.users.dancer, lifetime),
    staff: signIn(CFG.users.staff, lifetime),
  };
  const token = users.admin.token;
  const me = ok(admin(token, "GET", "/v1/auth/me"), "Reading the admin");
  if (me.role !== "admin") {
    throw new Error(`${me.email} is not an admin in this environment (CONTRACT_USER_ID must be one).`);
  }
  sweep(token, me.id);

  const event = ok(
    admin(token, "POST", "/v1/events", {
      name: `${RUN_PREFIX} ${new Date().toISOString()}`,
      start_date: day(-1),
      end_date: day(1),
      timezone: TIMEZONE,
    }),
    "Creating the event"
  );

  // The rush's entities: each a partner of the admin's, a song with that
  // partner (a metadata row, no file), the pair, and the song entered in the
  // event, which is everything POST /v1/checkins requires of a dancer.
  const entities = [];
  for (let i = 0; i < CFG.rushCheckins; i++) {
    const partner = ok(
      admin(token, "POST", "/v1/partners", {
        first_name: PARTNER_FIRST_NAME,
        last_name: `Follower ${i + 1}`,
        partner_role: "follower",
      }),
      "Creating a partner"
    );
    const song = ok(
      admin(token, "POST", "/v1/songs", {
        partner_id: partner.id,
        division: DIVISION,
        routine_name: `${RUN_PREFIX} ${i + 1}`,
      }),
      "Creating a song"
    );
    const pair = ok(admin(token, "POST", "/v1/pairs/find-or-create", { partner_id: partner.id }), "Creating a pair");
    ok(
      admin(token, "POST", "/v1/event-song-submissions", { event_id: event.id, song_id: song.id }),
      "Submitting a song"
    );
    entities.push({ pairId: pair.id, songId: song.id });
    if ((i + 1) % 50 === 0) console.log(`setup: ${i + 1} of ${CFG.rushCheckins} check-in entities ready`);
  }

  // Last, so the window opens when the rush scenario starts: the scenarios'
  // clock starts as setup returns. The floor trial starts half an hour after
  // check-in opens, as at an event.
  const opensAt = Date.now() + CFG.rushAt * 1000;
  const session = ok(
    admin(token, "POST", "/v1/sessions", {
      event_id: event.id,
      name: `${RUN_PREFIX} session`,
      checkin_opens_at: opensAt,
      floor_trial_starts_at: opensAt + 30 * 60000,
      floor_trial_ends_at: opensAt + 3 * 3600000,
      divisions: [{ division_name: DIVISION, is_priority: false }],
    }),
    "Creating the session"
  );
  console.log(
    `setup: ${Math.round((Date.now() - started) / 1000)} s; session ${session.id}, check-in opens ${new Date(opensAt).toISOString()}`
  );

  return {
    meId: me.id,
    eventId: event.id,
    sessionId: session.id,
    opensAt,
    entities,
    users: {
      admin: { token: users.admin.token, sessionId: users.admin.sessionId },
      dancer: { token: users.dancer.token, sessionId: users.dancer.sessionId },
      staff: { token: users.staff.token, sessionId: users.staff.sessionId },
    },
  };
}

export function teardown(data) {
  // Cloudflare may still be blocking the address after the rush.
  sleep(11);
  try {
    sweep(data.users.admin.token, data.meId);
  } finally {
    for (const u of Object.values(data.users)) {
      try {
        clerk("POST", `/sessions/${encodeURIComponent(u.sessionId)}/revoke`);
      } catch (e) {
        console.warn(String(e));
      }
    }
  }
}
