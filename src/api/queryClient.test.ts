import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { ContractViolation } from "./contract";
import { createQueryClient, shouldRetry } from "./queryClient";

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

describe("createQueryClient", () => {
  it("sets the retry rule and a shared staleTime as query defaults", () => {
    const defaults = createQueryClient().getDefaultOptions().queries;
    expect(defaults?.retry).toBe(shouldRetry);
    expect(defaults?.staleTime).toBeGreaterThan(0);
  });
});
