// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above all imports, so they cannot reference
// top-level `const` variables. vi.hoisted() lifts these definitions to the
// same hoisted scope, making them safe to reference inside the factories.
const { useAuthMock, apiGet, apiClient, toastError } = vi.hoisted(() => {
  const apiGetFn = vi.fn();
  return {
    useAuthMock: vi.fn(),
    apiGet: apiGetFn,
    apiClient: {
      get: apiGetFn,
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
      postForm: vi.fn(),
    },
    toastError: vi.fn(),
  };
});

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

import { resetAuthMeCache, useAuthMe } from "./useAuthMe";
import {
  markAuthSyncPending,
  markAuthSyncSettled,
  resetAuthSyncStatus,
} from "@/lib/authSyncStatus";

beforeEach(() => {
  resetAuthMeCache();
  resetAuthSyncStatus();
  useAuthMock.mockReset();
  apiGet.mockReset();
  toastError.mockReset();
});

function meRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "alice@example.com",
    display_name: "Alice",
    first_name: "Alice",
    last_name: "Smith",
    role: "user",
    created_at: 1,
    updated_at: 2,
    event_roles: [],
    ...overrides,
  };
}

describe("useAuthMe", () => {
  it("returns loading=true and me=null while Clerk hasn't loaded yet", () => {
    useAuthMock.mockReturnValue({ isLoaded: false, isSignedIn: false });
    const { result } = renderHook(() => useAuthMe());
    expect(result.current.me).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.isAdmin).toBe(false);
  });

  it("returns loading=false and me=null when Clerk is loaded but user is signed out", () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const { result } = renderHook(() => useAuthMe());
    expect(result.current.me).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    // No fetch should have been issued for the signed-out user.
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("fetches /v1/auth/me on mount when signed in and exposes role/isAdmin", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    apiGet.mockResolvedValue({
      id: "u1",
      email: "alice@example.com",
      display_name: "Alice",
      first_name: "Alice",
      last_name: "Smith",
      role: "user",
      created_at: 1,
      updated_at: 2,
      event_roles: [],
    });

    const { result } = renderHook(() => useAuthMe());

    await waitFor(() => {
      expect(result.current.me?.id).toBe("u1");
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(apiGet).toHaveBeenCalledWith("/v1/auth/me");
  });

  it("exposes the caller's event roles, and an empty list when they hold none", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    apiGet.mockResolvedValue({
      id: "u1",
      email: "dj@example.com",
      display_name: null,
      first_name: null,
      last_name: null,
      role: "user",
      created_at: 1,
      updated_at: 2,
      event_roles: [
        { event_id: "ev-1", role: "dj" },
        { event_id: "ev-2", role: "coordinator" },
      ],
    });

    const { result } = renderHook(() => useAuthMe());

    await waitFor(() => {
      expect(result.current.eventRoles).toHaveLength(2);
    });
    expect(result.current.eventRoles[0]).toEqual({ event_id: "ev-1", role: "dj" });
    expect(result.current.isAdmin).toBe(false);
  });

  it("gives no event roles while signed out", () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const { result } = renderHook(() => useAuthMe());
    expect(result.current.eventRoles).toEqual([]);
  });

  it("sets isAdmin=true when role is 'admin'", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    apiGet.mockResolvedValue({
      id: "admin-1",
      email: null,
      display_name: null,
      first_name: null,
      last_name: null,
      role: "admin",
      created_at: 1,
      updated_at: 2,
      event_roles: [],
    });

    const { result } = renderHook(() => useAuthMe());

    await waitFor(() => {
      expect(result.current.isAdmin).toBe(true);
    });
  });

  it("ends loading with an error when /v1/auth/me fails, and reload() recovers", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    apiGet.mockRejectedValueOnce(new Error("Network error")).mockResolvedValue(meRow());

    const { result } = renderHook(() => useAuthMe());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Network error");
    expect(result.current.me).toBeNull();
    expect(toastError).toHaveBeenCalledExactlyOnceWith("Network error");

    await act(() => result.current.reload());
    expect(result.current.me?.id).toBe("u1");
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("fetches once for every concurrent caller, and toasts a failure once", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    apiGet.mockRejectedValue(new Error("down"));

    const callers = [1, 2, 3].map(() => renderHook(() => useAuthMe()));

    for (const c of callers) {
      await waitFor(() => expect(c.result.current.error).toBe("down"));
    }
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);

    // A caller mounted later reads the shared answer rather than asking again.
    const later = renderHook(() => useAuthMe());
    expect(later.result.current.error).toBe("down");
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("reload() refreshes every caller", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    apiGet
      .mockResolvedValueOnce(meRow({ event_roles: [{ event_id: "ev-1", role: "dj" }] }))
      .mockResolvedValue(meRow({ event_roles: [] }));

    const nav = renderHook(() => useAuthMe());
    const page = renderHook(() => useAuthMe());
    await waitFor(() => expect(nav.result.current.eventRoles).toHaveLength(1));
    expect(apiGet).toHaveBeenCalledTimes(1);

    await act(() => page.result.current.reload());
    expect(nav.result.current.eventRoles).toEqual([]);
    expect(page.result.current.eventRoles).toEqual([]);
    // The record stayed on screen while the reload was out.
    expect(nav.result.current.loading).toBe(false);
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("waits for the account sync and asks again when /me answers USER_NOT_SYNCED", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    markAuthSyncPending();
    const notSynced = Object.assign(new Error("We're still setting up your account."), {
      code: "USER_NOT_SYNCED",
    });
    apiGet.mockRejectedValueOnce(notSynced).mockResolvedValue(meRow());

    const { result } = renderHook(() => useAuthMe());
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    // Still waiting on the sync: no second request, no error.
    await new Promise((r) => setTimeout(r, 10));
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    act(() => markAuthSyncSettled());
    await waitFor(() => expect(result.current.me?.id).toBe("u1"));
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("asks only once more after USER_NOT_SYNCED, then reports the failure", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    markAuthSyncSettled();
    const notSynced = Object.assign(new Error("still setting up"), { code: "USER_NOT_SYNCED" });
    apiGet.mockRejectedValue(notSynced);

    const { result } = renderHook(() => useAuthMe());
    await waitFor(() => expect(result.current.error).toBe("still setting up"));
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("forgets the record on sign-out", async () => {
    const auth = { isLoaded: true, isSignedIn: true };
    useAuthMock.mockImplementation(() => auth);
    apiGet.mockResolvedValue(meRow());

    const { result, rerender } = renderHook(() => useAuthMe());
    await waitFor(() => expect(result.current.me?.id).toBe("u1"));

    auth.isSignedIn = false;
    rerender();
    await waitFor(() => expect(result.current.me).toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    // reload() while signed out asks nothing.
    await act(() => result.current.reload());
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic error message when the rejection is not an Error", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    apiGet.mockRejectedValue("plain string");

    renderHook(() => useAuthMe());

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to load profile");
    });
  });
});
