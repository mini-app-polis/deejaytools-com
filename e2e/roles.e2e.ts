import { e2eConfig } from "./env";
import {
  Api,
  dateIn,
  expect,
  expectSentHome,
  RUN_ID,
  signIn,
  silentWav,
  test,
  waitForSongBuild,
  type Song,
} from "./fixtures";

/**
 * The site as people other than an admin see it. Two plain users sign in
 * beside the admin test user:
 *
 *   - the dancer (CONTRACT_DANCER_USER_ID), linked to a partner row in the
 *     admin's address book. That row is made once by hand — no endpoint sets
 *     a partner's link — and kept: see "Linked partner for the test suites"
 *     in docs/DEPLOYMENT.md. The dancer is refused the admin pages, and sees
 *     the admin's song, its submission and its check-in as shared with them,
 *     without the controls only the owner has;
 *   - the staff member (CONTRACT_STAFF_USER_ID), granted coordinator, then
 *     DJ, then event manager on an event, who finds it on My events and
 *     opens each portal, and is still refused the admin pages.
 *
 * Everything is set up through the API as the admin, and removed after —
 * except the linked partner row.
 */
const DIVISION = "Classic";
const TIMEZONE = "America/Chicago";
/** Everything this file creates is named from here, so a run that died can
 * be swept by the next. */
const PREFIX = "E2E Roles";
const SHARED_EVENT = `${PREFIX} ${RUN_ID}`;
const STAFF_EVENT = `${PREFIX} Staff ${RUN_ID}`;
const ROUTINE = `${PREFIX} ${RUN_ID}`;

interface Me {
  id: string;
  email: string | null;
  role: string;
}

let admin: Api;
let dancer: Api;
let staff: Api;
let adminMe: Me;
let dancerMe: Me;
let staffMe: Me;
/** The persistent partner row linked to the dancer: never deleted. */
let linkedPartnerId: string;
let sharedEventId: string | undefined;
let staffEventId: string | undefined;
let songId: string | undefined;

/** Remove what an earlier run of this file left behind: events first (they
 * take their sessions, check-ins, song submissions and staff roles), then
 * the songs those held. */
async function sweep(): Promise<void> {
  const events = await admin.call<{ id: string; name: string; created_by: string }[]>("GET", "/v1/events");
  for (const e of events) {
    if (e.name.startsWith(`${PREFIX} `) && e.created_by === adminMe.id) {
      await admin.call("DELETE", `/v1/events/${e.id}`).catch(() => undefined);
    }
  }
  for (const s of await admin.call<Song[]>("GET", "/v1/songs")) {
    if (s.routine_name?.startsWith(`${PREFIX} `)) await admin.call("DELETE", `/v1/songs/${s.id}`).catch(() => undefined);
  }
}

test.beforeAll(async () => {
  const cfg = e2eConfig();
  admin = await Api.start();
  dancer = await Api.start(cfg.dancerUserId);
  staff = await Api.start(cfg.staffUserId);
  // Synced, so each has a users row before a grant or a link names them.
  await dancer.sync();
  await staff.sync();
  adminMe = await admin.call<Me>("GET", "/v1/auth/me");
  dancerMe = await dancer.call<Me>("GET", "/v1/auth/me");
  staffMe = await staff.call<Me>("GET", "/v1/auth/me");
  for (const u of [dancerMe, staffMe]) {
    if (u.role !== "user") throw new Error(`Test user ${u.email} must be a plain user, not ${u.role}.`);
  }
  await sweep();

  const partners = await admin.call<{ id: string; linked_user_id: string | null }[]>("GET", "/v1/partners");
  const linked = partners.find((p) => p.linked_user_id === dancerMe.id);
  if (!linked) {
    throw new Error(
      `No partner in ${adminMe.email}'s address book is linked to ${dancerMe.email} (${dancerMe.id}). ` +
        'Create it once in the dev database: see "Linked partner for the test suites" in docs/DEPLOYMENT.md.'
    );
  }
  linkedPartnerId = linked.id;
});

test.afterAll(async () => {
  // The events take their sessions, check-ins, submissions and staff roles;
  // the song, with no live check-in left, can then go. The linked partner
  // stays.
  if (admin) {
    if (sharedEventId) await admin.call("DELETE", `/v1/events/${sharedEventId}`).catch(() => undefined);
    if (staffEventId) await admin.call("DELETE", `/v1/events/${staffEventId}`).catch(() => undefined);
    if (songId) await admin.call("DELETE", `/v1/songs/${songId}`).catch(() => undefined);
    await admin.end();
  }
  await dancer?.end();
  await staff?.end();
});

test("a plain user is sent home from the admin and manager pages", async ({ page }) => {
  await signIn(page, dancer.session.user.email);
  for (const path of ["/admin", "/admin/events", "/manager", "/manager/active-sessions"]) {
    await page.goto(path);
    await expectSentHome(page);
  }
});

test("a linked partner sees the shared song, its submission and its check-in, without the owner's controls", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await test.step("the admin uploads a song with the linked partner, enters it and checks in", async () => {
    // Yesterday through tomorrow, and a session open for check-in with no
    // Active slots, as in the dancer suite: the entry stays in line.
    const event = await admin.call<{ id: string }>("POST", "/v1/events", {
      name: SHARED_EVENT,
      start_date: dateIn(TIMEZONE, -1),
      end_date: dateIn(TIMEZONE, 1),
      timezone: TIMEZONE,
    });
    sharedEventId = event.id;
    const now = Date.now();
    const session = await admin.call<{ id: string }>("POST", "/v1/sessions", {
      event_id: sharedEventId,
      name: SHARED_EVENT,
      checkin_opens_at: now - 3_600_000,
      floor_trial_starts_at: now - 60_000,
      floor_trial_ends_at: now + 7_200_000,
      active_priority_max: 0,
      active_non_priority_max: 0,
      divisions: [{ division_name: DIVISION, is_priority: false }],
    });
    await admin.uploadSong(
      { name: "e2e-roles.wav", mimeType: "audio/wav", buffer: silentWav() },
      { division: DIVISION, routine_name: ROUTINE, partner_id: linkedPartnerId }
    );
    const song = await waitForSongBuild(admin, page, ROUTINE);
    songId = song.id;
    await admin.call("POST", "/v1/event-song-submissions", { event_id: sharedEventId, song_id: songId });
    // The pair the admin leads with the linked partner: the one a check-in
    // with the shared song is made as.
    const pair = await admin.call<{ id: string }>("POST", "/v1/pairs/find-or-create", { partner_id: linkedPartnerId });
    await admin.call("POST", "/v1/checkins", {
      sessionId: session.id,
      divisionName: DIVISION,
      entityPairId: pair.id,
      songId,
    });
    // What the pages below draw on, read as the dancer.
    const shared = (await dancer.call<(Song & { shared_with_me: boolean })[]>("GET", "/v1/songs")).find(
      (s) => s.id === songId
    );
    expect(shared?.shared_with_me).toBe(true);
  });

  await signIn(page, dancer.session.user.email);

  await test.step("My Content shows the song as shared, with no Delete", async () => {
    await page.goto("/my-content");
    await expect(page.getByRole("heading", { level: 1, name: "My Content" })).toBeVisible();
    // The song card naming the routine and carrying the badge.
    const card = page
      .locator("div")
      .filter({ hasText: ROUTINE })
      .filter({ has: page.getByText("Shared with you", { exact: true }) })
      .last();
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  });

  await test.step("My Content shows the check-in, which only the partner may withdraw", async () => {
    // The check-in naming the song, as an item of the Check-ins list.
    const entry = page
      .getByRole("list", { name: "Check-ins" })
      .getByRole("listitem")
      .filter({ hasText: ROUTINE });
    await expect(entry).toContainText("Only they can withdraw it.");
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("This entry is #1 in line");
    await expect(entry.getByRole("button", { name: "Withdraw from queue" })).toHaveCount(0);
  });

  await test.step("My Content lists the submission under its event", async () => {
    const card = page
      .locator("div")
      .filter({ hasText: SHARED_EVENT })
      .filter({ has: page.getByRole("link", { name: "Edit songs", exact: true }) })
      .last();
    await expect(card).toContainText(ROUTINE);
  });

  await test.step("My Songs shows the song as shared, with no Delete", async () => {
    await page.goto("/songs");
    await expect(page.getByRole("heading", { level: 1, name: "My Songs" })).toBeVisible();
    const card = page
      .locator("div")
      .filter({ hasText: ROUTINE })
      .filter({ has: page.getByText("Shared with you", { exact: true }) })
      .last();
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  });

  await test.step("the event's submission page lists the submission with no Remove", async () => {
    await page.goto(`/event-submissions/${sharedEventId}`);
    await expect(page.getByRole("heading", { name: SHARED_EVENT })).toBeVisible();
    const submissions = page
      .locator("div")
      .filter({ has: page.getByText("Your submissions", { exact: true }) })
      .last();
    await expect(submissions).toContainText(ROUTINE);
    await expect(submissions.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
  });
});

test("a staff member finds their event on My events and opens each portal it allows", async ({ page }) => {
  test.setTimeout(180_000);
  const event = await admin.call<{ id: string }>("POST", "/v1/events", {
    name: STAFF_EVENT,
    start_date: dateIn(TIMEZONE, 7),
    end_date: dateIn(TIMEZONE, 8),
    timezone: TIMEZONE,
  });
  staffEventId = event.id;
  const base = `/events/${encodeURIComponent(staffEventId)}`;
  const staffPath = (role: string) => `/v1/events/${staffEventId}/staff/${staffMe.id}/${role}`;
  // The My events card, not the nav bar's staff menu, which lists the event too.
  const card = () => page.getByRole("main").getByRole("link").filter({ hasText: STAFF_EVENT });
  const portalHeading = () => page.getByRole("heading", { level: 1, name: STAFF_EVENT });

  await admin.call("PUT", staffPath("coordinator"));
  await signIn(page, staff.session.user.email);

  await test.step("as coordinator: My events opens the coordinator portal, and only that", async () => {
    await page.goto("/my-events");
    await expect(page.getByRole("heading", { level: 1, name: "My events" })).toBeVisible();
    await expect(card()).toContainText("Coordinator portal");
    await card().click();
    await expect(page).toHaveURL(new RegExp(`${base}/coordinator$`));
    await expect(portalHeading()).toBeVisible();
    await page.goto(`${base}/dj`);
    await expectSentHome(page);
  });

  // DJ and event manager each queue a share of the event's Drive folder:
  // revoked as soon as they are checked, the share finds the role gone and
  // does nothing.
  await test.step("as DJ: My events opens the DJ portal", async () => {
    await admin.call("PUT", staffPath("dj"));
    try {
      await page.goto("/my-events");
      await expect(card()).toContainText("DJ portal");
      await card().click();
      // The bare portal URL lands on its first section.
      await expect(page).toHaveURL(new RegExp(`${base}/dj/queue$`));
      await expect(portalHeading()).toBeVisible();
      const sections = page.getByRole("navigation", { name: "DJ sections" });
      await sections.getByRole("link", { name: "Run history", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${base}/dj/runs$`));
      await page.goto(`${base}/manage`);
      await expectSentHome(page);
    } finally {
      await admin.call("DELETE", staffPath("dj"));
    }
  });

  await test.step("as event manager: My events opens the manage portal, staff section included", async () => {
    await admin.call("PUT", staffPath("event-manager"));
    try {
      await page.goto("/my-events");
      await expect(card()).toContainText("Event manager portal");
      await card().click();
      await expect(page).toHaveURL(new RegExp(`${base}/manage/queue$`));
      await expect(portalHeading()).toBeVisible();
      const sections = page.getByRole("navigation", { name: "Event manager sections" });
      await sections.getByRole("link", { name: "Staff", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${base}/manage/staff$`));
      // A richer role admits the poorer portals too.
      await page.goto(`${base}/coordinator`);
      await expect(portalHeading()).toBeVisible();
    } finally {
      await admin.call("DELETE", staffPath("event-manager"));
    }
  });

  await test.step("still sent home from the admin and manager pages", async () => {
    for (const path of ["/admin", "/manager"]) {
      await page.goto(path);
      await expectSentHome(page);
    }
  });
});
