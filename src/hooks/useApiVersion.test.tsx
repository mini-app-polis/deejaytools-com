// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useApiVersion } from "./useApiVersion";

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useApiVersion", () => {
  it("reads the version and commit from GET /version", async () => {
    respond(200, { version: "1.2.3", commit: "0dc51f0b88b12830c0faacb1f5dfa7ca9a7c35e6" });
    const { result } = renderHook(() => useApiVersion());
    await waitFor(() =>
      expect(result.current).toEqual({
        version: "1.2.3",
        commit: "0dc51f0b88b12830c0faacb1f5dfa7ca9a7c35e6",
      })
    );
    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/version$/);
  });

  it("treats a null commit as no commit", async () => {
    respond(200, { version: "1.2.3", commit: null });
    const { result } = renderHook(() => useApiVersion());
    await waitFor(() => expect(result.current).toEqual({ version: "1.2.3", commit: null }));
  });

  it("stays null when the API has no /version", async () => {
    respond(404, { error: { code: "NOT_FOUND", message: "Not found" } });
    const { result } = renderHook(() => useApiVersion());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("stays null when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    const { result } = renderHook(() => useApiVersion());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
