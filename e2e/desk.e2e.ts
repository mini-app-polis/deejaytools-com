import { formatSessionTitle } from "../src/lib/sessionFormat";
import { Api, dateIn, expect, RUN_ID, signIn, silentWav, test, waitForSongBuild, type Song } from "./fixtures";

/**
 * The manager's desk on a floor trial day, through the Manager screens: find
 * the dancer and upload their song on Upload For, check them in on CheckIn
 * For, then on Active Sessions move the entry ahead of them down and
 * withdraw them.
 *
 * The suite has one account, so the test user is both the manager and the
 * dancer. Set up through the API beforehand, as an organizer would have: the
 * event and its session, a partner for the dancer, and one other entry
 * already in line. Entering the song in the event is the dancer's step (the
 * dancer suite covers its screen), so it is done through the API here.
 */
const DIVISION = "Classic";
const TIMEZONE = "America/Chicago";
/** Everything this file creates is named from here, so a run that died can
 * be swept by the next. */
const PREFIX = "E2E Desk";
const EVENT_NAME = `${PREFIX} ${RUN_ID}`;
const ROUTINE = `${PREFIX} ${RUN_ID}`;
const PARTNER_FIRST = "E2E";
const PARTNER_LAST = `Desk${RUN_ID}`;
/** The entry already in line ahead of the dancer. */
const AHEAD_LAST = `E2E${RUN_ID}Ahead`;

let api: Api;
let eventId: string | undefined;
let session: { id: string; floor_trial_starts_at: number };
let partnerId: string | undefined;
let songId: string | undefined;

interface QueueRow {
  queueEntryId: string;
  position: number;
  entityLabel: string;
}

/** The standard queue's entries, in line order. */
const standardQueue = async () =>
  (await api.call<QueueRow[]>("GET", `/v1/queue/${encodeURIComponent(session.id)}/non-priority`))
    .slice()
    .sort((a, b) => a.position - b.position);

/** Remove what an earlier run of this file left behind, as the dancer suite
 * does: events (with their sessions, check-ins and submissions), then songs,
 * then the partner. */
async function sweep(): Promise<void> {
  const me = await api.call<{ id: string }>("GET", "/v1/auth/me");
  const events = await api.call<{ id: string; name: string; created_by: string }[]>("GET", "/v1/events");
  for (const e of events) {
    if (e.name.startsWith(`${PREFIX} `) && e.created_by === me.id) {
      await api.call("DELETE", `/v1/events/${e.id}`).catch(() => undefined);
    }
  }
  for (const s of await api.call<Song[]>("GET", "/v1/songs")) {
    if (s.routine_name?.startsWith(`${PREFIX} `)) await api.call("DELETE", `/v1/songs/${s.id}`).catch(() => undefined);
  }
  const partners = await api.call<{ id: string; first_name: string; last_name: string }[]>("GET", "/v1/partners");
  for (const p of partners) {
    if (p.first_name === PARTNER_FIRST && p.last_name.startsWith("Desk")) {
      await api.call("DELETE", `/v1/partners/${p.id}`).catch(() => undefined);
    }
  }
}

test.beforeAll(async () => {
  api = await Api.start();
  await sweep();
  // Yesterday through tomorrow: the session opens an hour ago and runs two
  // hours on, which can cross midnight either way.
  const event = await api.call<{ id: string }>("POST", "/v1/events", {
    name: EVENT_NAME,
    start_date: dateIn(TIMEZONE, -1),
    end_date: dateIn(TIMEZONE, 1),
    timezone: TIMEZONE,
  });
  eventId = event.id;
  const now = Date.now();
  // No Active slots: the scheduler never moves anyone on, so the standard
  // queue holds still while the manager works it.
  session = await api.call<typeof session>("POST", "/v1/sessions", {
    event_id: eventId,
    name: EVENT_NAME,
    checkin_opens_at: now - 3_600_000,
    floor_trial_starts_at: now - 60_000,
    floor_trial_ends_at: now + 7_200_000,
    active_priority_max: 0,
    active_non_priority_max: 0,
    divisions: [{ division_name: DIVISION, is_priority: false }],
  });
  await api.call("POST", "/v1/admin/checkins", {
    sessionId: session.id,
    divisionName: DIVISION,
    leaderFirstName: "Lead",
    leaderLastName: AHEAD_LAST,
    followerFirstName: "Follow",
    followerLastName: AHEAD_LAST,
    notes: EVENT_NAME,
  });
  const partner = await api.call<{ id: string }>("POST", "/v1/partners", {
    first_name: PARTNER_FIRST,
    last_name: PARTNER_LAST,
    partner_role: "follower",
  });
  partnerId = partner.id;
});

test.afterAll(async () => {
  if (!api) return;
  // As in the dancer suite: the event takes its session, check-ins, queue
  // entries and the submission; then the song, then the partner.
  if (eventId) await api.call("DELETE", `/v1/events/${eventId}`).catch(() => undefined);
  if (songId) await api.call("DELETE", `/v1/songs/${songId}`).catch(() => undefined);
  if (partnerId) await api.call("DELETE", `/v1/partners/${partnerId}`).catch(() => undefined);
  // The injected entry leaves stub dancers behind; this removes them. It
  // clears every injection, which is safe only because the suites that
  // inject never run at once (they share a concurrency group).
  await api.call("DELETE", "/v1/admin/checkins/test").catch(() => undefined);
  await api.end();
});

test("at the desk, a manager uploads a dancer's song, checks them in, and works the queue", async ({ page }) => {
  test.setTimeout(240_000);
  const email = api.session.user.email;
  // The search result for the dancer: an option naming them and their email.
  const dancerResult = () =>
    page.getByRole("option", { name: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first();
  await signIn(page, email);

  await test.step("find the dancer and upload their song on Upload For", async () => {
    await page.goto("/manager/upload-for");
    await page.getByRole("combobox", { name: "User to upload for" }).fill(email);
    await dancerResult().click();
    await expect(page.getByRole("group", { name: "User to upload for" })).toContainText(email);
    await page
      .getByRole("radiogroup", { name: "Partner" })
      .getByRole("radio", { name: `${PARTNER_FIRST} ${PARTNER_LAST}`, exact: true })
      .click();
    await page.getByRole("radiogroup", { name: "Division" }).getByRole("radio", { name: DIVISION, exact: true }).click();
    await page.getByLabel("Routine / Song name").fill(ROUTINE);
    await page.getByLabel("Audio file").setInputFiles({
      name: "e2e-desk.wav",
      mimeType: "audio/wav",
      buffer: silentWav(),
    });
    await page.getByRole("button", { name: "Upload song" }).click();
    await expect(page.getByText("Song uploaded successfully.")).toBeVisible({ timeout: 30_000 });
  });

  await test.step("the song is built and entered in the event", async () => {
    const song = await waitForSongBuild(api, page, ROUTINE);
    songId = song.id;
    await api.call("POST", "/v1/event-song-submissions", { event_id: eventId, song_id: songId });
  });

  await test.step("check the dancer in on CheckIn For", async () => {
    await page.goto("/manager/checkin-for");
    await page.getByRole("combobox", { name: "User to check in" }).fill(email);
    await dancerResult().click();
    await page
      .getByRole("radiogroup", { name: "Session" })
      .getByRole("radio", { name: formatSessionTitle(session, TIMEZONE) })
      .click();
    // Songs are listed by the API's structured label, which names the routine.
    await page.getByRole("radiogroup", { name: "Song" }).getByRole("radio", { name: new RegExp(ROUTINE) }).click();
    await page.getByRole("radiogroup", { name: "Division" }).getByRole("radio", { name: DIVISION, exact: true }).click();
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(page.getByText(/^Checked in /)).toBeVisible();

    const queue = await standardQueue();
    expect(queue.map((r) => r.entityLabel.includes(PARTNER_LAST))).toEqual([false, true]);
  });

  await test.step("on Active Sessions, move the entry ahead down", async () => {
    await page.goto("/manager/active-sessions");
    await page.getByRole("radio", { name: formatSessionTitle(session, TIMEZONE) }).click();
    // The entry card naming the dancer and holding its own buttons.
    const entry = (name: string, button: string) =>
      page
        .locator("div")
        .filter({ hasText: name })
        .filter({ has: page.getByRole("button", { name: button, exact: true }) })
        .last();
    await entry(AHEAD_LAST, "Move down").getByRole("button", { name: "Move down", exact: true }).click();
    await expect
      .poll(async () => (await standardQueue()).map((r) => r.entityLabel.includes(PARTNER_LAST)))
      .toEqual([true, false]);

    await test.step("and withdraw the dancer", async () => {
      await entry(PARTNER_LAST, "Withdraw").getByRole("button", { name: "Withdraw", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Withdraw from the queue?" })
        .getByRole("button", { name: "Withdraw", exact: true })
        .click();
      await expect(entry(PARTNER_LAST, "Withdraw")).toHaveCount(0);
      await expect
        .poll(async () => (await standardQueue()).map((r) => r.entityLabel.includes(AHEAD_LAST)))
        .toEqual([true]);
    });
  });
});
