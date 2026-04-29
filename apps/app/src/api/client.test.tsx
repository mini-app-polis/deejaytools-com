// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock Clerk's useAuth so we control whether a token is returned and what it
// is. The api client wraps every fetch with `Bearer <token>` if a token exists.
const getToken = vi.fn();
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken }),
}));

// Mock Sentry so captureException is a controllable spy and Sentry.init()
// side-effects (network calls, global handlers) don't run during tests.
// vi.hoisted() is required here: vi.mock() factories are hoisted above const
// declarations, so a plain `const captureException = vi.fn()` would not yet
// be initialized when the factory runs, causing a ReferenceError.
const { captureException } = vi.hoisted(() => ({
  captureException: vi.fn(),
}));
vi.mock("@/lib/instrument", () => ({
  Sentry: { captureException },
}));

import { useApiClient } from "./client";

// Mock global fetch — every test sets the response shape.
const fetchMock = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
  getToken.mockReset();
  captureException.mockReset();
  getToken.mockResolvedValue("fake-token");
});

afterEach(() => {
  vi.clearAllMocks();
});

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function noContentResponse() {
  return new Response(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// parseEnvelope (covered indirectly via get/post)
// ---------------------------------------------------------------------------

describe("useApiClient.get", () => {
  it("attaches an Authorization header when a token is present", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "1" }, meta: { version: "v1" } }));
    const { result } = renderHook(() => useApiClient());
    await result.current.get<{ id: string }>("/v1/foo");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer fake-token");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("does not attach Authorization when getToken returns null (signed-out)", async () => {
    getToken.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValue(jsonResponse({ data: [], meta: { version: "v1", count: 0 } }));
    const { result } = renderHook(() => useApiClient());
    await result.current.get("/v1/legacy-songs");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBeNull();
  });

  it("returns the unwrapped `data` field on success", async () => {
    const payload = { id: "abc", name: "Foo" };
    fetchMock.mockResolvedValue(jsonResponse({ data: payload, meta: { version: "v1" } }));
    const { result } = renderHook(() => useApiClient());

    const out = await result.current.get<typeof payload>("/v1/foo");
    expect(out).toEqual(payload);
  });

  it("throws an Error with the server's message when the envelope contains 'error'", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "BAD_REQUEST", message: "Bad input" } },
        { status: 400 }
      )
    );
    const { result } = renderHook(() => useApiClient());
    await expect(result.current.get("/v1/foo")).rejects.toThrow("Bad input");
  });

  it("throws a generic 'Request failed: <status>' when the server doesn't return an envelope", async () => {
    // res.ok === false but body is not an error envelope (no `error` key).
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }, { status: 500 }));
    const { result } = renderHook(() => useApiClient());
    await expect(result.current.get("/v1/foo")).rejects.toThrow("Request failed: 500");
  });
});

describe("useApiClient.post", () => {
  it("posts JSON with Content-Type and serialized body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true }, meta: { version: "v1" } }));
    const { result } = renderHook(() => useApiClient());
    await result.current.post("/v1/foo", { x: 1, y: 2 });

    const [, init] = fetchMock.mock.calls[0];
    const r = init as RequestInit;
    expect(r.method).toBe("POST");
    expect(r.body).toBe(JSON.stringify({ x: 1, y: 2 }));
    const headers = r.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("omits the body entirely when called without a payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null, meta: { version: "v1" } }));
    const { result } = renderHook(() => useApiClient());
    await result.current.post("/v1/foo");

    const r = fetchMock.mock.calls[0][1] as RequestInit;
    expect(r.body).toBeUndefined();
  });
});

describe("useApiClient.postForm", () => {
  it("sends multipart FormData without setting Content-Type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true }, meta: { version: "v1" } }));
    const { result } = renderHook(() => useApiClient());
    const form = new FormData();
    form.append("file", new Blob(["abc"]), "audio.mp3");

    await result.current.postForm("/v1/songs/upload/chunk", form);

    const r = fetchMock.mock.calls[0][1] as RequestInit;
    expect(r.method).toBe("POST");
    expect(r.body).toBeInstanceOf(FormData);
    // We deliberately do NOT set Content-Type for FormData — fetch generates
    // it with the correct multipart boundary.
    const headers = r.headers as Headers;
    expect(headers.get("Content-Type")).toBeNull();
  });
});

describe("useApiClient.patch", () => {
  it("sends PATCH with JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "1" }, meta: { version: "v1" } }));
    const { result } = renderHook(() => useApiClient());
    await result.current.patch("/v1/foo/1", { name: "renamed" });

    const r = fetchMock.mock.calls[0][1] as RequestInit;
    expect(r.method).toBe("PATCH");
    expect(r.body).toBe(JSON.stringify({ name: "renamed" }));
  });
});

describe("useApiClient.del", () => {
  it("sends DELETE and returns undefined on 204 No Content", async () => {
    fetchMock.mockResolvedValue(noContentResponse());
    const { result } = renderHook(() => useApiClient());
    const out = await result.current.del("/v1/foo/1");
    expect(out).toBeUndefined();

    const r = fetchMock.mock.calls[0][1] as RequestInit;
    expect(r.method).toBe("DELETE");
  });

  it("parses the envelope when DELETE returns a non-204 success body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { withdrawn: true }, meta: { version: "v1" } })
    );
    const { result } = renderHook(() => useApiClient());
    await expect(result.current.del("/v1/foo/1")).resolves.toBeUndefined();
  });

  it("throws when DELETE returns an error envelope", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "CONFLICT", message: "Cannot delete" } },
        { status: 409 }
      )
    );
    const { result } = renderHook(() => useApiClient());
    await expect(result.current.del("/v1/foo/1")).rejects.toThrow("Cannot delete");
  });
});

describe("useApiClient — memoization", () => {
  it("returns a stable client object across re-renders", async () => {
    const { result, rerender } = renderHook(() => useApiClient());
    const first = result.current;
    rerender();
    await waitFor(() => {
      expect(result.current).toBe(first);
    });
  });
});

describe("useApiClient — Sentry error capture", () => {
  it("calls Sentry.captureException for 5xx server errors", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }, { status: 500 }));
    const { result } = renderHook(() => useApiClient());
    await expect(result.current.get("/v1/foo")).rejects.toThrow("Request failed: 500");
    expect(captureException).toHaveBeenCalledOnce();
    const [err, opts] = captureException.mock.calls[0] as [Error, { extra: { url: string; status: number } }];
    expect(err).toBeInstanceOf(Error);
    expect(opts.extra.status).toBe(500);
  });

  it("calls Sentry.captureException for 5xx error-envelope responses", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Something broke" } }, { status: 503 })
    );
    const { result } = renderHook(() => useApiClient());
    await expect(result.current.get("/v1/foo")).rejects.toThrow("Something broke");
    expect(captureException).toHaveBeenCalledOnce();
  });

  it("does not call Sentry.captureException for 4xx client errors", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "BAD_REQUEST", message: "Bad input" } }, { status: 400 })
    );
    const { result } = renderHook(() => useApiClient());
    await expect(result.current.get("/v1/foo")).rejects.toThrow("Bad input");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("does not call Sentry.captureException for 404 not-found", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 })
    );
    const { result } = renderHook(() => useApiClient());
    await expect(result.current.get("/v1/foo")).rejects.toThrow("Not found");
    expect(captureException).not.toHaveBeenCalled();
  });
});
