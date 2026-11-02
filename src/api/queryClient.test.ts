import { QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { ContractViolation } from "./contract";
import { createQueryClient, retryDelay, shouldRetry } from "./queryClient";

describe("shouldRetry", () => {
  it("does not retry a 4xx, which would answer the same way again", () => {
    expect(shouldRetry(0, new ApiError("Not found", 404))).toBe(false);
    expect(shouldRetry(0, new ApiError("Unauthorized", 401))).toBe(false);
  });

  it("does not retry a response that broke its contract", () => {
    expect(shouldRetry(0, new ContractViolation("sessions.list", []))).toBe(false);
  });

  it("retries a 5xx or a network error a bounded number of times", () => {
    expect(shouldRetry(0, new ApiError("Unavailable", 503))).toBe(true);
    expect(shouldRetry(1, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(2, new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("throttling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries a 429 or 503 more times than other failures", () => {
    expect(shouldRetry(0, new ApiError("Slow down", 429))).toBe(true);
    expect(shouldRetry(3, new ApiError("Slow down", 429))).toBe(true);
    expect(shouldRetry(4, new ApiError("Slow down", 429))).toBe(false);
    expect(shouldRetry(3, new ApiError("Unavailable", 503))).toBe(true);
    expect(shouldRetry(2, new ApiError("Boom", 500))).toBe(false);
  });

  it("waits at least the Retry-After, with jitter on top", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(retryDelay(0, new ApiError("Slow down", 429, undefined, 10_000))).toBe(10_500);
    expect(retryDelay(0, new ApiError("Slow down", 429, undefined, 3_600_000))).toBe(60_500);
  });

  it("backs off exponentially when there is no Retry-After", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(retryDelay(0, new ApiError("Slow down", 429))).toBe(1_000);
    expect(retryDelay(1, new ApiError("Slow down", 429))).toBe(2_000);
    expect(retryDelay(2, new TypeError("Failed to fetch"))).toBe(4_000);
    expect(retryDelay(10, new ApiError("Slow down", 429))).toBe(30_000);
  });

  it("retries a 429 after its Retry-After instead of surfacing the error", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const client = createQueryClient();
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("Slow down", 429, undefined, 5_000))
      .mockResolvedValue("ok");
    const observer = new QueryObserver(client, { queryKey: ["x"], queryFn });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(4_900);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().isError).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(observer.getCurrentResult().data).toBe("ok");

    unsubscribe();
    vi.useRealTimers();
  });
});

describe("createQueryClient", () => {
  it("sets the retry rule and a shared staleTime as query defaults", () => {
    const defaults = createQueryClient().getDefaultOptions().queries;
    expect(defaults?.retry).toBe(shouldRetry);
    expect(defaults?.retryDelay).toBe(retryDelay);
    expect(defaults?.staleTime).toBeGreaterThan(0);
  });
});
