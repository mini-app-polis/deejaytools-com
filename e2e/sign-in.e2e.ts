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
    await signIn(page, api.session.user.email);

    // AuthSync posts /auth/sync on sign-in; the page then loads the profile.
    const synced = page.waitForResponse((r) => r.url() === `${apiUrl}/v1/auth/sync`);
    const me = page.waitForResponse((r) => r.url() === `${apiUrl}/v1/auth/me`);
    await page.goto("/my-content");
    expect((await synced).status()).toBe(200);
    expect((await me).status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1, name: "My Content" })).toBeVisible();
    expect(failures).toEqual([]);
  } finally {
    await api.end();
  }
});
