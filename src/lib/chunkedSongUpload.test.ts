import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHUNK_SIZE,
  UploadRefused,
  isRetryableRefusal,
  uploadSongInChunks,
} from "./chunkedSongUpload";

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

  it("retries a genuine network failure three times", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(1024)], "ok.mp3", { type: "audio/mpeg" });

    await expect(uploadSongInChunks({ file, getToken, buildFormFields })).rejects.toThrow(
      /the connection may have dropped/
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
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

  it("gives up after three refused attempts with the last refusal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 408 }));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File([new Uint8Array(1024)], "ok.mp3", { type: "audio/mpeg" });

    await expect(
      uploadSongInChunks({ file, getToken, buildFormFields, retryDelayMs: 0 })
    ).rejects.toThrow("Upload failed (408)");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("isRetryableRefusal", () => {
  it.each([
    [500, "CHUNK_ERROR", true],
    [502, undefined, true],
    [408, undefined, true],
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
    [413, undefined, false],
  ])("status %i code %s → %s", (status, code, expected) => {
    expect(isRetryableRefusal(status, code)).toBe(expected);
  });
});
