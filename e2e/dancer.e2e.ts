import { e2eConfig } from "./env";
import { Api, expect, RUN_ID, signIn, test } from "./fixtures";

/**
 * A dancer's floor trial day, through the screens they use: upload a song on
 * Add Song, enter it in the event on Event submissions, check in on the
 * session page, see their place in line there and on the public queue, then
 * withdraw from My Content and see the entry gone.
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
const ROUTINE = `${PREFIX} ${RUN_ID}`;
const PARTNER_FIRST = "E2E";
const PARTNER_LAST = `Dancer${RUN_ID}`;
/** The API answers the last chunk at once and builds the song (tag, Drive
 * upload) afterwards. */
const BUILD_TIMEOUT_MS = 60_000;

let api: Api;
let eventId: string | undefined;
let sessionId: string;
let partnerId: string | undefined;
let songId: string | undefined;

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

/**
 * A tenth of a second of silence as a WAV file (8 kHz, mono, 8-bit), built
 * here so the test needs no fixture on disk. The API recognises WAV by its
 * RIFF/WAVE header and tags it before the Drive upload, so the header has to
 * be a real one; the contract suite's upload already covers MP3.
 */
function silentWav(): Buffer {
  const samples = 800;
  const wav = Buffer.alloc(44 + samples, 0x80); // 0x80 is silence at 8 bits
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + samples, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16); // fmt chunk size
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(8000, 24); // sample rate
  wav.writeUInt32LE(8000, 28); // byte rate
  wav.writeUInt16LE(1, 32); // block align
  wav.writeUInt16LE(8, 34); // bits per sample
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(samples, 40);
  return wav;
}

interface Song {
  id: string;
  routine_name: string | null;
  processed_filename: string | null;
  drive_file_id: string | null;
}

/** Remove what an earlier run of this file left behind: events first (they
 * take their sessions, check-ins and song submissions), then the songs those
 * held, then the partner whose pair they used. */
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
    if (p.first_name === PARTNER_FIRST && p.last_name.startsWith("Dancer")) {
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
  if (songId) await api.call("DELETE", `/v1/songs/${songId}`).catch(() => undefined);
  if (partnerId) await api.call("DELETE", `/v1/partners/${partnerId}`).catch(() => undefined);
  await api.end();
});

test("a dancer uploads a song, enters it, checks in, sees their place, and withdraws", async ({ page, browser }) => {
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

  // The pages name a song by its processed filename once the API has built
  // it, and by its routine name until then. Waiting for the build makes the
  // name the test looks for stable, and gives the event copy a file to copy.
  // The API removes the song again if the build fails, so a song that
  // appears and then vanishes means Drive refused it.
  let label = "";
  await test.step("the API builds the song and uploads it to Google Drive", async () => {
    const deadline = Date.now() + BUILD_TIMEOUT_MS;
    for (;;) {
      const song = (await api.call<Song[]>("GET", "/v1/songs")).find((s) => s.routine_name === ROUTINE);
      if (song) songId = song.id;
      else if (songId) throw new Error("The API removed the uploaded song: its build or Google Drive upload failed.");
      if (song?.drive_file_id && song.processed_filename) {
        label = song.processed_filename;
        break;
      }
      if (Date.now() > deadline) throw new Error(`The song had no Google Drive file after ${BUILD_TIMEOUT_MS / 1000}s.`);
      await page.waitForTimeout(2_000);
    }
    expect(label).toMatch(/\.wav$/);
  });

  await test.step("enter the song in the event", async () => {
    await page.goto("/event-submissions");
    await page.getByRole("combobox", { name: "Event" }).click();
    await page.getByRole("option", { name: EVENT_NAME }).click();
    // The row holding the song's name and its own Add button: the innermost
    // element that has both.
    const row = page
      .locator("div")
      .filter({ hasText: label })
      .filter({ has: page.getByRole("button", { name: "Add", exact: true }) })
      .last();
    await row.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Song added to event.")).toBeVisible();
    await expect(
      page
        .locator("div")
        .filter({ hasText: label })
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
      // The check-in card naming the song and holding its own Withdraw button.
      const entry = page
        .locator("div")
        .filter({ hasText: ROUTINE })
        .filter({ has: page.getByRole("button", { name: "Withdraw from queue" }) })
        .last();
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
});
