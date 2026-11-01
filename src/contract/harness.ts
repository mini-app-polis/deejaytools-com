/**
 * Plumbing for the live contract suite: configuration and its safety
 * guards, an authenticated transport, and the coverage ledger.
 */
import { setContractMode } from "@/api/contract";
import {
  allEndpoints,
  call,
  type CallArgs,
  endpoints,
  type Endpoint,
  type Transport,
} from "@/api/endpoints";
import { SuccessMetaSchema } from "@/api/envelope";
import { ClerkTestSession } from "./clerk";

// ---------------------------------------------------------------------------
// Configuration and guards
// ---------------------------------------------------------------------------

/** The production domain. The suite creates and deletes data, so it never
 * calls a host under it except the development API below. */
const PRODUCTION_DOMAIN = "deejaytools.com";

/**
 * The only hosts under the production domain the suite may call. Anything
 * else there — the API, the site, a new subdomain — is refused, so adding a
 * production host never needs a change here to stay safe.
 */
const ALLOWED_DEV_HOSTS = ["api-dev.deejaytools.com"];

export interface ContractConfig {
  apiUrl: string;
  clerkSecretKey: string;
  /** The admin test user. */
  userId: string;
  /** A plain user: the linked partner of a row in the admin's address book. */
  dancerUserId: string;
  /** A plain user the suite grants per-event staff roles to. */
  staffUserId: string;
}

function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
  const v = proc?.env[name]?.trim();
  return v ? v : undefined;
}

/**
 * Read and vet the suite's configuration. Refuses to run unless every guard
 * holds, because the suite writes to the API it points at:
 *   1. the Clerk key is a development-instance key (sk_test_), so the token
 *      it mints is one only a development API accepts;
 *   2. the API host is not a production hostname: under deejaytools.com only
 *      the development API (ALLOWED_DEV_HOSTS) is allowed.
 * A production API would also reject the development token at /auth/sync,
 * before the first write — the third, independent guard.
 */
export function loadConfig(): ContractConfig {
  const apiUrl = env("CONTRACT_API_URL");
  const clerkSecretKey = env("CONTRACT_CLERK_SECRET_KEY");
  const userId = env("CONTRACT_USER_ID");
  const dancerUserId = env("CONTRACT_DANCER_USER_ID");
  const staffUserId = env("CONTRACT_STAFF_USER_ID");
  const missing = [
    !apiUrl && "CONTRACT_API_URL",
    !clerkSecretKey && "CONTRACT_CLERK_SECRET_KEY",
    !userId && "CONTRACT_USER_ID",
    !dancerUserId && "CONTRACT_DANCER_USER_ID",
    !staffUserId && "CONTRACT_STAFF_USER_ID",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Contract suite not configured: set ${missing.join(", ")}.`);
  }
  if (!clerkSecretKey!.startsWith("sk_test_")) {
    throw new Error(
      "Refusing to run: CONTRACT_CLERK_SECRET_KEY is not a development-instance key (sk_test_…)."
    );
  }
  const host = new URL(apiUrl!).hostname;
  const onProductionDomain = host === PRODUCTION_DOMAIN || host.endsWith(`.${PRODUCTION_DOMAIN}`);
  if (onProductionDomain && !ALLOWED_DEV_HOSTS.includes(host)) {
    throw new Error(`Refusing to run against ${host}: the contract suite writes data.`);
  }
  if (new Set([userId, dancerUserId, staffUserId]).size !== 3) {
    throw new Error(
      "Refusing to run: CONTRACT_USER_ID, CONTRACT_DANCER_USER_ID and CONTRACT_STAFF_USER_ID must be three different users."
    );
  }
  return {
    apiUrl: apiUrl!.replace(/\/$/, ""),
    clerkSecretKey: clerkSecretKey!,
    userId: userId!,
    dancerUserId: dancerUserId!,
    staffUserId: staffUserId!,
  };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** A non-2xx response, with the error envelope's code when there is one. */
export class ApiStatusError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly body: unknown
  ) {
    super(`API responded ${status}${code ? ` (${code})` : ""}`);
    this.name = "ApiStatusError";
  }
}

/** The envelope every API response must use — checked, not assumed. */
async function readEnvelope(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(`Response is not JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  const obj = json as { data?: unknown; error?: { code?: string; message?: string } } | undefined;
  if (!res.ok) {
    if (!obj?.error || typeof obj.error.code !== "string" || typeof obj.error.message !== "string") {
      throw new Error(`Error response ${res.status} lacks the {error:{code,message}} envelope: ${text.slice(0, 200)}`);
    }
    throw new ApiStatusError(res.status, obj.error.code, json);
  }
  if (!obj || !("data" in obj)) {
    throw new Error(`Success response ${res.status} lacks the {data} envelope: ${text.slice(0, 200)}`);
  }
  const meta = SuccessMetaSchema.safeParse((obj as { meta?: unknown }).meta);
  if (!meta.success) {
    throw new Error(`Success response ${res.status} has an invalid meta: ${text.slice(0, 200)}`);
  }
  return obj.data;
}

export interface Client extends Transport {
  /** Raw request, for status probes and the fetch-transport endpoints. */
  raw(method: string, path: string, body?: unknown): Promise<Response>;
}

/**
 * A client for the API at `apiUrl` that checks the response envelope and
 * sends `session`'s bearer token when there is one (anonymous when null).
 */
export function makeClient(apiUrl: string, session: ClerkTestSession | null): Client {
  const raw = async (method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (session) headers.Authorization = `Bearer ${await session.token()}`;
    return fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  const send = async (method: string, path: string, body?: unknown) =>
    readEnvelope(await raw(method, path, body));
  return {
    raw,
    get: async <T>(path: string) => (await send("GET", path)) as T,
    post: async <T>(path: string, body?: unknown) => (await send("POST", path, body)) as T,
    patch: async <T>(path: string, body: unknown) => (await send("PATCH", path, body)) as T,
    put: async <T>(path: string, body: unknown) => (await send("PUT", path, body)) as T,
    del: (path: string) => send("DELETE", path),
  };
}

/** A signed-in test user: their Clerk session and a client that sends its token. */
export interface SignedIn {
  session: ClerkTestSession;
  client: Client;
}

/**
 * Start a Clerk session for `userId` and sync it with the API, as the app
 * does on sign-in, so the user has a `users` row before anyone names it (a
 * staff grant, a partner link). For the suite's other users: the admin's
 * own sync is validated against the catalog in the suite itself.
 */
export async function signInAs(cfg: ContractConfig, userId: string): Promise<SignedIn> {
  const session = await ClerkTestSession.start(cfg.clerkSecretKey, userId);
  const client = makeClient(cfg.apiUrl, session);
  const res = await client.raw("POST", endpoints.auth.sync.path(), {
    email: session.user.email,
    firstName: session.user.firstName ?? undefined,
    lastName: session.user.lastName ?? undefined,
  });
  if (res.status !== 200) {
    await session.end();
    throw new Error(`Syncing test user ${session.user.email} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  return { session, client };
}

// ---------------------------------------------------------------------------
// Coverage ledger
// ---------------------------------------------------------------------------

/**
 * Every endpoint in the catalog must end a run either exercised or skipped
 * with a stated reason. An endpoint added to the catalog without either
 * fails the suite — so the contract cannot quietly grow an untested edge.
 */
export class Ledger {
  private readonly hits = new Set<string>();
  private readonly skips = new Map<string, string>();

  /**
   * `client` serves the enveloped endpoints; `bare` serves those declared
   * `envelope: false`, as the app calls them.
   */
  constructor(
    private readonly client: Transport,
    private readonly bare: Transport
  ) {}

  /** Call an endpoint through the validating `call()` and record it. */
  async hit<P, B, R>(ep: Endpoint<P, B, R>, ...args: CallArgs<P, B>): Promise<R> {
    const out = await call(ep.envelope === false ? this.bare : this.client, ep, ...args);
    this.hits.add(ep.id);
    return out;
  }

  /** Record an endpoint exercised outside `hit()` (fetch transport). */
  mark(ep: Endpoint<unknown, unknown, unknown> | { id: string }): void {
    this.hits.add(ep.id);
  }

  skip(ep: { id: string }, reason: string): void {
    if (!this.hits.has(ep.id)) this.skips.set(ep.id, reason);
  }

  report(): { exercised: string[]; skipped: [string, string][]; unaccounted: string[] } {
    const ids = allEndpoints().map((e) => e.id);
    return {
      exercised: ids.filter((id) => this.hits.has(id)),
      skipped: ids.filter((id) => !this.hits.has(id) && this.skips.has(id)).map((id) => [id, this.skips.get(id)!]),
      unaccounted: ids.filter((id) => !this.hits.has(id) && !this.skips.has(id)),
    };
  }
}

/** Puts response validation in strict mode, so any contract mismatch throws. */
export function strictContracts(): void {
  setContractMode("strict");
}

/** Resolves after `ms` milliseconds. */
export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
