import type { ErrorEvent } from "@sentry/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dropOfflineClerkLoadFailure, sentryEnvironment, tracePropagationTargets } from "./sentryOptions";

describe("dropOfflineClerkLoadFailure", () => {
  const api = "https://api.deejaytools.com";
  const fetchCrumb = (path: string, status_code?: number) => ({
    category: "fetch",
    data: { url: `${api}${path}`, ...(status_code ? { status_code } : {}) },
  });
  const clerkEvent = (breadcrumbs: ErrorEvent["breadcrumbs"] = []): ErrorEvent => ({
    type: undefined,
    breadcrumbs,
    exception: { values: [{ value: "failed_to_load_clerk_js_timeout" }] },
  });
  const clerkHint = (code: string) => ({ originalException: { code } });

  afterEach(() => vi.unstubAllGlobals());

  it("drops Clerk load failures when the device is offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    for (const code of ["failed_to_load_clerk_js", "failed_to_load_clerk_js_timeout"]) {
      expect(dropOfflineClerkLoadFailure(clerkEvent(), clerkHint(code), api)).toBeNull();
    }
  });

  it("drops Clerk load failures when the preceding API fetches failed too", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const event = clerkEvent([fetchCrumb("/v1/a"), fetchCrumb("/v1/b")]);
    expect(dropOfflineClerkLoadFailure(event, clerkHint("failed_to_load_clerk_js_timeout"), api)).toBeNull();
  });

  it("keeps Clerk load failures while the network is up", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const ok =clerkEvent([fetchCrumb("/v1/a", 200)]);
    expect(dropOfflineClerkLoadFailure(ok, clerkHint("failed_to_load_clerk_js"), api)).toBe(ok);
    const none = clerkEvent();
    expect(dropOfflineClerkLoadFailure(none, clerkHint("failed_to_load_clerk_js"), api)).toBe(none);
  });

  it("keeps other errors even when offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const event:ErrorEvent = { type: undefined, exception: { values: [{ value: "Failed to fetch" }] } };
    expect(dropOfflineClerkLoadFailure(event, { originalException: new TypeError("Failed to fetch") }, api)).toBe(event);
  });
});

describe("sentryEnvironment", () => {
  it.each([
    ["production", "production"],
    ["development", "development"],
    ["local", "local"],
    [undefined, "local"],
    ["", "local"],
    ["preview", "local"],
  ])("%s → %s", (value, expected) => {
    expect(sentryEnvironment(value)).toBe(expected);
  });
});

describe("tracePropagationTargets", () => {
  it("leaves same-origin to Sentry's default", () => {
    expect(tracePropagationTargets("")).toBeUndefined();
    expect(tracePropagationTargets(undefined)).toBeUndefined();
  });

  it("leaves an unreadable URL alone", () => {
    expect(tracePropagationTargets("not a url")).toBeUndefined();
  });

  it("matches the API origin and its paths only", () => {
    const [target] = tracePropagationTargets("https://api.deejaytools.com") as [RegExp];
    expect(target.test("https://api.deejaytools.com/v1/songs/upload/chunk")).toBe(true);
    expect(target.test("https://api.deejaytools.com")).toBe(true);
    expect(target.test("https://api.deejaytools.com.evil.example/v1")).toBe(false);
    expect(target.test("https://clerk.deejaytools.com/v1/client")).toBe(false);
    expect(target.test("http://api.deejaytools.com/v1")).toBe(false);
  });
});
