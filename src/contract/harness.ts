/**
 * Plumbing for the live contract suite: configuration and its safety
 * guards, an authenticated transport, and the coverage ledger.
 */
import { setContractMode } from "@/api/contract";
import {
  allEndpoints,
  call,
  type CallArgs,
  type Endpoint,
  type Transport,
} from "@/api/endpoints";
import { ClerkTestSession } from "./clerk";

// ---------------------------------------------------------------------------
// Configuration and guards
// ---------------------------------------------------------------------------

/** API hosts the suite must never touch. It creates and deletes data. */
const FORBIDDEN_HOST_SUFFIXES = ["deejaytools.com"];

export interface ContractConfig {
  apiUrl: string;
  clerkSecretKey: string;
  userId: string;
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
 *   2. the API host is not a production hostname.
 * A production API would also reject the development token at /auth/sync,
 * before the first write — the third, independent guard.
 */
export function loadConfig(): ContractConfig {
  const apiUrl = env("CONTRACT_API_URL");
  const clerkSecretKey = env("CONTRACT_CLERK_SECRET_KEY");
  const userId = env("CONTRACT_USER_ID");
  const missing = [
    !apiUrl && "CONTRACT_API_URL",
    !clerkSecretKey && "CONTRACT_CLERK_SECRET_KEY",
    !userId && "CONTRACT_USER_ID",
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
  if (FORBIDDEN_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) {
    throw new Error(`Refusing to run against ${host}: the contract suite writes data.`);
  }
  return { apiUrl: apiUrl!.replace(/\/$/, ""), clerkSecretKey: clerkSecretKey!, userId: userId! };
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
  return obj.data;
}

export interface Client extends Transport {
  /** Raw request, for status probes and the fetch-transport endpoints. */
  raw(method: string, path: string, body?: unknown): Promise<Response>;
}

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

  constructor(private readonly client: Transport) {}

  /** Call an endpoint through the validating `call()` and record it. */
  async hit<P, B, R>(ep: Endpoint<P, B, R>, ...args: CallArgs<P, B>): Promise<R> {
    const out = await call(this.client, ep, ...args);
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

export function strictContracts(): void {
  setContractMode("strict");
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
