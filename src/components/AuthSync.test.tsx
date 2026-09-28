// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getToken = vi.fn();
const authState = { isLoaded: true, isSignedIn: true, getToken };
const userState: { isLoaded: boolean; user: unknown } = { isLoaded: true, user: null };

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => authState,
  useUser: () => userState,
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import AuthSync from "./AuthSync";

const fetchMock = vi.fn();

const clerkUser = (id: string) => ({
  id,
  primaryEmailAddress: { emailAddress: `${id}@example.com` },
  firstName: "Test",
  lastName: "User",
  fullName: "Test User",
});

beforeEach(() => {
  sessionStorage.clear();
  getToken.mockReset().mockResolvedValue("tok");
  fetchMock.mockReset();
  toastError.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  userState.user = clerkUser("user_a");
});

afterEach(() => vi.restoreAllMocks());

const ok = () => ({ ok: true, text: async () => "" }) as unknown as Response;
const fail = (status: number) =>
  ({ ok: false, status, text: async () => "boom" }) as unknown as Response;
const emailConflict = () =>
  ({
    ok: false,
    status: 409,
    text: async () =>
      JSON.stringify({
        error: {
          code: "EMAIL_BELONGS_TO_ANOTHER_ACCOUNT",
          message: "This email address is already linked to a different sign-in.",
        },
      }),
  }) as unknown as Response;

describe("AuthSync", () => {
  it("tells the user when their email belongs to another account, and stops retrying", async () => {
    fetchMock.mockResolvedValue(emailConflict());
    const { rerender } = render(<AuthSync />);
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toBe("This email address is already linked to a different sign-in.");

    // A retry cannot resolve it. Clerk handing over a fresh user object would
    // normally re-run the sync (up to three attempts); here it must not.
    userState.user = clerkUser("user_a");
    rerender(<AuthSync />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });

  it("syncs once and remembers success", async () => {
    fetchMock.mockResolvedValue(ok());
    const { unmount } = render(<AuthSync />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();

    render(<AuthSync />);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The bug: the "already synced" marker was written before the request, and
  // never cleared on failure. One transient failure left the user with no row,
  // so requireAuth answered USER_NOT_SYNCED (401) on every endpoint and the
  // sync never ran again for the life of the tab.
  it("retries after a failed sync instead of marking itself done", async () => {
    fetchMock.mockResolvedValueOnce(fail(500));
    const { unmount } = render(<AuthSync />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();

    fetchMock.mockResolvedValueOnce(ok());
    render(<AuthSync />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("retries when the session token is briefly unavailable", async () => {
    getToken.mockResolvedValueOnce(null);
    const { unmount } = render(<AuthSync />);
    await waitFor(() => expect(getToken).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();

    fetchMock.mockResolvedValueOnce(ok());
    render(<AuthSync />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  // A bare session key survived a sign-out/sign-in in the same tab, so the
  // second user inherited the first user's "already synced" marker.
  it("syncs a second user who signs in to the same tab", async () => {
    fetchMock.mockResolvedValue(ok());
    const { unmount } = render(<AuthSync />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();

    userState.user = clerkUser("user_b");
    render(<AuthSync />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
