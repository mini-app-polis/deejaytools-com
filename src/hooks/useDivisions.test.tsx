// @vitest-environment jsdom
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, renderHook as rtlRenderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
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

import { useDivisions } from "./useDivisions";
import { createTestQueryClient } from "@/test/render";

// Every hook in one test shares one client, as every caller in the app does.
let client: QueryClient;

function renderHook<T>(hook: () => T) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return rtlRenderHook(hook, { wrapper });
}

const LIST = { groups: [["Classic", "Showcase"], ["Masters"]], divisions: ["Classic", "Showcase", "Masters"] };

beforeEach(() => {
  client = createTestQueryClient();
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

  it("loads again when the caller retries after a failure", async () => {
    let answer: (list: typeof LIST) => void = () => {};
    apiGet.mockRejectedValueOnce(new Error("offline")).mockReturnValue(new Promise((r) => (answer = r)));
    const { result } = renderHook(() => useDivisions());
    await waitFor(() => expect(result.current.error).toBe("offline"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.error).toBeNull();
    act(() => answer(LIST));
    await waitFor(() => expect(result.current.divisions).toEqual(LIST.divisions));
    expect(result.current.error).toBeNull();
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
