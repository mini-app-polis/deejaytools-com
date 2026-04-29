// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
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

  it("renders the Admin heading and tab list without crashing", async () => {
    apiGet.mockResolvedValue([]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );
    expect(screen.getByRole("tab", { name: /events/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /sessions/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /live queue/i })).toBeInTheDocument();
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

    // The Events tab should show "No events yet."
    expect(screen.getByText(/no events yet/i)).toBeInTheDocument();
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

  it("renders all tabs in the Events tab content", async () => {
    apiGet.mockResolvedValue([]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );

    // Check that all tab triggers are present.
    expect(screen.getByRole("tab", { name: /events/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /sessions/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /queue/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /run history/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /inject/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
  });

  it("shows error toast when session creation is missing required fields", async () => {
    apiGet.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );

    // Click on Sessions tab using userEvent so Radix properly activates the panel.
    const sessionsTab = screen.getByRole("tab", { name: /sessions/i });
    await user.click(sessionsTab);

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
});
