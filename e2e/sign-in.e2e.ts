import { Api, expect, signIn, test } from "./fixtures";
import { e2eConfig } from "./env";

test("a signed-in user reaches My Content, with sync and profile loading cleanly", async ({ page }) => {
  const api = await Api.start();
  const { apiUrl } = e2eConfig();
  const failures: string[] = [];
  page.on("response", (res) => {
    if (res.url().startsWith(apiUrl) && res.status() >= 400) failures.push(`${res.status()} ${res.url()}`);
  });

  try {
    // Signing in lands on My Content, where AuthSync posts /auth/sync;
    // signIn fails unless that succeeds. A fresh load then reads the profile.
    await signIn(page, api.session.user.email);
    expect(new URL(page.url()).pathname).toBe("/my-content");

    const me = page.waitForResponse((r) => r.url() === `${apiUrl}/v1/auth/me`);
    await page.goto("/my-content");
    expect((await me).status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1, name: "My Content" })).toBeVisible();
    expect(failures).toEqual([]);
  } finally {
    await api.end();
  }
});

test("a signed-out visitor is sent home from pages that need an account", async ({ page }) => {
  for (const path of ["/my-content", "/event-submissions"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
  }
});
