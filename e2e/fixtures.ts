import { clerk } from "@clerk/testing/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import { ClerkTestSession } from "../src/contract/clerk";
import { e2eConfig } from "./env";

/**
 * Talks to the dev API as the test user, to set up and tear down what a test
 * needs. Deliberately not the app's endpoint catalog: that module pulls in
 * the browser build's Sentry setup, which only runs under Vite.
 */
export class Api {
  private constructor(
    private readonly apiUrl: string,
    readonly session: ClerkTestSession
  ) {}

  /** Sign in as `userId`: the admin test user unless another is named. */
  static async start(userId?: string): Promise<Api> {
    const cfg = e2eConfig();
    return new Api(cfg.apiUrl, await ClerkTestSession.start(cfg.secretKey, userId ?? cfg.userId));
  }

  /**
   * Sync the user with the API, as the app does on sign-in, so they have a
   * users row before anyone else names them (a staff grant, a partner link).
   */
  async sync(): Promise<void> {
    const { email, firstName, lastName } = this.session.user;
    await this.call("POST", "/v1/auth/sync", {
      email,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
    });
  }

  /**
   * Upload `file` as a song in one chunk, with the form fields the Add Song
   * form sends (division, routine_name, partner_id, …). The site's own
   * upload code needs Vite, so this speaks the chunk protocol directly; the
   * contract suite runs the real thing.
   */
  async uploadSong(file: { name: string; mimeType: string; buffer: Buffer }, fields: Record<string, string>): Promise<void> {
    const form = new FormData();
    form.set("chunk", new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.name);
    form.set("upload_id", crypto.randomUUID());
    form.set("chunk_index", "0");
    form.set("total_chunks", "1");
    form.set("original_filename", file.name);
    form.set("mime_type", file.mimeType);
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const res = await fetch(`${this.apiUrl}/v1/songs/upload/chunk`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${await this.session.token()}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Song upload → ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  async call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.session.token()}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
    return (text ? (JSON.parse(text) as { data: T }).data : undefined) as T;
  }

  async end(): Promise<void> {
    await this.session.end();
  }
}

/**
 * Fail fast, and say why, when the page cannot call the API — almost always
 * the API's CORS_ORIGINS not listing the site under test. Without this every
 * test would time out waiting for data that was never allowed to arrive.
 */
export async function expectApiReachable(page: Page): Promise<void> {
  const { apiUrl, baseUrl } = e2eConfig();
  const result = await page.evaluate(async (url) => {
    try {
      const res = await fetch(`${url}/health`);
      return `status ${res.status}`;
    } catch (err) {
      return `blocked: ${err instanceof Error ? err.message : String(err)}`;
    }
  }, apiUrl);
  if (!result.startsWith("status 2")) {
    throw new Error(
      `The site cannot call ${apiUrl} (${result}). Add ${new URL(baseUrl).origin} to the API's CORS_ORIGINS.`
    );
  }
}

/** Sign the test user in through Clerk (a Backend-API sign-in token: no
 * password, no verification step), landing on the home page. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await expectApiReachable(page);
  await clerk.signIn({ page, emailAddress: email });
}

/** Expect the page to have been sent to the landing page, as the app's
 * guards do for someone who may not see a route. */
export async function expectSentHome(page: Page): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
}

/**
 * A calendar date (YYYY-MM-DD) in `timezone`, `offsetDays` from today. The
 * API checks session times against the event's dates in the event's own
 * timezone, so dates built in UTC go wrong every evening in Chicago, when
 * UTC has already reached tomorrow.
 */
export function dateIn(timezone: string, offsetDays: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

/**
 * A tenth of a second of silence as a WAV file (8 kHz, mono, 8-bit), built
 * here so the tests need no fixture on disk. The API recognises WAV by its
 * RIFF/WAVE header and tags it before the Drive upload, so the header has to
 * be a real one; the contract suite's upload already covers MP3.
 */
export function silentWav(): Buffer {
  const samples = 800;
  const wav = Buffer.alloc(44 + samples, 0x80); // 0x80 is silence at 8 bits
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + samples, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16); // fmt chunk size
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(8000, 24); // sample rate
  wav.writeUInt32LE(8000, 28); // byte rate
  wav.writeUInt16LE(1, 32); // block align
  wav.writeUInt16LE(8, 34); // bits per sample
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(samples, 40);
  return wav;
}

export interface Song {
  id: string;
  routine_name: string | null;
  division: string | null;
  partnership_label?: string | null;
  processed_filename: string | null;
  drive_file_id: string | null;
}

/** The API answers the last chunk at once and builds the song (tag, Drive
 * upload) afterwards. */
const BUILD_TIMEOUT_MS = 60_000;

/**
 * Wait for the API to build the song uploaded with `routine` — tagged and on
 * Google Drive, with its processed filename — and return it. The API removes
 * the song again if the build fails, so a song that appears and then
 * vanishes means Drive refused it.
 */
export async function waitForSongBuild(api: Api, page: Page, routine: string): Promise<Song> {
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  let seen = false;
  for (;;) {
    const song = (await api.call<Song[]>("GET", "/v1/songs")).find((s) => s.routine_name === routine);
    if (song) seen = true;
    else if (seen) throw new Error("The API removed the uploaded song: its build or Google Drive upload failed.");
    if (song?.drive_file_id && song.processed_filename) return song;
    if (Date.now() > deadline) throw new Error(`The song had no Google Drive file after ${BUILD_TIMEOUT_MS / 1000}s.`);
    await page.waitForTimeout(2_000);
  }
}

/** A short id that makes this run's data recognisable and unique. */
export const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();

export const test = base;
export { expect };
