import { formatSessionTitle } from "../src/lib/sessionFormat";
import { Api, expect, expectApiReachable, RUN_ID, signIn, test } from "./fixtures";

/**
 * Floor trial day, through the screens people use: the public session page
 * shows the queue, and the manager runs it. The event, session and check-ins
 * are set up through the API as the test user (an admin), and removed after.
 */
const DIVISION = "Classic";
const TIMEZONE = "America/Chicago";
const LEADER_A = `E2E${RUN_ID}A`;
const LEADER_B = `E2E${RUN_ID}B`;

let api: Api;
let eventId: string;
let session: { id: string; floor_trial_starts_at: number };

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

test.beforeAll(async () => {
  api = await Api.start();
  // Yesterday through tomorrow: the session opens an hour ago and runs two
  // hours on, which can cross midnight either way.
  const event = await api.call<{ id: string }>("POST", "/v1/events", {
    name: `E2E Suite ${RUN_ID}`,
    start_date: dateIn(TIMEZONE, -1),
    end_date: dateIn(TIMEZONE, 1),
    timezone: TIMEZONE,
  });
  eventId = event.id;
  const now = Date.now();
  // Under way already, with one slot per queue, so the API's scheduler moves
  // the first check-in to Active on its next tick.
  session = await api.call("POST", "/v1/sessions", {
    event_id: eventId,
    name: `E2E ${RUN_ID}`,
    checkin_opens_at: now - 3_600_000,
    floor_trial_starts_at: now - 60_000,
    floor_trial_ends_at: now + 7_200_000,
    active_priority_max: 1,
    active_non_priority_max: 1,
    divisions: [{ division_name: DIVISION, is_priority: false }],
  });
  for (const leader of [LEADER_A, LEADER_B]) {
    await api.call("POST", "/v1/admin/checkins", {
      sessionId: session.id,
      divisionName: DIVISION,
      leaderFirstName: "Lead",
      leaderLastName: leader,
      followerFirstName: "Follow",
      followerLastName: leader,
      notes: `E2E Suite ${RUN_ID}`,
    });
  }
});

test.afterAll(async () => {
  if (!api) return;
  // Deleting the event takes its session, check-ins and queue entries.
  if (eventId) await api.call("DELETE", `/v1/events/${eventId}`).catch(() => undefined);
  // Injected check-ins leave stub dancers behind; this removes them. It
  // clears every injection, which is safe only because this suite and the
  // contract suite never run at once (they share a concurrency group).
  await api.call("DELETE", "/v1/admin/checkins/test").catch(() => undefined);
  await api.end();
});

test("the public session page shows everyone in the queue", async ({ page }) => {
  await page.goto(`/sessions/${session.id}`);
  await expectApiReachable(page);
  await expect(page.getByText(LEADER_A).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(LEADER_B).first()).toBeVisible({ timeout: 60_000 });
});

test("the manager runs the queue: complete the active run, the next one comes on", async ({ page }) => {
  await signIn(page, api.session.user.email);
  await page.goto("/manager/active-sessions");
  await page.getByRole("radio", { name: formatSessionTitle(session, TIMEZONE) }).click();

  // The entry card holding a leader's name and the "Run complete" button:
  // the innermost element that has both.
  const activeEntry = (leader: string) =>
    page
      .locator("div")
      .filter({ hasText: leader })
      .filter({ has: page.getByRole("button", { name: "Run complete" }) })
      .last();

  // The scheduler ticks every 30 s and the page refreshes every 8 s.
  await expect(activeEntry(LEADER_A)).toBeVisible({ timeout: 90_000 });
  await activeEntry(LEADER_A).getByRole("button", { name: "Run complete" }).click();

  await expect(activeEntry(LEADER_A)).toHaveCount(0, { timeout: 30_000 });
  await expect(activeEntry(LEADER_B)).toBeVisible({ timeout: 90_000 });

  const runs = await api.call<unknown[]>("GET", `/v1/runs?session_id=${encodeURIComponent(session.id)}`);
  expect(runs).toHaveLength(1);
});
