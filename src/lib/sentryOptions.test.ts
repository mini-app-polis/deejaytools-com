import { describe, expect, it } from "vitest";
import { sentryEnvironment, tracePropagationTargets } from "./sentryOptions";

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
