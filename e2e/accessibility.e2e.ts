import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { Api, dateIn, expect, RUN_ID, signIn, test } from "./fixtures";

/**
 * An automated accessibility scan (axe-core, WCAG 2.1 A and AA rules) of the
 * pages people use most: the public pages, a dancer's pages, and the
 * manager's and admin's. Axe catches what can be checked mechanically —
 * missing labels and names, contrast, ARIA misuse, landmark and list
 * structure — not everything a person with a screen reader would meet.
 *
 * Any violation fails the test. Every one is listed in the run's log and
 * annotations and attached as JSON. A11Y_REPORT_ONLY=1 reports without
 * failing, for a run that needs to land while a finding is being fixed.
 */
const TIMEZONE = "America/Chicago";
const PREFIX = "E2E A11y";
const NAME = `${PREFIX} ${RUN_ID}`;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const ENFORCE = process.env.A11Y_REPORT_ONLY !== "1";

let api: Api;
let eventId: string | undefined;
let sessionId: string;

test.beforeAll(async () => {
  api = await Api.start();
  const me = await api.call<{ id: string }>("GET", "/v1/auth/me");
  for (const e of await api.call<{ id: string; name: string; created_by: string }[]>("GET", "/v1/events")) {
    if (e.name.startsWith(`${PREFIX} `) && e.created_by === me.id) {
      await api.call("DELETE", `/v1/events/${e.id}`).catch(() => undefined);
    }
  }
  // An event and a session under way, so the session page and the event's
  // submission page have something to show.
  const event = await api.call<{ id: string }>("POST", "/v1/events", {
    name: NAME,
    start_date: dateIn(TIMEZONE, -1),
    end_date: dateIn(TIMEZONE, 1),
    timezone: TIMEZONE,
  });
  eventId = event.id;
  const now = Date.now();
  const session = await api.call<{ id: string }>("POST", "/v1/sessions", {
    event_id: eventId,
    name: NAME,
    checkin_opens_at: now - 3_600_000,
    floor_trial_starts_at: now - 60_000,
    floor_trial_ends_at: now + 7_200_000,
    active_priority_max: 0,
    active_non_priority_max: 0,
    divisions: [{ division_name: "Classic", is_priority: false }],
  });
  sessionId = session.id;
});

test.afterAll(async () => {
  if (!api) return;
  if (eventId) await api.call("DELETE", `/v1/events/${eventId}`).catch(() => undefined);
  await api.end();
});

interface Finding {
  page: string;
  rule: string;
  impact: string | null | undefined;
  help: string;
  helpUrl: string;
  targets: string[];
}

/** The page's main heading, once the page has rendered its content. */
const h1 = (page: Page): Locator => page.getByRole("heading", { level: 1 }).first();

test("the main pages pass an automated accessibility scan", async ({ page }) => {
  test.setTimeout(180_000);
  const pages: [string, (p: Page) => Locator][] = [
    ["/", h1],
    ["/how-it-works", h1],
    ["/events", h1],
    [`/events/${eventId}`, h1],
    ["/floor-trials", h1],
  ];
  const signedIn: [string, (p: Page) => Locator][] = [
    ["/my-content", h1],
    ["/songs/add", h1],
    ["/my-profile", h1],
    ["/event-submissions", h1],
    [`/event-submissions/${eventId}`, h1],
    ["/sessions", h1],
    [`/sessions/${sessionId}`, h1],
    ["/manager/active-sessions", h1],
    ["/manager/checkin-for", h1],
    ["/admin/events", h1],
  ];

  // Dialogs that only exist once opened: scanned open, so their fields are
  // checked too.
  const dialogs: [string, string, string][] = [
    ["/admin/events", "New Event", "New event"],
    ["/admin/sessions", "New Session", "New session"],
  ];

  const findings: Finding[] = [];
  const scan = async (path: string, ready: (p: Page) => Locator, opens?: [string, string]) => {
    const label = opens ? `${path} (${opens[1]} dialog)` : path;
    await test.step(`scan ${label}`, async () => {
      await page.goto(path);
      await expect(ready(page)).toBeVisible();
      // Pages dim their content (opacity-60) while they load; scanning then
      // measures the dimmed text. Wait for it to settle.
      await expect(page.locator(".opacity-60")).toHaveCount(0);
      if (opens) {
        await page.getByRole("button", { name: opens[0], exact: true }).click();
        await expect(page.getByRole("dialog", { name: opens[1] })).toBeVisible();
      }
      const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      for (const v of result.violations) {
        findings.push({
          page: label,
          rule: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          targets: v.nodes.map((n) => n.target.join(" ")),
        });
      }
    });
  };

  for (const [path, ready] of pages) await scan(path, ready);
  await signIn(page, api.session.user.email);
  for (const [path, ready] of signedIn) await scan(path, ready);
  for (const [path, button, dialog] of dialogs) await scan(path, h1, [button, dialog]);

  await test.info().attach("accessibility-findings.json", {
    body: JSON.stringify(findings, null, 2),
    contentType: "application/json",
  });
  for (const f of findings) {
    test.info().annotations.push({
      type: `a11y ${f.impact ?? "unknown"}`,
      description: `${f.page} — ${f.rule}: ${f.help} (${f.targets.length} element${f.targets.length === 1 ? "" : "s"}) ${f.helpUrl}`,
    });
  }
  console.log(
    findings.length === 0
      ? "Accessibility: no violations."
      : `Accessibility: ${findings.length} violation(s)\n` +
          findings.map((f) => `  [${f.impact}] ${f.page} ${f.rule} — ${f.help} (${f.targets.length})`).join("\n")
  );
  if (ENFORCE) expect(findings).toEqual([]);
});
