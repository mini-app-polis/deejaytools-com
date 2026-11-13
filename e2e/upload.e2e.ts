import type { Request, Route } from "@playwright/test";
import { Api, expect, RUN_ID, signIn, silentWav, test, waitForSongBuild, type Song } from "./fixtures";

/**
 * A song upload on a connection that keeps dropping, as a dancer's phone on
 * venue wifi does: the browser sends the file in 1 MiB chunks, and this test
 * breaks some of those requests on the way.
 *
 * - The middle chunk never gets through until the upload gives up, so the
 *   form shows its retry countdown and then a Retry upload button. Pressing
 *   it continues from that chunk; the first is not sent again.
 * - The last chunk reaches the API, which saves the song, but its answer is
 *   lost. The browser sends the last chunk again and the API answers with
 *   the song it already saved: one song, not two.
 *
 * A partner to dance with is set up through the API beforehand, and the
 * song and partner are removed after.
 */
const DIVISION = "Classic";
/** Everything this file creates is named from here, so a run that died can
 * be swept by the next. */
const PREFIX = "E2E Upload";
const ROUTINE = `${PREFIX} ${RUN_ID}`;
const PARTNER_FIRST = "E2E";
const PARTNER_LAST = `Upload${RUN_ID}`;
/** 2.5 MiB: three chunks at the site's 1 MiB chunk size. */
const FILE_BYTES = 2.5 * 1024 * 1024;
const CHUNK_URL = "**/v1/songs/upload/chunk";

let api: Api;
let partnerId: string | undefined;
let songIds: string[] = [];

/** Remove the songs and partner an earlier run of this file left behind. */
async function sweep(): Promise<void> {
  for (const s of await api.call<Song[]>("GET", "/v1/songs")) {
    if (s.routine_name?.startsWith(`${PREFIX} `)) await api.call("DELETE", `/v1/songs/${s.id}`).catch(() => undefined);
  }
  const partners = await api.call<{ id: string; first_name: string; last_name: string; linked_user_id: string | null }[]>(
    "GET",
    "/v1/partners"
  );
  for (const p of partners) {
    if (p.first_name === PARTNER_FIRST && p.last_name.startsWith("Upload") && !p.linked_user_id) {
      await api.call("DELETE", `/v1/partners/${p.id}`).catch(() => undefined);
    }
  }
}

/** The chunk index a chunk request carries in its multipart body. */
function chunkIndex(request: Request): number {
  const body = request.postDataBuffer()?.toString("latin1") ?? "";
  const match = /name="chunk_index"\r\n\r\n(\d+)/.exec(body);
  if (!match) throw new Error("A chunk request without a chunk_index field.");
  return Number(match[1]);
}

test.beforeAll(async () => {
  api = await Api.start();
  await sweep();
  const partner = await api.call<{ id: string }>("POST", "/v1/partners", {
    first_name: PARTNER_FIRST,
    last_name: PARTNER_LAST,
    partner_role: "follower",
  });
  partnerId = partner.id;
});

test.afterAll(async () => {
  if (!api) return;
  for (const id of songIds) await api.call("DELETE", `/v1/songs/${id}`).catch(() => undefined);
  if (partnerId) await api.call("DELETE", `/v1/partners/${partnerId}`).catch(() => undefined);
  await api.end();
});

test("an upload survives dropped chunks, resumes where it stopped, and saves one song", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, api.session.user.email);

  /** Chunk requests the page made, by chunk index, failed ones included. */
  const sent = new Map<number, number>();
  let middleGetsThrough = false;
  let lastAnswerLost = false;
  await page.route(CHUNK_URL, async (route: Route) => {
    const index = chunkIndex(route.request());
    sent.set(index, (sent.get(index) ?? 0) + 1);
    if (index === 1 && !middleGetsThrough) {
      await route.abort("connectionreset");
      return;
    }
    if (index === 2 && !lastAnswerLost) {
      // The API gets the last chunk and saves the song; the page never
      // hears back.
      lastAnswerLost = true;
      await route.fetch();
      await route.abort("connectionreset");
      return;
    }
    await route.continue();
  });

  await test.step("fill in Add Song and start the upload", async () => {
    await page.goto("/songs/add");
    await expect(page.getByRole("heading", { level: 1, name: "Add Song" })).toBeVisible();
    await page
      .getByRole("radiogroup", { name: "Partner" })
      .getByRole("radio", { name: `${PARTNER_FIRST} ${PARTNER_LAST}`, exact: true })
      .click();
    await page.getByRole("radiogroup", { name: "Division" }).getByRole("radio", { name: DIVISION, exact: true }).click();
    await page.getByLabel("Routine / Song name").fill(ROUTINE);
    await page.getByLabel("Audio file").setInputFiles({
      name: "e2e-upload.wav",
      mimeType: "audio/wav",
      buffer: silentWav(FILE_BYTES - 44),
    });
    await page.getByRole("button", { name: "Upload song" }).click();
  });

  await test.step("the middle chunk is retried with a countdown, then the upload stops", async () => {
    await expect(page.getByText(/Trying again in \d+ s \(attempt 2 of 4\)/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry upload" })).toBeVisible({ timeout: 60_000 });
    expect(sent.get(0)).toBe(1);
    expect(sent.get(1)).toBe(4);
    expect(sent.has(2)).toBe(false);
  });

  await test.step("Retry upload continues from the middle chunk", async () => {
    middleGetsThrough = true;
    await page.getByRole("button", { name: "Retry upload" }).click();
    await expect(page.getByText("Song uploaded successfully.")).toBeVisible({ timeout: 60_000 });
    expect(sent.get(0)).toBe(1);
    expect(sent.get(1)).toBe(5);
    // The last chunk twice: once whose answer was lost, once more.
    expect(sent.get(2)).toBe(2);
  });

  await test.step("the API saved one song and built it", async () => {
    const song = await waitForSongBuild(api, page, ROUTINE);
    const ours = (await api.call<Song[]>("GET", "/v1/songs")).filter((s) => s.routine_name === ROUTINE);
    songIds = ours.map((s) => s.id);
    expect(ours.map((s) => s.id)).toEqual([song.id]);
  });
});
