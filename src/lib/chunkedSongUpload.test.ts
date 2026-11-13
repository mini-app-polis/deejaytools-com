import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ATTEMPTS,
  MAX_TOTAL_CHUNKS,
  MIN_CHUNK_BYTES,
  UploadInterrupted,
  UploadRefused,
  chunkSizeFor,
  chunkTimeoutMs,
  isRetryableRefusal,
  retryDelay,
  uploadSongInChunks,
  type ChunkUploadProgress,
} from "./chunkedSongUpload";

const CHUNK_SIZE = MIN_CHUNK_BYTES;

const getToken = vi.fn().mockResolvedValue("test-token");
const buildFormFields = vi.fn(() => ({ division: "Classic" }));

function okFetchResponse(): Response {
  return {
    ok: true,
    json: async () => ({ data: { received: true, complete: false } }),
  } as Response;
}

function makeUnreadableFile(name = "cloud.mp3", size = 1024): File {
  const file = new File([new Uint8Array(size)], name, { type: "audio/mpeg" });
  const originalSlice = file.slice.bind(file);
  file.slice = (...args: Parameters<File["slice"]>) => {
    const blob = originalSlice(...args);
    blob.arrayBuffer = () =>
      Promise.reject(new DOMException("The operation failed", "NotReadableError"));
    return blob;
  };
  return file;
}

/** Readable at both ends for the upfront probe, then unreadable on the first upload read. */
function makeDelayedUnreadableFile(size = 1024): File {
  const file = new File([new Uint8Array(size)], "cloud.mp3", { type: "audio/mpeg" });
  const originalSlice = file.slice.bind(file);
  let arrayBufferCalls = 0;
  file.slice = (...args: Parameters<File["slice"]>) => {
    const blob = originalSlice(...args);
    const origAB = blob.arrayBuffer.bind(blob);
    blob.arrayBuffer = async () => {
      arrayBufferCalls++;
      if (arrayBufferCalls <= 2) return origAB();
      throw new DOMException("The operation failed", "NotReadableError");
    };
    return blob;
  };
  return file;
}

describe("uploadSongInChunks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    getToken.mockClear();
    buildFormFields.mockClear();
  });

  it("uploads a readable file with one fetch per chunk", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okFetchResponse());
    vi.stubGlobal("fetch", fetchMock);

    const size = CHUNK_SIZE + 100;
    const file = new File([new Uint8Array(size)], "ok.mp3", { type: "audio/mpeg" });

    await uploadSongInChunks({ file, getToken, buildFormFields });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fast-fails an unreadable file without calling fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okFetchResponse());
    vi.stubGlobal("fetch", fetchMock);

    const file = makeUnreadableFile();

    await expect(uploadSongInChunks({ file, getToken, buildFormFields })).rejects.toThrow(
      /couldn't be read from disk/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fast-fails a zero-byte file with an empty-file message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okFetchResponse());
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([], "empty.mp3", { type: "audio/mpeg" });

    let message = "";
    try {
      await uploadSongInChunks({ file, getToken, buildFormFields });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/is empty \(0 bytes\)/);
    expect(message).not.toMatch(/cloud/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not retry when a readable file becomes unreadable during the first chunk", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const file = makeDelayedUnreadableFile();

    await expect(uploadSongInChunks({ file, getToken, buildFormFields })).rejects.toThrow(
      /couldn't be read from disk/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a genuine network failure, then stops with a resumable error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(1024)], "ok.mp3", { type: "audio/mpeg" });

    const err = await uploadSongInChunks({ file, getToken, buildFormFields, retryDelayMs: 0 }).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(UploadInterrupted);
    expect((err as Error).message).toMatch(/the connection may have dropped/);
    expect((err as Error).message).toMatch(/Retry to continue/);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("stops at a final refusal without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "ENTITY_SLOT_TAKEN", message: "taken" } }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(1024)], "ok.mp3", { type: "audio/mpeg" });

    const err = await uploadSongInChunks({ file, getToken, buildFormFields }).catch((e) => e);
    expect(err).toBeInstanceOf(UploadRefused);
    expect(err.code).toBe("ENTITY_SLOT_TAKEN");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  function refusal(status: number, code: string, message: string): Response {
    return new Response(JSON.stringify({ error: { code, message } }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("stops at UNSUPPORTED_FORMAT on the final chunk and shows the API's message", async () => {
    const message = "That file doesn't look like a supported audio format.";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okFetchResponse())
      .mockResolvedValue(refusal(400, "UNSUPPORTED_FORMAT", message));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(CHUNK_SIZE + 100)], "doc.mp3", { type: "audio/mpeg" });

    const err = await uploadSongInChunks({ file, getToken, buildFormFields, retryDelayMs: 0 }).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(UploadRefused);
    expect((err as UploadRefused).message).toBe(message);
    expect((err as UploadRefused).code).toBe("UNSUPPORTED_FORMAT");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops when a chunk takes the file over the size limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okFetchResponse())
      .mockResolvedValue(refusal(400, "BAD_REQUEST", "File exceeds 100 MB limit"));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(2 * CHUNK_SIZE + 100)], "big.mp3", { type: "audio/mpeg" });

    await expect(
      uploadSongInChunks({ file, getToken, buildFormFields, retryDelayMs: 0 })
    ).rejects.toThrow("File exceeds 100 MB limit");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops at TOO_MANY_UPLOADS and shows the API's message", async () => {
    const message = "You have 3 uploads in progress. Finish or wait for one before starting another.";
    const fetchMock = vi.fn().mockResolvedValue(refusal(429, "TOO_MANY_UPLOADS", message));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(1024)], "ok.mp3", { type: "audio/mpeg" });

    await expect(
      uploadSongInChunks({ file, getToken, buildFormFields, retryDelayMs: 0 })
    ).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries the rate limit and server errors, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refusal(429, "too_many_requests", "Rate limit exceeded. Please slow down."))
      .mockResolvedValueOnce(new Response("<html>502 Bad Gateway</html>", { status: 502 }))
      .mockResolvedValue(okFetchResponse());
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(1024)], "ok.mp3", { type: "audio/mpeg" });

    await uploadSongInChunks({ file, getToken, buildFormFields, retryDelayMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last refused attempt with the last refusal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 408 }));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(1024)], "ok.mp3", { type: "audio/mpeg" });

    const err = await uploadSongInChunks({ file, getToken, buildFormFields, retryDelayMs: 0 }).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(UploadInterrupted);
    expect((err as Error).message).toContain("Upload failed (408)");
    expect((err as Error).cause).toBeInstanceOf(UploadRefused);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  /** A fetch that never answers until its signal aborts, as a stalled upload. */
  function stalledFetch(_url: string, init?: RequestInit): Promise<Response> {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError"))
      );
    });
  }

  it("aborts a chunk that overruns its timeout and retries it", async () => {
    const fetchMock = vi.fn().mockImplementationOnce(stalledFetch).mockResolvedValue(okFetchResponse());
    vi.stubGlobal("fetch", fetchMock);
    const updates: ChunkUploadProgress[] = [];

    const file = new File([new Uint8Array(1024)], "ok.mp3", { type: "audio/mpeg" });

    await uploadSongInChunks({
      file,
      getToken,
      buildFormFields,
      retryDelayMs: 0,
      chunkTimeoutMs: 5,
      onProgress: (u) => updates.push(u),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    const retry = updates.find((u) => u.retry)?.retry;
    expect(retry).toMatchObject({ attempt: 2, maxAttempts: MAX_ATTEMPTS });
    expect(retry?.reason).toMatch(/took longer than/);
    // The notice clears once the chunk goes through.
    expect(updates.at(-1)?.retry).toBeNull();
  });

  it("stops with a resumable error when every attempt times out", async () => {
    const fetchMock = vi.fn().mockImplementation(stalledFetch);
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(1024)], "ok.mp3", { type: "audio/mpeg" });

    const err = await uploadSongInChunks({
      file,
      getToken,
      buildFormFields,
      retryDelayMs: 0,
      chunkTimeoutMs: 5,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UploadInterrupted);
    expect((err as Error).message).toMatch(/too slow or has dropped/);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  function sentFields(call: unknown[]): { uploadId: string; index: string; total: string } {
    const form = (call[1] as RequestInit).body as FormData;
    return {
      uploadId: String(form.get("upload_id")),
      index: String(form.get("chunk_index")),
      total: String(form.get("total_chunks")),
    };
  }

  it("resumes an interrupted upload from the chunk that failed, under the same upload_id", async () => {
    const file = new File([new Uint8Array(3 * CHUNK_SIZE)], "three.mp3", { type: "audio/mpeg" });
    const failing = vi
      .fn()
      .mockResolvedValueOnce(okFetchResponse())
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", failing);

    const err = (await uploadSongInChunks({ file, getToken, buildFormFields, retryDelayMs: 0 }).catch(
      (e: unknown) => e
    )) as UploadInterrupted;
    expect(err).toBeInstanceOf(UploadInterrupted);
    expect(err.resume.nextChunk).toBe(1);
    expect(err.bytesSent).toBe(CHUNK_SIZE);
    const firstId = sentFields(failing.mock.calls[0]!).uploadId;

    const resumed = vi.fn().mockResolvedValue(okFetchResponse());
    vi.stubGlobal("fetch", resumed);
    const updates: ChunkUploadProgress[] = [];
    await uploadSongInChunks({
      file,
      getToken,
      buildFormFields,
      retryDelayMs: 0,
      resume: err.resume,
      onProgress: (u) => updates.push(u),
    });

    expect(resumed.mock.calls.map((c) => sentFields(c))).toEqual([
      { uploadId: firstId, index: "1", total: "3" },
      { uploadId: firstId, index: "2", total: "3" },
    ]);
    expect(updates[0]).toMatchObject({ stage: "uploading", bytesSent: CHUNK_SIZE });
  });

  it("starts over when the resume is for another file", async () => {
    const original = new File([new Uint8Array(2 * CHUNK_SIZE)], "a.mp3", { type: "audio/mpeg" });
    const other = new File([new Uint8Array(2 * CHUNK_SIZE)], "b.mp3", { type: "audio/mpeg" });
    const fetchMock = vi.fn().mockResolvedValue(okFetchResponse());
    vi.stubGlobal("fetch", fetchMock);

    await uploadSongInChunks({
      file: other,
      getToken,
      buildFormFields,
      resume: { file: original, uploadId: "11111111-1111-4111-8111-111111111111", chunkSize: CHUNK_SIZE, nextChunk: 1 },
    });

    const sent = fetchMock.mock.calls.map((c) => sentFields(c));
    expect(sent.map((f) => f.index)).toEqual(["0", "1"]);
    expect(sent[0]!.uploadId).not.toBe("11111111-1111-4111-8111-111111111111");
  });

  it("does not resume after a refusal: the error is not UploadInterrupted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(refusal(400, "UNSUPPORTED_FORMAT", "nope"));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(1024)], "ok.mp3", { type: "audio/mpeg" });

    const err = await uploadSongInChunks({ file, getToken, buildFormFields }).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(UploadInterrupted);
  });
});

describe("chunk sizing", () => {
  it("cuts a typical song into 1 MiB chunks", () => {
    // A 4-minute 320 kbps MP3 is about 9.6 MB.
    expect(chunkSizeFor(9_600_000)).toBe(MIN_CHUNK_BYTES);
  });

  it("grows the chunk so no file needs more than the API's 30 chunks", () => {
    const max = 100 * 1024 * 1024;
    const size = chunkSizeFor(max);
    expect(Math.ceil(max / size)).toBeLessThanOrEqual(MAX_TOTAL_CHUNKS);
    // Under the API's MAX_CHUNK_BYTES (10 MB).
    expect(size).toBeLessThan(10 * 1024 * 1024);
  });

  it("gives a 1 MiB chunk about 2.7 times what it takes at Slow 4G (50 KB/s)", () => {
    const atSlow4g = (MIN_CHUNK_BYTES / 50_000) * 1000;
    expect(chunkTimeoutMs(MIN_CHUNK_BYTES, false)).toBeGreaterThan(2.5 * atSlow4g);
  });

  it("gives the last chunk extra time for the API's processing", () => {
    expect(chunkTimeoutMs(MIN_CHUNK_BYTES, true)).toBeGreaterThan(chunkTimeoutMs(MIN_CHUNK_BYTES, false));
  });
});

describe("retryDelay", () => {
  it("doubles per retry", () => {
    const fixed = () => 1;
    expect([2, 3, 4].map((a) => retryDelay(1000, a, fixed))).toEqual([1000, 2000, 4000]);
  });

  it("jitters between half and all of the backoff", () => {
    expect(retryDelay(1000, 3, () => 0)).toBe(1000);
    expect(retryDelay(1000, 3, () => 0.5)).toBe(1500);
  });
});

describe("isRetryableRefusal", () => {
  it.each([
    [500, "CHUNK_ERROR", true],
    [502, undefined, true],
    [408, undefined, true],
    [499, undefined, true],
    [429, "too_many_requests", true],
    [429, undefined, true],
    [429, "TOO_MANY_UPLOADS", false],
    [400, "UNSUPPORTED_FORMAT", false],
    [400, "BAD_REQUEST", false],
    [401, "UNAUTHORIZED", false],
    [403, "FORBIDDEN", false],
    [404, "NOT_FOUND", false],
    [409, "ENTITY_SLOT_TAKEN", false],
    [409, "CHUNK_MISSING", false],
    [409, "UPLOAD_IN_PROGRESS", true],
    [413, undefined, false],
  ])("status %i code %s → %s", (status, code, expected) => {
    expect(isRetryableRefusal(status, code)).toBe(expected);
  });
});
