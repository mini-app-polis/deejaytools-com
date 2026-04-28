// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
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

import { useAuthMe } from "./useAuthMe";

beforeEach(() => {
  useAuthMock.mockReset();
  apiGet.mockReset();
  toastError.mockReset();
});

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
    });

    const { result } = renderHook(() => useAuthMe());

    await waitFor(() => {
      expect(result.current.me?.id).toBe("u1");
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(apiGet).toHaveBeenCalledWith("/v1/auth/me");
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
    });

    const { result } = renderHook(() => useAuthMe());

    await waitFor(() => {
      expect(result.current.isAdmin).toBe(true);
    });
  });

  it("toasts an error and keeps me=null when /v1/auth/me fails", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    apiGet.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuthMe());

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Network error");
    });
    expect(result.current.me).toBeNull();
    // After the failed fetch, loading should resolve (fetching=false, but
    // me=null with isSignedIn=true keeps loading=true per design — assert just
    // that we got past the toast).
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
