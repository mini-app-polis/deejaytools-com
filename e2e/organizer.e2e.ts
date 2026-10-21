import { formatSessionTitle } from "../src/lib/sessionFormat";
import { Api, dateIn, expect, RUN_ID, signIn, test } from "./fixtures";

/**
 * An organizer sets up a floor trial day on the Admin screens: creates the
 * event and its session, sees them as dancers will, renames the event, and
 * then removes the session and the event. Everything is done in the UI; the
 * API is only read to check what was saved, and to sweep up after a run
 * that died part-way.
 */
const TIMEZONE = "America/Chicago";
/** Everything this file creates is named from here, so a run that died can
 * be swept by the next. */
const PREFIX = "E2E Organizer";
const EVENT_NAME = `${PREFIX} ${RUN_ID}`;
const RENAMED = `${EVENT_NAME} renamed`;
const DIVISION = "Classic";

interface Event {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  timezone: string;
  created_by: string;
}
interface Session {
  id: string;
  event_id: string | null;
  checkin_opens_at: number;
  floor_trial_starts_at: number;
  floor_trial_ends_at: number;
  event_timezone?: string | null;
  divisions?: { division_name: string; is_priority: boolean }[];
}

let api: Api;
let me: { id: string };

const ourEvents = async () =>
  (await api.call<Event[]>("GET", "/v1/events")).filter(
    (e) => e.name.startsWith(`${PREFIX} `) && e.created_by === me.id
  );

test.beforeAll(async () => {
  api = await Api.start();
  me = await api.call<{ id: string }>("GET", "/v1/auth/me");
  for (const e of await ourEvents()) await api.call("DELETE", `/v1/events/${e.id}`).catch(() => undefined);
});

test.afterAll(async () => {
  if (!api) return;
  // Normally the test has removed both already; this covers a failed run.
  for (const e of await ourEvents().catch(() => [])) {
    await api.call("DELETE", `/v1/events/${e.id}`).catch(() => undefined);
  }
  await api.end();
});

test("an organizer creates an event and its session, renames the event, then removes both", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, api.session.user.email);
  const start = dateIn(TIMEZONE, 7);
  const end = dateIn(TIMEZONE, 8);
  let event!: Event;
  let session!: Session;

  // A row in one of the Admin tables, by the text it shows.
  const row = (text: string) => page.getByRole("row").filter({ hasText: text });

  await test.step("create the event on Admin → Events", async () => {
    await page.goto("/admin/events");
    await page.getByRole("button", { name: "New Event", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New event" });
    await dialog.getByLabel("Name", { exact: true }).fill(EVENT_NAME);
    await dialog.getByLabel("Start date", { exact: true }).fill(start);
    await dialog.getByLabel("End date", { exact: true }).fill(end);
    await dialog.getByLabel("Timezone", { exact: true }).selectOption(TIMEZONE);
    await dialog.getByRole("button", { name: "Create event", exact: true }).click();
    await expect(page.getByText("Event created")).toBeVisible();
    await expect(row(EVENT_NAME)).toBeVisible();

    [event] = await ourEvents();
    expect(event).toMatchObject({ name: EVENT_NAME, start_date: start, end_date: end, timezone: TIMEZONE });
  });

  await test.step("add its session on Admin → Sessions", async () => {
    await page.goto("/admin/sessions");
    await page.getByRole("button", { name: "New Session", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New session" });
    await dialog.getByLabel("Event", { exact: true }).selectOption({ label: EVENT_NAME });
    // Choosing the event fills the date with its first day.
    await expect(dialog.getByLabel("Date", { exact: true })).toHaveValue(start);
    await dialog.getByLabel(/^Start time/).fill("19:00");
    await dialog.getByLabel("Check-in opens", { exact: true }).selectOption("60");
    await dialog.getByLabel("Floor trial duration", { exact: true }).selectOption("120");
    await dialog.getByRole("checkbox", { name: DIVISION, exact: true }).check();
    await dialog.getByRole("button", { name: "Create session", exact: true }).click();
    await expect(page.getByText("Session created")).toBeVisible();

    const sessions = await api.call<Session[]>("GET", `/v1/sessions?event_id=${encodeURIComponent(event.id)}`);
    expect(sessions).toHaveLength(1);
    session = sessions[0]!;
    // Opens an hour before a two-hour floor trial, every division included,
    // and only the one that was ticked counts as priority.
    expect(session.floor_trial_starts_at - session.checkin_opens_at).toBe(3_600_000);
    expect(session.floor_trial_ends_at - session.floor_trial_starts_at).toBe(7_200_000);
    const divisions = session.divisions ?? [];
    expect(divisions.filter((d) => d.is_priority).map((d) => d.division_name)).toEqual([DIVISION]);
    expect(divisions.length).toBeGreaterThan(1);
    expect(formatSessionTitle(session, TIMEZONE)).toContain("7:00 PM");
    await expect(row(formatSessionTitle(session, TIMEZONE))).toBeVisible();
  });

  await test.step("dancers see the event and its session", async () => {
    await page.goto(`/events/${event.id}`);
    await expect(page.getByRole("heading", { name: EVENT_NAME })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(formatSessionTitle(session, TIMEZONE)) }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: formatSessionTitle(session, TIMEZONE) })).toBeVisible();
  });

  await test.step("rename the event", async () => {
    await page.goto("/admin/events");
    await row(EVENT_NAME).getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit event" });
    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(EVENT_NAME);
    await dialog.getByLabel("Name", { exact: true }).fill(RENAMED);
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Event updated")).toBeVisible();
    await expect(row(RENAMED)).toBeVisible();
    expect((await ourEvents()).map((e) => e.name)).toEqual([RENAMED]);
  });

  await test.step("delete the session", async () => {
    await page.goto("/admin/sessions");
    await row(formatSessionTitle(session, TIMEZONE))
      .filter({ hasText: RENAMED })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await page.getByRole("dialog", { name: "Delete this session?" }).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Session deleted")).toBeVisible();
    expect(await api.call<Session[]>("GET", `/v1/sessions?event_id=${encodeURIComponent(event.id)}`)).toEqual([]);
  });

  await test.step("delete the event", async () => {
    await page.goto("/admin/events");
    await row(RENAMED).getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog", { name: "Delete this event?" }).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Event deleted")).toBeVisible();
    await expect(row(RENAMED)).toHaveCount(0);
    expect(await ourEvents()).toEqual([]);
  });
});
