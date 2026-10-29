// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The global setup stubs this hook for component tests; test the real one here.
vi.unmock("@/hooks/useDivisions");

const { apiGet, apiClient } = vi.hoisted(() => {
  const apiGetFn = vi.fn();
  return {
    apiGet: apiGetFn,
    apiClient: { get: apiGetFn, post: vi.fn(), patch: vi.fn(), del: vi.fn(), postForm: vi.fn() },
  };
});
vi.mock("@/api/client", () => ({ useApiClient: () => apiClient }));

import { resetDivisionsCache, useDivisions } from "./useDivisions";

const LIST = { groups: [["Classic", "Showcase"], ["Masters"]], divisions: ["Classic", "Showcase", "Masters"] };

beforeEach(() => {
  resetDivisionsCache();
  apiGet.mockReset();
});

describe("useDivisions", () => {
  it("loads the list from GET /v1/divisions", async () => {
    apiGet.mockResolvedValue(LIST);
    const { result } = renderHook(() => useDivisions());
    expect(result.current.loading).toBe(true);
    expect(result.current.divisions).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual(LIST.groups);
    expect(result.current.divisions).toEqual(LIST.divisions);
    expect(result.current.error).toBeNull();
    expect(apiGet).toHaveBeenCalledWith("/v1/divisions");
  });

  it("fetches once for every caller", async () => {
    apiGet.mockResolvedValue(LIST);
    const first = renderHook(() => useDivisions());
    const second = renderHook(() => useDivisions());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    const later = renderHook(() => useDivisions());
    expect(later.result.current.loading).toBe(false);
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("reports a failed load, and tries again for the next caller", async () => {
    apiGet.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(LIST);
    const { result } = renderHook(() => useDivisions());
    await waitFor(() => expect(result.current.error).toBe("offline"));
    expect(result.current.loading).toBe(false);
    expect(result.current.divisions).toEqual([]);

    const retry = renderHook(() => useDivisions());
    await waitFor(() => expect(retry.result.current.divisions).toEqual(LIST.divisions));
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
