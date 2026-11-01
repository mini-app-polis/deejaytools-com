import type { ErrorEnvelope, SuccessEnvelope } from "./envelope";
import { useAuth } from "@clerk/clerk-react";
import { useCallback, useMemo } from "react";
import { Sentry } from "@/lib/instrument";

const base = import.meta.env.VITE_API_URL ?? "";

/**
 * Plain-language replacements for API errors whose own message is written
 * for developers. Every other error keeps the API's message, which is
 * written for the person using the site.
 */
const FRIENDLY_MESSAGES: Record<string, string> = {
  USER_NOT_SYNCED: "We're still setting up your account. Reload the page, or sign out and back in.",
};

/** Shown when the server or a proxy in front of it fails without an API error body. */
export const SERVER_UNAVAILABLE_MESSAGE =
  "The server is having trouble right now. Please try again in a moment.";

/** An API request that failed. `code` is the API's error code when the body carried one. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The response body as JSON, or undefined when it isn't JSON — an HTML error
 * page from Cloudflare or Railway, a proxy's plain-text 413, an empty body.
 */
async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const error = (body as { error: unknown }).error;
  return typeof error === "object" && error !== null && "message" in error;
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  const body = await readJsonBody(res);
  const parsed = body !== undefined;
  if (res.ok && parsed && !isErrorEnvelope(body)) {
    return (body as SuccessEnvelope<T>).data;
  }

  let err: ApiError;
  if (isErrorEnvelope(body)) {
    const { code, message } = body.error;
    err = new ApiError(FRIENDLY_MESSAGES[code] ?? message, res.status, code);
  } else if (res.status >= 500) {
    err = new ApiError(SERVER_UNAVAILABLE_MESSAGE, res.status);
  } else if (res.ok) {
    err = new ApiError("The server sent a response this page couldn't read. Please try again.", res.status);
  } else {
    err = new ApiError(`Request failed: ${res.status}`, res.status);
  }
  // 4xx are expected (validation, auth, not-found) — no need to track.
  // 5xx are unexpected server failures, and a success the page can't read is
  // a broken contract: forward both to Sentry so they surface even when the
  // component swallows them with a toast.
  if (res.status >= 500 || res.ok) {
    Sentry.captureException(err, {
      extra: { url: res.url, status: res.status, json: parsed },
    });
  }
  throw err;
}

/**
 * React hook returning get/post/postForm/patch/put/del helpers that call the
 * API with the signed-in user's Clerk token and unwrap the response envelope.
 */
export function useApiClient() {
  const { getToken } = useAuth();

  const withAuth = useCallback(
    async (init: RequestInit = {}) => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return { ...init, headers };
    },
    [getToken]
  );

  const get = useCallback(
    async <T>(path: string) => {
      const res = await fetch(`${base}${path}`, await withAuth());
      return parseEnvelope<T>(res);
    },
    [withAuth]
  );

  const post = useCallback(
    async <T>(path: string, body?: unknown) => {
      const res = await fetch(
        `${base}${path}`,
        await withAuth({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        })
      );
      return parseEnvelope<T>(res);
    },
    [withAuth]
  );

  const postForm = useCallback(
    async <T>(path: string, form: FormData) => {
      const res = await fetch(`${base}${path}`, await withAuth({ method: "POST", body: form }));
      return parseEnvelope<T>(res);
    },
    [withAuth]
  );

  const patch = useCallback(
    async <T>(path: string, body: unknown) => {
      const res = await fetch(
        `${base}${path}`,
        await withAuth({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
      return parseEnvelope<T>(res);
    },
    [withAuth]
  );

  const put = useCallback(
    async <T>(path: string, body: unknown) => {
      const res = await fetch(
        `${base}${path}`,
        await withAuth({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
      return parseEnvelope<T>(res);
    },
    [withAuth]
  );

  const del = useCallback(
    async (path: string): Promise<unknown> => {
      const res = await fetch(`${base}${path}`, await withAuth({ method: "DELETE" }));
      if (res.status === 204) return undefined;
      return parseEnvelope<unknown>(res);
    },
    [withAuth]
  );

  return useMemo(
    () => ({
      get,
      post,
      postForm,
      patch,
      put,
      del,
    }),
    [get, post, postForm, patch, put, del]
  );
}
