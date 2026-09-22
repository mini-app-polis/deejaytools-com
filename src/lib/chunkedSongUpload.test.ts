import { afterEach, describe, expect, it, vi } from "vitest";
import { CHUNK_SIZE, uploadSongInChunks } from "./chunkedSongUpload";

const getToken = vi.fn().mockResolvedValue("test-token");
const buildFormFields = vi.fn(() => ({ division: "Classic" }));

function okFetchResponse(): Response {
  return { ok: true, json: async () => ({}) } as Response;
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
});
