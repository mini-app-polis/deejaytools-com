import { defineConfig, devices } from "@playwright/test";

/**
 * The end-to-end suite (e2e/*.e2e.ts): a real browser against the deployed
 * dev site, signed in through Clerk's development instance, with the dev API
 * behind it. It writes to that API, so it runs one test at a time and only
 * with a development Clerk key — see e2e/env.ts for the guards.
 *
 * Configuration comes from the environment, as in CI (see dev-site.yml):
 *   E2E_BASE_URL               the deployed site to test
 *   CLERK_PUBLISHABLE_KEY      that site's Clerk key (pk_test_…)
 *   CLERK_SECRET_KEY           the development instance's secret key
 *   CONTRACT_API_URL           the dev API the site calls
 *   CONTRACT_USER_ID           the test user (an admin in dev)
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // "github" turns failures into annotations on the run, readable without
  // downloading the report.
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
