import { songLabel } from "../src/lib/songLabel";
import { e2eConfig } from "./env";
import { Api, dateIn, expect, RUN_ID, signIn, silentWav, test, waitForSongBuild, type Song } from "./fixtures";

/**
 * A dancer's floor trial day, through the screens they use: upload a song on
 * Add Song, enter it in the event on Event submissions, check in on the
 * session page, see their place in line there and on the public queue, then
 * withdraw from My Content and see the entry gone. Then, with the same song:
 * reach the event's page from My Content and take the song back out, and
 * enter it in The Open choosing a round, which only The Open allows.
 *
 * Only what an organizer would have done beforehand is set up through the
 * API as the test user (an admin): the event, its session, and a partner to
 * dance with — the upload form needs one to attach the song to, and checking
 * in needs the pair the song's partner makes with the dancer. Everything is
 * removed after, the song included.
 */
const DIVISION = "Classic";
const TIMEZONE = "America/Chicago";
/** Everything this file creates is named from here, so a run that died can
 * be swept by the next. */
const PREFIX = "E2E Dancer";
const EVENT_NAME = `${PREFIX} ${RUN_ID}`;
/** The API and site treat an event as The Open by a name that starts with it. */
const OPEN_PREFIX = `The Open ${PREFIX}`;
const OPEN_EVENT_NAME = `${OPEN_PREFIX} ${RUN_ID}`;
const ROUTINE = `${PREFIX} ${RUN_ID}`;
const PARTNER_FIRST = "E2E";
const PARTNER_LAST = `Dancer${RUN_ID}`;

let api: Api;
let eventId: string | undefined;
let openEventId: string | undefined;
let sessionId: string;
let partnerId: string | undefined;
let songId: string | undefined;

/** Remove what an earlier run of this file left behind: events first (they
 * take their sessions, check-ins and song submissions), then the songs those
 * held, then the partner whose pair they used. */
async function sweep(): Promise<void> {
  const me = await api.call<{ id: string }>("GET", "/v1/auth/me");
  const events = await api.call<{ id: string; name: string; created_by: string }[]>("GET", "/v1/events");
  for (const e of events) {
    const ours = e.name.startsWith(`${PREFIX} `) || e.name.startsWith(`${OPEN_PREFIX} `);
    if (ours && e.created_by === me.id) {
      await api.call("DELETE", `/v1/events/${e.id}`).catch(() => undefined);
    }
  }
  for (const s of await api.call<Song[]>("GET", "/v1/songs")) {
    if (s.routine_name?.startsWith(`${PREFIX} `)) await api.call("DELETE", `/v1/songs/${s.id}`).catch(() => undefined);
  }
  // Never the partner linked to the dancer test user (roles.e2e.ts): that
  // row is made once by hand and kept.
  const partners = await api.call<{ id: string; first_name: string; last_name: string; linked_user_id: string | null }[]>(
    "GET",
    "/v1/partners"
  );
  for (const p of partners) {
    if (p.first_name === PARTNER_FIRST && p.last_name.startsWith("Dancer") && !p.linked_user_id) {
      await api.call("DELETE", `/v1/partners/${p.id}`).catch(() => undefined);
    }
  }
}

test.beforeAll(async () => {
  api = await Api.start();
  await sweep();
  // Yesterday through tomorrow: the session opens an hour ago and runs two
  // hours on, which can cross midnight either way.
  const event = await api.call<{ id: string; start_date: string }>("POST", "/v1/events", {
    name: EVENT_NAME,
    start_date: dateIn(TIMEZONE, -1),
    end_date: dateIn(TIMEZONE, 1),
    timezone: TIMEZONE,
  });
  eventId = event.id;
  const now = Date.now();
  // Check-in open and the floor trial under way, but no Active slots: the
  // scheduler never moves the dancer on, so they stay first in the standard
  // queue for as long as the test looks.
  const session = await api.call<{ id: string }>("POST", "/v1/sessions", {
    event_id: eventId,
    name: EVENT_NAME,
    checkin_opens_at: now - 3_600_000,
    floor_trial_starts_at: now - 60_000,
    floor_trial_ends_at: now + 7_200_000,
    active_priority_max: 0,
    active_non_priority_max: 0,
    divisions: [{ division_name: DIVISION, is_priority: false }],
  });
  sessionId = session.id;
  // A month out, so it is upcoming and accepting songs; it needs no session.
  const openEvent = await api.call<{ id: string }>("POST", "/v1/events", {
    name: OPEN_EVENT_NAME,
    start_date: dateIn(TIMEZONE, 30),
    end_date: dateIn(TIMEZONE, 32),
    timezone: TIMEZONE,
  });
  openEventId = openEvent.id;
  const partner = await api.call<{ id: string }>("POST", "/v1/partners", {
    first_name: PARTNER_FIRST,
    last_name: PARTNER_LAST,
    partner_role: "follower",
  });
  partnerId = partner.id;
});

test.afterAll(async () => {
  if (!api) return;
  // In dependency order. Deleting the event takes the session with its
  // check-ins and queue entries, and the song submission, whose Drive copy
  // the API then trashes; a song with no live check-in can then go (its own
  // Drive file is trashed too), and last the partner, whose pair no longer
  // has check-ins and so is deleted with it rather than kept.
  if (eventId) await api.call("DELETE", `/v1/events/${eventId}`).catch(() => undefined);
  if (openEventId) await api.call("DELETE", `/v1/events/${openEventId}`).catch(() => undefined);
  if (songId) await api.call("DELETE", `/v1/songs/${songId}`).catch(() => undefined);
  if (partnerId) await api.call("DELETE", `/v1/partners/${partnerId}`).catch(() => undefined);
  await api.end();
});

test("a dancer uploads a song, enters it, checks in, sees their place, withdraws, and manages submissions", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await signIn(page, api.session.user.email);

  await test.step("upload a song on Add Song", async () => {
    await page.goto("/songs/add");
    await expect(page.getByRole("heading", { level: 1, name: "Add Song" })).toBeVisible();
    // "Upload for myself" is the page's default mode.
    await page
      .getByRole("radiogroup", { name: "Partner" })
      .getByRole("radio", { name: `${PARTNER_FIRST} ${PARTNER_LAST}`, exact: true })
      .click();
    await page.getByRole("radiogroup", { name: "Division" }).getByRole("radio", { name: DIVISION, exact: true }).click();
    await page.getByLabel("Routine / Song name").fill(ROUTINE);
    await page.getByLabel("Audio file").setInputFiles({
      name: "e2e-dancer.wav",
      mimeType: "audio/wav",
      buffer: silentWav(),
    });
    await page.getByRole("button", { name: "Upload song" }).click();
    await expect(page.getByText("Song uploaded successfully.")).toBeVisible({ timeout: 30_000 });
  });

  // The pages name a song by its pieces, and the version only arrives with
  // the build. Waiting for the build makes the name the test looks for
  // stable, and gives the event copy a file to copy.
  // The API removes the song again if the build fails, so a song that
  // appears and then vanishes means Drive refused it.
  let label = "";
  await test.step("the API builds the song and uploads it to Google Drive", async () => {
    const song = await waitForSongBuild(api, page, ROUTINE);
    songId = song.id;
    expect(song.processed_filename).toMatch(/\.wav$/);
    label = songLabel(song);
    expect(label).toContain(ROUTINE);
    expect(label).not.toMatch(/\b20\d\d\b/);
  });

  await test.step("enter the song in the event", async () => {
    await page.goto("/event-submissions");
    await page.getByRole("combobox", { name: "Event" }).click();
    // Anchored: option names match on substrings, and the test Open event's
    // name ("The Open E2E Dancer …") contains this one.
    await page.getByRole("option", { name: new RegExp(`^${EVENT_NAME} · `) }).click();
    // Choosing the event opens its page: pick the song, whose own division
    // fills the Division field, and submit it.
    await expect(page.getByRole("heading", { name: EVENT_NAME })).toBeVisible();
    await page.getByRole("combobox", { name: "Song", exact: true }).click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Division", exact: true })).toContainText(DIVISION);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText(`Song added to ${EVENT_NAME}.`)).toBeVisible();
    // The submission row naming the song and holding its own Remove button.
    // Submissions show the API's structured label ("Partnership - Division -
    // Routine - vNN"), so match on the routine.
    await expect(
      page
        .locator("div")
        .filter({ hasText: ROUTINE })
        .filter({ has: page.getByRole("button", { name: "Remove", exact: true }) })
        .last()
    ).toBeVisible();
  });

  await test.step("check in on the session page", async () => {
    await page.goto(`/sessions/${sessionId}`);
    // Rendered above and below the queues; enabled once the page knows the
    // check-in window is open and a song is entered in the event.
    const checkIn = page.getByRole("button", { name: "Check in", exact: true }).first();
    await expect(checkIn).toBeEnabled();
    await checkIn.click();

    const form = page.locator("form").filter({ has: page.getByRole("radiogroup", { name: "Song" }) });
    await form.getByRole("radiogroup", { name: "Song" }).getByRole("radio", { name: label, exact: true }).click();
    // The division comes from the song when the session runs it.
    await expect(
      form.getByRole("radiogroup", { name: "Division" }).getByRole("radio", { name: DIVISION, exact: true })
    ).toHaveAttribute("aria-checked", "true");
    await form.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(page.getByText("Checked in", { exact: true })).toBeVisible();
    // First in line, in the standard queue (the division is not a priority one).
    await expect(page.getByText("#1 in queue").first()).toBeVisible();
    await expect(page.getByText(`(standard, ${DIVISION})`).first()).toBeVisible();
  });

  // Anyone can watch a session's queue, signed in or not.
  const visitor = await browser.newPage({ baseURL: e2eConfig().baseUrl });
  try {
    await test.step("the public session page shows the dancer in the queue", async () => {
      await visitor.goto(`/sessions/${sessionId}`);
      await expect(visitor.getByText(PARTNER_LAST).first()).toBeVisible();
    });

    await test.step("withdraw from My Content", async () => {
      await page.goto("/my-content");
      await expect(page.getByRole("heading", { name: "Check-ins" })).toBeVisible();
      // The check-in naming the song, as an item of the Check-ins list: a
      // looser match also finds the page's containers whenever another
      // check-in's Withdraw button is on the page.
      const entry = page
        .getByRole("list", { name: "Check-ins" })
        .getByRole("listitem")
        .filter({ hasText: ROUTINE });
      await expect(entry).toContainText("This entry is #1 in line");
      await expect(entry).toContainText("Standard queue");
      await entry.getByRole("button", { name: "Withdraw from queue" }).click();
      await page
        .getByRole("dialog", { name: "Withdraw from queue?" })
        .getByRole("button", { name: "Withdraw", exact: true })
        .click();
      await expect(page.getByText("Withdrawn from queue.")).toBeVisible();
      await expect(entry).toHaveCount(0);
    });

    await test.step("the entry is gone from the public queue", async () => {
      await visitor.reload();
      await expect(visitor.getByText("Standard queue is empty.")).toBeVisible();
      await expect(visitor.getByText(PARTNER_LAST)).toHaveCount(0);
    });
  } finally {
    await visitor.close();
  }

  const mine = await api.call<{ sessionId: string }[]>("GET", "/v1/checkins/mine");
  expect(mine.filter((c) => c.sessionId === sessionId)).toEqual([]);

  // The submission row naming the song and holding its own Remove button.
  // Submissions show the API's structured label, so match on the routine.
  const submissionRow = () =>
    page
      .locator("div")
      .filter({ hasText: ROUTINE })
      .filter({ has: page.getByRole("button", { name: "Remove", exact: true }) })
      .last();

  await test.step("My Content's Edit songs opens the event's submission page", async () => {
    await page.goto("/my-content");
    // The event card naming the event and holding its own Edit songs link.
    const card = page
      .locator("div")
      .filter({ hasText: EVENT_NAME, hasNotText: OPEN_EVENT_NAME })
      .filter({ has: page.getByRole("link", { name: "Edit songs", exact: true }) })
      .last();
    await card.getByRole("link", { name: "Edit songs", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/event-submissions/${eventId}$`));
    await expect(page.getByRole("heading", { name: EVENT_NAME })).toBeVisible();
  });

  await test.step("take the song back out of the event", async () => {
    await submissionRow().getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText(`Song removed from ${EVENT_NAME}.`)).toBeVisible();
    await expect(submissionRow()).toHaveCount(0);
    // Back in the picker, ready to enter again.
    await page.getByRole("combobox", { name: "Song", exact: true }).click();
    await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    const left = await api.call<unknown[]>(
      "GET",
      `/v1/event-song-submissions?event_id=${encodeURIComponent(eventId!)}`
    );
    expect(left).toEqual([]);
  });

  await test.step("My Content offers a shortcut to The Open", async () => {
    await page.goto("/my-content");
    // Another Open event on dev sends the shortcut to the picker instead.
    await expect(page.getByRole("link", { name: "Submit to The Open", exact: true })).toHaveAttribute(
      "href",
      new RegExp(`^/(event-submissions/${openEventId}|open-submissions)$`)
    );
  });

  await test.step("enter the song in The Open for prelims only", async () => {
    await page.goto(`/event-submissions/${openEventId}`);
    await expect(page.getByRole("heading", { name: OPEN_EVENT_NAME })).toBeVisible();
    await page.getByRole("combobox", { name: "Song", exact: true }).click();
    await page.getByRole("option", { name: label, exact: true }).click();
    // Classic at The Open may split its rounds; the choice starts at both.
    await expect(page.getByRole("radio", { name: "Prelims & Finals" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Prelims Only" }).click();
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText(`Song added to ${OPEN_EVENT_NAME}.`)).toBeVisible();
    await expect(submissionRow()).toContainText(`Division ${DIVISION} · Prelims only`);
    const entered = await api.call<{ song_id: string; division: string | null; round: string }[]>(
      "GET",
      `/v1/event-song-submissions?event_id=${encodeURIComponent(openEventId!)}`
    );
    expect(entered).toEqual([expect.objectContaining({ song_id: songId, division: DIVISION, round: "prelims_only" })]);
  });
});
