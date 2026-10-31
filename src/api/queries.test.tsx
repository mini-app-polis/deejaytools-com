// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiClient = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  postForm: vi.fn(),
};
vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  useApiClient: () => apiClient,
}));

import { endpoints } from "./endpoints";
import { useEndpointMutation, useEndpointQuery } from "./queries";
import { queryKey } from "./queryKeys";
import { fx } from "@/test/fixtures";
import { createTestQueryClient } from "@/test/render";

function setup() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  for (const fn of Object.values(apiClient)) fn.mockReset();
});

describe("useEndpointQuery", () => {
  it("calls the endpoint's path, validates the response and caches it under the endpoint key", async () => {
    const session = fx.session({ id: "s1" });
    apiClient.get.mockResolvedValue([session]);
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useEndpointQuery(endpoints.sessions.list, { params: { eventId: "e1" } }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith("/v1/sessions?event_id=e1");
    expect(result.current.data).toEqual([session]);
    expect(client.getQueryData(queryKey(endpoints.sessions.list, { eventId: "e1" }))).toEqual([session]);
  });

  it("surfaces a failed request as the query's error", async () => {
    apiClient.get.mockRejectedValue(new Error("boom"));
    const { wrapper } = setup();

    const { result } = renderHook(() => useEndpointQuery(endpoints.sessions.list), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("boom");
  });

  it("passes query options through", () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useEndpointQuery(endpoints.sessions.list, { enabled: false }), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});

describe("useEndpointMutation", () => {
  it("sends params and body through call() and invalidates every variant of the listed endpoints", async () => {
    const updated = fx.session({ id: "s1" });
    apiClient.patch.mockResolvedValue(updated);
    const onSuccess = vi.fn();
    const { client, wrapper } = setup();
    client.setQueryData(queryKey(endpoints.sessions.list), []);
    client.setQueryData(queryKey(endpoints.sessions.list, { eventId: "e1" }), []);
    client.setQueryData(queryKey(endpoints.events.list), []);

    const { result } = renderHook(
      () => useEndpointMutation(endpoints.sessions.update, { invalidates: [endpoints.sessions.list], onSuccess }),
      { wrapper }
    );
    await act(() => result.current.mutateAsync({ params: { id: "s1" }, body: { name: "New" } }));

    expect(apiClient.patch).toHaveBeenCalledWith("/v1/sessions/s1", { name: "New" });
    expect(onSuccess).toHaveBeenCalled();
    expect(client.getQueryState(queryKey(endpoints.sessions.list))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKey(endpoints.sessions.list, { eventId: "e1" }))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKey(endpoints.events.list))?.isInvalidated).toBe(false);
  });

  it("invalidates nothing when the call fails", async () => {
    apiClient.post.mockRejectedValue(new Error("nope"));
    const { client, wrapper } = setup();
    client.setQueryData(queryKey(endpoints.sessions.list), []);

    const { result } = renderHook(
      () => useEndpointMutation(endpoints.sessions.create, { invalidates: [endpoints.sessions.list] }),
      { wrapper }
    );
    await act(async () => {
      await expect(result.current.mutateAsync({ body: {} })).rejects.toThrow("nope");
    });

    expect(client.getQueryState(queryKey(endpoints.sessions.list))?.isInvalidated).toBe(false);
  });
});
