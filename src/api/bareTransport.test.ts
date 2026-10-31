import { afterEach, describe, expect, it, vi } from "vitest";
import { BareStatusError, bareJsonTransport } from "./bareTransport";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bareJsonTransport", () => {
  it("GETs the path under the base URL and returns the body as it is", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version: "1.0.0", commit: null })));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    const body = await bareJsonTransport("https://api.example", { signal: controller.signal }).get("/version");

    expect(body).toEqual({ version: "1.0.0", commit: null });
    expect(fetchMock).toHaveBeenCalledWith("https://api.example/version", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  });

  it("throws the status on a non-2xx answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const err = await bareJsonTransport("").get("/version").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BareStatusError);
    expect((err as BareStatusError).status).toBe(503);
  });

  it("refuses every method but GET", async () => {
    const t = bareJsonTransport("");
    await expect(t.post("/x")).rejects.toThrow(/GET only/);
    await expect(t.patch("/x", {})).rejects.toThrow(/GET only/);
    await expect(t.put("/x", {})).rejects.toThrow(/GET only/);
    await expect(t.del("/x")).rejects.toThrow(/GET only/);
  });
});
