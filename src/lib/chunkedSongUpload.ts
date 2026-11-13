import { checkEndpoint, endpoints } from "@/api/endpoints";

const apiBase = import.meta.env.VITE_API_URL ?? "";
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/**
 * Chunk sizing. A chunk has to finish well inside its timeout on a slow
 * mobile uplink: Slow 4G is about 400 kbps up, roughly 50 KB/s, so a 1 MiB
 * chunk takes about 21 s there. The API takes at most 30 chunks per upload
 * (and at most 10 MB per chunk), so a file over 30 MiB gets larger chunks:
 * the 100 MB maximum is 30 chunks of about 3.3 MiB.
 */
export const MIN_CHUNK_BYTES = 1024 * 1024;
export const MAX_TOTAL_CHUNKS = 30;

/** Every chunk of an upload but the last is this size, as the API requires. */
export function chunkSizeFor(fileSize: number): number {
  return Math.max(MIN_CHUNK_BYTES, Math.ceil(fileSize / MAX_TOTAL_CHUNKS));
}

/**
 * Per-chunk timeout. Sized for an uplink half as fast as Slow 4G (25 KiB/s),
 * plus a fixed allowance for the round trip and the API's checks: a 1 MiB
 * chunk gets 15 s + 41 s = 56 s, about 2.7 times what it takes at Slow 4G.
 * The last chunk also waits for the API to assemble the file and save the
 * song, so it gets more.
 */
export const TIMEOUT_FLOOR_BYTES_PER_SECOND = 25 * 1024;
export const TIMEOUT_BASE_MS = 15_000;
export const FINAL_CHUNK_EXTRA_MS = 30_000;

export function chunkTimeoutMs(chunkBytes: number, isLast: boolean): number {
  return (
    TIMEOUT_BASE_MS +
    Math.ceil((chunkBytes / TIMEOUT_FLOOR_BYTES_PER_SECOND) * 1000) +
    (isLast ? FINAL_CHUNK_EXTRA_MS : 0)
  );
}

const UNREADABLE_FILE_HINT =
  "couldn't be read from disk. If it's stored in iCloud Drive, Google Drive or " +
  "Dropbox, it may be a placeholder that hasn't downloaded yet — open its folder, " +
  "make sure it isn't showing a cloud icon, then try again.";

/**
 * Why a File can't be uploaded, or null if it looks fine.
 *
 * Reading a File is a live read from disk, not a copy, so a cloud placeholder
 * hands us a File whose bytes are not local. fetch() surfaces that as
 * `TypeError: Failed to fetch` — indistinguishable from a dead network unless
 * we check the file ourselves.
 *
 * Both ends are probed because hydration can be partial: a readable first byte
 * does not prove the tail is there. This is a heuristic, not a proof — a
 * provider that serves partial reads can pass here and still fail mid-upload,
 * which is why the per-chunk catch re-checks rather than trusting this once.
 *
 * Note a placeholder reports its REAL size (the metadata is local, only the
 * bytes are not), so size is not a placeholder signal — a zero-byte file is a
 * genuinely different fault and gets its own message.
 */
async function fileReadFailure(file: File): Promise<string | null> {
  if (file.size === 0) return `"${file.name}" is empty (0 bytes).`;
  try {
    await file.slice(0, 1).arrayBuffer();
    await file.slice(file.size - 1).arrayBuffer();
    return null;
  } catch {
    return `"${file.name}" ${UNREADABLE_FILE_HINT}`;
  }
}

/**
 * The API refused the upload for good: retrying sends the same request and
 * gets the same answer. `code` is the API's error code.
 */
export class UploadRefused extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined
  ) {
    super(message);
    this.name = "UploadRefused";
  }
}

/**
 * Whether a refused chunk is worth sending again. Server errors (5xx), a
 * request timeout (408), a request the proxy saw the client drop (499) and
 * the rate limit (429) can pass on a retry; any other 4xx is the API's answer
 * to this request and would be repeated — an unsupported format (whose staged
 * chunks are already deleted, so a retry would only earn a misleading
 * CHUNK_MISSING), a file over the size limit, an expired session, a taken
 * slot. TOO_MANY_UPLOADS is a 429 that lasts until the caller's other uploads
 * finish, so it is not retried either. UPLOAD_IN_PROGRESS is a 409 for a
 * resent final chunk that arrived while an earlier copy was still assembling
 * the song; sent again, it gets that song back.
 */
export function isRetryableRefusal(status: number, code: string | undefined): boolean {
  if (status >= 500 || status === 408 || status === 499) return true;
  if (status === 429) return code !== "TOO_MANY_UPLOADS";
  if (status === 409) return code === "UPLOAD_IN_PROGRESS";
  return false;
}

export type UploadStage = "idle" | "uploading" | "processing" | "finishing";

/** A chunk failed and is about to be sent again. */
export type UploadRetry = {
  /** The attempt about to start, from 2. */
  attempt: number;
  maxAttempts: number;
  /** Milliseconds until it starts. */
  delayMs: number;
  /** Why the last attempt failed, for the user. */
  reason: string;
};

export type ChunkUploadProgress = {
  stage: UploadStage;
  progress: number;
  bytesSent: number;
  /** Set while a failed chunk waits to be sent again; null otherwise. */
  retry: UploadRetry | null;
};

/**
 * Where an interrupted upload can pick up: the chunks before `nextChunk` are
 * staged on the API (for up to two hours), keyed by `uploadId`.
 */
export type UploadResume = {
  file: File;
  uploadId: string;
  chunkSize: number;
  nextChunk: number;
};

/**
 * A chunk kept failing for a reason a later try can get past — a dropped or
 * slow connection, or a server error. `resume` continues from the chunk that
 * failed.
 */
export class UploadInterrupted extends Error {
  constructor(
    message: string,
    readonly resume: UploadResume,
    readonly bytesSent: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "UploadInterrupted";
  }
}

type UploadSongChunksOptions = {
  file: File;
  getToken: () => Promise<string | null>;
  buildFormFields: () => Record<string, string>;
  onProgress?: (update: ChunkUploadProgress) => void;
  /** Base backoff between chunk retries, doubled per retry, with jitter. Tests pass 0. */
  retryDelayMs?: number;
  /** Overrides chunkTimeoutMs for every chunk. Tests pass a few milliseconds. */
  chunkTimeoutMs?: number;
  /** Continue an interrupted upload of the same file instead of starting over. */
  resume?: UploadResume | null;
};

export const RETRY_BASE_DELAY_MS = 1000;
/** Tries per chunk, the first included. */
export const MAX_ATTEMPTS = 4;

/**
 * The wait before attempt `attempt` (2, 3, …): the base doubled per retry,
 * scaled by a random 50–100% so clients that failed together do not retry
 * together. With the 1 s base: about 1, 2 and 4 s.
 */
export function retryDelay(baseMs: number, attempt: number, random: () => number = Math.random): number {
  return Math.round(baseMs * 2 ** (attempt - 2) * (0.5 + random() / 2));
}

/** How long the finished progress bar stays at 100% before the caller moves on. */
const FINISH_HOLD_MS = 400;

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Uploads a song file to the chunk endpoint in chunkSizeFor(file.size)
 * pieces, each under its own timeout, retrying failed chunks with backoff, and
 * reports progress through `onProgress`. Throws UploadInterrupted when a chunk
 * keeps failing for a transient reason, UploadRefused when the API refuses
 * the upload, and a plain Error when the file cannot be read or the session
 * has expired.
 */
export async function uploadSongInChunks({
  file,
  getToken,
  buildFormFields,
  onProgress,
  retryDelayMs = RETRY_BASE_DELAY_MS,
  chunkTimeoutMs: timeoutOverride,
  resume,
}: UploadSongChunksOptions): Promise<void> {
  const upfrontFailure = await fileReadFailure(file);
  if (upfrontFailure) throw new Error(upfrontFailure);

  // A resume only applies to the same file, cut the same way.
  const chunkSize = chunkSizeFor(file.size);
  const resuming = resume && resume.file === file && resume.chunkSize === chunkSize ? resume : null;
  const uploadId = resuming?.uploadId ?? crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
  const firstChunk = resuming ? Math.min(resuming.nextChunk, totalChunks - 1) : 0;

  const uploadingProgress = (sent: number) => 10 + Math.round((sent / file.size) * 75);
  const startBytes = firstChunk * chunkSize;
  onProgress?.({
    stage: "uploading",
    progress: firstChunk > 0 ? uploadingProgress(startBytes) : 10,
    bytesSent: startBytes,
    retry: null,
  });

  for (let i = firstChunk; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    const isLast = i === totalChunks - 1;
    const stage: UploadStage = isLast ? "processing" : "uploading";
    const stageProgress = isLast ? (i > 0 ? 90 : 50) : uploadingProgress(start);
    if (isLast) {
      onProgress?.({ stage, progress: stageProgress, bytesSent: start, retry: null });
    }
    const timeoutMs = timeoutOverride ?? chunkTimeoutMs(end - start, isLast);

    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1 && lastErr) {
        const delayMs = retryDelay(retryDelayMs, attempt);
        onProgress?.({
          stage,
          progress: stageProgress,
          bytesSent: start,
          retry: { attempt, maxAttempts: MAX_ATTEMPTS, delayMs, reason: lastErr.message },
        });
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const form = new FormData();
      form.set("chunk", chunk, file.name);
      form.set("upload_id", uploadId);
      form.set("chunk_index", String(i));
      form.set("total_chunks", String(totalChunks));
      form.set("original_filename", file.name);
      form.set("mime_type", file.type || "audio/mpeg");
      for (const [key, value] of Object.entries(buildFormFields())) {
        form.set(key, value);
      }

      let token: string | null;
      try {
        token = await getToken();
      } catch {
        token = null;
      }
      if (!token) {
        throw new Error("Your session expired. Please sign in again and retry the upload.");
      }

      // The timer covers the whole exchange, reading the answer included: a
      // stalled upload is aborted rather than left for the browser to drop.
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      let res: Response;
      let json: { data?: unknown; error?: { message?: string; code?: string } } | null;
      try {
        res = await fetch(`${apiBase}${endpoints.songs.uploadChunk.path()}`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: form,
          signal: controller.signal,
        });
        json = (await res.json().catch((err: unknown) => {
          if (timedOut) throw err;
          return null;
        })) as typeof json;
      } catch (fetchErr) {
        if (timedOut) {
          lastErr = new Error(
            `This part of the file took longer than ${Math.round(timeoutMs / 1000)} s to send — the connection is too slow or has dropped.`,
            { cause: fetchErr }
          );
          continue;
        }
        // A fetch rejection only tells us no response came back. Check the file
        // before blaming the network — and never retry an unreadable file,
        // which is guaranteed to fail again and only delays the real message.
        const readFailure = await fileReadFailure(file);
        if (readFailure) throw new Error(readFailure, { cause: fetchErr });
        const detail =
          fetchErr instanceof Error ? `${fetchErr.name}: ${fetchErr.message}` : String(fetchErr);
        lastErr = new Error(`Upload failed (${detail}) — the connection may have dropped.`, {
          cause: fetchErr,
        });
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const code = json?.error?.code;
        lastErr = new UploadRefused(json?.error?.message ?? `Upload failed (${res.status})`, res.status, code);
        if (!isRetryableRefusal(res.status, code)) throw lastErr;
        continue;
      }
      lastErr = null;
      // The chunk was accepted; hold the response to the catalog's contract.
      checkEndpoint(endpoints.songs.uploadChunk, json?.data);
      if (!isLast) {
        onProgress?.({ stage: "uploading", progress: uploadingProgress(end), bytesSent: end, retry: null });
      }
      break;
    }
    if (lastErr) {
      throw new UploadInterrupted(
        `The upload stopped at ${formatMB(start)} of ${formatMB(file.size)} MB after ${MAX_ATTEMPTS} tries. ` +
          `${lastErr.message} Retry to continue from where it stopped.`,
        { file, uploadId, chunkSize, nextChunk: i },
        start,
        { cause: lastErr }
      );
    }
  }

  onProgress?.({ stage: "finishing", progress: 95, bytesSent: file.size, retry: null });
  onProgress?.({ stage: "finishing", progress: 100, bytesSent: file.size, retry: null });
  await new Promise((r) => setTimeout(r, FINISH_HOLD_MS));
}
