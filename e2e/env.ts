/**
 * Configuration for the end-to-end suite, with the same guards as the live
 * contract suite (src/contract/harness.ts): it creates and deletes data, so
 * it only runs with a development Clerk key, and never against a production
 * host. The names are listed in .env.example.
 */
const PRODUCTION_DOMAIN = "deejaytools.com";
const ALLOWED_DEV_HOSTS = ["api-dev.deejaytools.com"];

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`End-to-end suite not configured: set ${name}.`);
  return v;
}

function onProduction(url: string): boolean {
  const host = new URL(url).hostname;
  const under = host === PRODUCTION_DOMAIN || host.endsWith(`.${PRODUCTION_DOMAIN}`);
  return under && !ALLOWED_DEV_HOSTS.includes(host);
}

export interface E2eConfig {
  baseUrl: string;
  apiUrl: string;
  secretKey: string;
  /** The admin test user. */
  userId: string;
  /** A plain user: the linked partner of a row in the admin's address book. */
  dancerUserId: string;
  /** A plain user the suite grants per-event staff roles to. */
  staffUserId: string;
}

export function e2eConfig(): E2eConfig {
  const baseUrl = required("E2E_BASE_URL");
  const apiUrl = required("CONTRACT_API_URL").replace(/\/$/, "");
  const secretKey = required("CLERK_SECRET_KEY");
  const userId = required("CONTRACT_USER_ID");
  const dancerUserId = required("CONTRACT_DANCER_USER_ID");
  const staffUserId = required("CONTRACT_STAFF_USER_ID");
  if (new Set([userId, dancerUserId, staffUserId]).size !== 3) {
    throw new Error(
      "Refusing to run: CONTRACT_USER_ID, CONTRACT_DANCER_USER_ID and CONTRACT_STAFF_USER_ID must be three different users."
    );
  }
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Refusing to run: CLERK_SECRET_KEY is not a development-instance key (sk_test_…).");
  }
  if (!required("CLERK_PUBLISHABLE_KEY").startsWith("pk_test_")) {
    throw new Error("Refusing to run: CLERK_PUBLISHABLE_KEY is not a development-instance key (pk_test_…).");
  }
  for (const url of [baseUrl, apiUrl]) {
    if (onProduction(url)) throw new Error(`Refusing to run against ${new URL(url).hostname}: the suite writes data.`);
  }
  return { baseUrl, apiUrl, secretKey, userId, dancerUserId, staffUserId };
}
