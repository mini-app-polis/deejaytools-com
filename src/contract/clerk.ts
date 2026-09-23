/**
 * A real Clerk session for the contract suite's test user.
 *
 * The suite signs in the way the browser does — with a Clerk-issued session
 * JWT — so the API's real verification path (JWKS, issuer, user lookup) is
 * exercised, not bypassed. The Backend API creates the session directly for
 * a known user, which needs no password and no UI.
 *
 * Tokens are short-lived by design, so `token()` mints a fresh one whenever
 * the cached one is more than 40 seconds old.
 */
const CLERK_API = "https://api.clerk.com/v1";
const TOKEN_REUSE_MS = 40_000;

export interface ClerkUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

async function clerk<T>(secretKey: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Clerk ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export class ClerkTestSession {
  private cached: { jwt: string; at: number } | null = null;

  private constructor(
    private readonly secretKey: string,
    readonly sessionId: string,
    readonly user: ClerkUser
  ) {}

  static async start(secretKey: string, userId: string): Promise<ClerkTestSession> {
    const u = await clerk<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      primary_email_address_id: string | null;
      email_addresses: { id: string; email_address: string }[];
    }>(secretKey, "GET", `/users/${encodeURIComponent(userId)}`);
    const email =
      u.email_addresses.find((e) => e.id === u.primary_email_address_id)?.email_address ??
      u.email_addresses[0]?.email_address;
    if (!email) throw new Error(`Clerk user ${userId} has no email address`);

    const session = await clerk<{ id: string }>(secretKey, "POST", "/sessions", { user_id: userId });
    return new ClerkTestSession(secretKey, session.id, {
      id: u.id,
      email,
      firstName: u.first_name,
      lastName: u.last_name,
    });
  }

  async token(): Promise<string> {
    if (this.cached && Date.now() - this.cached.at < TOKEN_REUSE_MS) return this.cached.jwt;
    const t = await clerk<{ jwt: string }>(
      this.secretKey,
      "POST",
      `/sessions/${encodeURIComponent(this.sessionId)}/tokens`
    );
    this.cached = { jwt: t.jwt, at: Date.now() };
    return t.jwt;
  }

  async end(): Promise<void> {
    await clerk(this.secretKey, "POST", `/sessions/${encodeURIComponent(this.sessionId)}/revoke`).catch(
      () => undefined
    );
  }
}
