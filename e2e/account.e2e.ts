import type { Locator, Page } from "@playwright/test";
import { Api, expect, RUN_ID, signIn, test } from "./fixtures";

/**
 * A dancer keeps their account up to date on My Profile: their name, their
 * partners, their teams, and the partnerships they upload on behalf of. Each
 * is added, edited and removed through the page; the API is read to check
 * what was saved. The test user's own name is put back afterwards.
 */
/** Everything this file creates is named from here, so a run that died can
 * be swept by the next. */
const TAG = `Acct${RUN_ID}`;
const TEAM = `E2E Acct ${RUN_ID}`;

interface Me {
  first_name: string | null;
  last_name: string | null;
}

let api: Api;
let original: Me;

async function sweep(): Promise<void> {
  for (const p of await api.call<{ id: string; first_name: string; last_name: string }[]>("GET", "/v1/partners")) {
    if (p.first_name === "E2E" && p.last_name.startsWith("Acct")) {
      await api.call("DELETE", `/v1/partners/${p.id}`).catch(() => undefined);
    }
  }
  for (const t of await api.call<{ id: string; identifier: string }[]>("GET", "/v1/teams")) {
    if (t.identifier.startsWith("E2E Acct ")) await api.call("DELETE", `/v1/teams/${t.id}`).catch(() => undefined);
  }
  for (const m of await api.call<{ id: string; leader_last_name: string }[]>("GET", "/v1/managed-partnerships")) {
    if (m.leader_last_name.startsWith("Acct")) {
      await api.call("DELETE", `/v1/managed-partnerships/${m.id}`).catch(() => undefined);
    }
  }
}

test.beforeAll(async () => {
  api = await Api.start();
  original = await api.call<Me>("GET", "/v1/auth/me");
  await sweep();
});

test.afterAll(async () => {
  if (!api) return;
  await sweep().catch(() => undefined);
  // Put the test user's name back, whatever the test got to.
  if (original?.first_name && original.last_name) {
    await api
      .call("PATCH", "/v1/auth/me", { firstName: original.first_name, lastName: original.last_name })
      .catch(() => undefined);
  }
  await api.end();
});

/** A My Profile section, by its heading. */
const section = (page: Page, heading: string): Locator =>
  page.locator("div.rounded-lg").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

/** A row in a section, by the text it shows. */
const rowIn = (s: Locator, text: string | RegExp): Locator => s.locator("div.rounded-lg").filter({ hasText: text });

test("a dancer updates their name and manages partners, teams and managed partnerships", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, api.session.user.email);
  await page.goto("/my-profile");

  await test.step("change their name, then change it back", async () => {
    const profile = section(page, "Profile");
    await expect(profile.getByLabel("First name")).toHaveValue(original.first_name ?? "");
    await profile.getByLabel("Last name").fill(TAG);
    await profile.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Profile updated")).toBeVisible();
    expect((await api.call<Me>("GET", "/v1/auth/me")).last_name).toBe(TAG);

    await profile.getByLabel("Last name").fill(original.last_name ?? "");
    await profile.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect.poll(async () => (await api.call<Me>("GET", "/v1/auth/me")).last_name).toBe(original.last_name);
  });

  await test.step("add, edit and remove a partner", async () => {
    const partners = section(page, "Partners");
    await partners.getByRole("button", { name: "Add partner", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Add partner" });
    await dialog.getByLabel("First name").fill("E2E");
    await dialog.getByLabel("Last name").fill(TAG);
    await dialog.getByRole("radio", { name: "Leader" }).click();
    await dialog.getByLabel(/email/i).fill(`e2e-${RUN_ID.toLowerCase()}@example.com`);
    await dialog.getByRole("button", { name: "Add partner", exact: true }).click();
    await expect(page.getByText("Partner added")).toBeVisible();
    await expect(rowIn(partners, `E2E ${TAG}`)).toContainText("Leader");

    await rowIn(partners, `E2E ${TAG}`).getByRole("button", { name: "Edit", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Edit partner" });
    await dialog.getByLabel("Last name").fill(`${TAG}B`);
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Partner updated")).toBeVisible();
    await expect(rowIn(partners, `E2E ${TAG}B`)).toBeVisible();

    await rowIn(partners, `E2E ${TAG}B`).getByRole("button", { name: "Delete", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Remove partner?" });
    // No songs or check-ins, so nothing to warn about.
    await expect(dialog.getByText("This action cannot be undone.")).toBeVisible();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Partner removed.")).toBeVisible();
    await expect(rowIn(partners, `E2E ${TAG}B`)).toHaveCount(0);
  });

  await test.step("add, rename and remove a team", async () => {
    const teams = section(page, "Teams");
    await teams.getByRole("button", { name: "Add team", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Add team" });
    await dialog.getByLabel("Team name").fill(TEAM);
    await dialog.getByRole("button", { name: "Add team", exact: true }).click();
    await expect(page.getByText("Team added")).toBeVisible();

    await rowIn(teams, TEAM).getByRole("button", { name: "Edit", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Edit team" });
    await dialog.getByLabel("Team name").fill(`${TEAM} B`);
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Team updated")).toBeVisible();

    await rowIn(teams, `${TEAM} B`).getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog", { name: "Remove team?" }).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Team removed.")).toBeVisible();
    await expect(rowIn(teams, `${TEAM} B`)).toHaveCount(0);
  });

  await test.step("add and remove a managed partnership", async () => {
    const managed = section(page, "Managed Partnerships");
    await managed.getByRole("button", { name: "Add partnership", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add partnership" });
    // Leader first, then follower: each has its own first and last name.
    await dialog.getByLabel("First name").nth(0).fill("Lead");
    await dialog.getByLabel("Last name").nth(0).fill(TAG);
    await dialog.getByLabel("First name").nth(1).fill("Follow");
    await dialog.getByLabel("Last name").nth(1).fill(TAG);
    await dialog.getByRole("button", { name: "Add partnership", exact: true }).click();
    await expect(page.getByText("Partnership added")).toBeVisible();
    const label = `Lead ${TAG} (Leader) + Follow ${TAG} (Follower)`;
    await expect(rowIn(managed, label)).toBeVisible();

    await rowIn(managed, label).getByRole("button", { name: "Delete", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Remove partnership?" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByText("Partnership removed.")).toBeVisible();
    await expect(rowIn(managed, label)).toHaveCount(0);
  });

  const left = await api.call<{ leader_last_name: string }[]>("GET", "/v1/managed-partnerships");
  expect(left.filter((m) => m.leader_last_name === TAG)).toEqual([]);
});
