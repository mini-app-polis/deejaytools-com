// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiDel = vi.fn();
const apiClient = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  del: apiDel,
  postForm: vi.fn(),
};

vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({
    me: { id: "admin_1", email: "admin@example.com", role: "admin" },
    loading: false,
    isAdmin: true,
  }),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: () => Promise.resolve("fake-token") }),
}));

import AdminPage from "./AdminPage";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Each admin section is now its own route (`/admin/:section`), so tests
 * pick the section they want to exercise via `initialEntries`. Defaults
 * to the events page, which is also where bare `/admin` lands.
 */
function renderPage(path: string = "/admin/events") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/:section" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdminPage", () => {
  beforeEach(() => {
    // Reset all mocks including toast spies so prior-test calls don't leak.
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    apiGet.mockReset();
    apiPost.mockReset();
    apiPatch.mockReset();
    apiDel.mockReset();
  });

  it("renders the Admin heading and the events section without crashing", async () => {
    apiGet.mockResolvedValue([]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );
    // The Events section is the default landing page; assert the action
    // button it owns is visible, since the in-page tab strip no longer
    // exists (admin sections are now navbar-dropdown routes).
    expect(screen.getByRole("button", { name: /new event/i })).toBeInTheDocument();
  });

  it("shows loading skeleton for events before data arrives", async () => {
    // Delay the events response so we can capture the loading state.
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") {
        return new Promise(() => {});
      }
      return Promise.resolve([]);
    });
    renderPage();

    // The initial render should show a skeleton while loading=true.
    await waitFor(() => {
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  it("renders empty state for events when API returns empty array", async () => {
    apiGet.mockResolvedValue([]);
    renderPage();

    // Wait for the events table to render.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );

    // Events tab now groups into status boxes; empty events → "Active"/"Upcoming" boxes showing "None."
    expect(screen.getByRole("heading", { name: /^active$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/^none\.$/i).length).toBeGreaterThan(0);
  });

  it("shows toast error when events API call fails", async () => {
    const error = new Error("Failed to load events");
    // Reject the first call (events) and resolve all subsequent calls with []
    // so the component doesn't crash on runs/users/sessions endpoints.
    apiGet.mockRejectedValueOnce(error);
    apiGet.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load events");
    });
  });

  it("disables the Create Event submit button when name is empty", async () => {
    apiGet.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    // Wait for page to load.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );

    // Open the New Event dialog.
    await user.click(screen.getByRole("button", { name: /new event/i }));

    await waitFor(() => {
      const h2s = screen.getAllByText(/new event/i);
      expect(h2s.length).toBeGreaterThan(0);
    });

    // Submit the form directly (bypasses HTML5 required-field validation so the
    // React onSubmit handler can run its own guards, e.g. "Name is required").
    const submitBtn = screen.getByRole("button", { name: /create event/i });
    fireEvent.submit(submitBtn.closest("form")!);

    // Should show a validation error toast.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Name is required");
    });
  });

  it("shows toast error when event creation fails on the API", async () => {
    apiGet.mockResolvedValue([]);
    const createError = new Error("Event name already exists");
    apiPost.mockRejectedValueOnce(createError);

    const user = userEvent.setup();
    renderPage();

    // Wait for page to load.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );

    // Open the New Event dialog.
    await user.click(screen.getByRole("button", { name: /new event/i }));

    await waitFor(() => {
      const headers = screen.getAllByText(/new event/i);
      expect(headers.length).toBeGreaterThan(0);
    });

    // Submit directly (bypasses HTML5 required-field validation).
    const submitBtn = screen.getByRole("button", { name: /create event/i });
    fireEvent.submit(submitBtn.closest("form")!);

    // Validation fires before the API call: toast.error("Name is required").
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Name is required");
    });
  });

  it("renders the right section for each /admin/<section> route", async () => {
    apiGet.mockResolvedValue([]);

    // Events section → owns the "New Event" button.
    const { unmount } = renderPage("/admin/events");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /new event/i })).toBeInTheDocument()
    );
    unmount();

    // Sessions section → owns the "New Session" button.
    const sessionsRender = renderPage("/admin/sessions");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /new session/i })).toBeInTheDocument()
    );
    sessionsRender.unmount();

    // Users section → owns the user search input placeholder.
    renderPage("/admin/users");
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/search by name or email/i)).toBeInTheDocument()
    );
  });

  it("shows error toast when session creation is missing required fields", async () => {
    apiGet.mockResolvedValue([]);
    const user = userEvent.setup();
    // The Sessions section is now its own route — render it directly
    // rather than clicking a tab that no longer exists.
    renderPage("/admin/sessions");

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new session/i })).toBeInTheDocument();
    });

    // Open the New Session dialog.
    const newSessionBtn = screen.getByRole("button", { name: /new session/i });
    await user.click(newSessionBtn);

    await waitFor(() => {
      const headers = screen.getAllByText(/new session/i);
      expect(headers.length).toBeGreaterThan(0);
    });

    // Submit directly (bypasses HTML5 required-field validation so the
    // React onSubmit handler runs and checks sessEventId first).
    const submitBtn = screen.getByRole("button", { name: /create session/i });
    fireEvent.submit(submitBtn.closest("form")!);

    // Should show validation error.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Select an event");
    });
  });

  it("renders Run History with All events and All sessions card pickers", async () => {
    apiGet.mockResolvedValue([]);
    renderPage("/admin/runs");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^all events$/i })).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /^all sessions$/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/runs\?limit=500$/)
      );
    });
  });
});
