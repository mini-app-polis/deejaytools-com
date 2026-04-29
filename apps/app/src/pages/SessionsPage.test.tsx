// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const apiGet = vi.fn();
const apiClient = {
  get: apiGet,
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  postForm: vi.fn(),
};
vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import SessionsPage from "./SessionsPage";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(opts: {
  id: string;
  status: string;
  /** Local-time ISO string for floor_trial_starts_at. */
  startsAt: string;
  timezone?: string | null;
}) {
  const startTs = new Date(opts.startsAt).getTime();
  return {
    id: opts.id,
    event_id: null as string | null,
    event_timezone: opts.timezone ?? null,
    name: "session-name",
    date: opts.startsAt.slice(0, 10),
    status: opts.status,
    checkin_opens_at: startTs - 60 * 60 * 1000,
    floor_trial_starts_at: startTs,
    floor_trial_ends_at: startTs + 2 * 60 * 60 * 1000,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SessionsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
  apiGet.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionsPage", () => {
  it("renders the Sessions heading", async () => {
    apiGet.mockResolvedValue([]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /sessions/i })).toBeInTheDocument()
    );
  });

  it("shows loading skeleton while fetching", async () => {
    apiGet.mockImplementation(() => new Promise(() => {})); // never resolves
    const { container } = renderPage();

    // Skeleton uses the animate-pulse Tailwind class.
    await waitFor(() => {
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });
  });

  it("shows empty state when there are no sessions", async () => {
    apiGet.mockResolvedValue([]);
    renderPage();

    await waitFor(() =>
      // Both mobile card list and desktop table render the empty message.
      expect(screen.getAllByText(/no sessions yet/i).length).toBeGreaterThan(0)
    );
  });

  it("shows toast error when the API call fails", async () => {
    apiGet.mockRejectedValue(new Error("Network error"));
    renderPage();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Network error")
    );
  });

  it("renders a session with its status badge", async () => {
    apiGet.mockResolvedValue([
      makeSession({ id: "s1", status: "scheduled", startsAt: "2026-05-22T08:00:00" }),
    ]);
    renderPage();

    await waitFor(() =>
      expect(screen.getAllByText("scheduled").length).toBeGreaterThan(0)
    );
  });

  it("renders all five status variants without crashing", async () => {
    apiGet.mockResolvedValue([
      makeSession({ id: "s1", status: "scheduled",    startsAt: "2026-05-22T08:00:00" }),
      makeSession({ id: "s2", status: "checkin_open", startsAt: "2026-05-23T08:00:00" }),
      makeSession({ id: "s3", status: "in_progress",  startsAt: "2026-05-24T08:00:00" }),
      makeSession({ id: "s4", status: "completed",    startsAt: "2026-04-01T08:00:00" }),
      makeSession({ id: "s5", status: "cancelled",    startsAt: "2026-04-02T08:00:00" }),
    ]);
    renderPage();

    await waitFor(() =>
      expect(screen.getAllByText("scheduled").length).toBeGreaterThan(0)
    );
    expect(screen.getAllByText("checkin_open").length).toBeGreaterThan(0);
    expect(screen.getAllByText("in_progress").length).toBeGreaterThan(0);
    expect(screen.getAllByText("completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("cancelled").length).toBeGreaterThan(0);
  });

  it("links mobile cards to /sessions/:id", async () => {
    apiGet.mockResolvedValue([
      makeSession({ id: "abc-123", status: "scheduled", startsAt: "2026-05-22T08:00:00" }),
    ]);
    renderPage();

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      // At least one link should point to the session detail page.
      expect(links.some((l) => l.getAttribute("href") === "/sessions/abc-123")).toBe(true);
    });
  });

  it("renders multiple sessions", async () => {
    apiGet.mockResolvedValue([
      makeSession({ id: "s1", status: "scheduled",    startsAt: "2026-05-22T08:00:00" }),
      makeSession({ id: "s2", status: "checkin_open", startsAt: "2026-05-23T08:00:00" }),
      makeSession({ id: "s3", status: "completed",    startsAt: "2026-04-01T08:00:00" }),
    ]);
    renderPage();

    await waitFor(() => {
      // All three sessions have links in the mobile layout.
      const links = screen.getAllByRole("link");
      const hrefs = links.map((l) => l.getAttribute("href"));
      expect(hrefs).toContain("/sessions/s1");
      expect(hrefs).toContain("/sessions/s2");
      expect(hrefs).toContain("/sessions/s3");
    });
  });

  it("sorts future sessions soonest-first before past sessions", async () => {
    // Two future sessions and one past.
    const farFuture = makeSession({ id: "far",  status: "scheduled", startsAt: "2026-07-01T08:00:00" });
    const nearFuture = makeSession({ id: "near", status: "scheduled", startsAt: "2026-05-22T08:00:00" });
    const past       = makeSession({ id: "past", status: "completed", startsAt: "2026-03-01T08:00:00" });

    // Deliberately supply them in wrong order.
    apiGet.mockResolvedValue([farFuture, nearFuture, past]);
    renderPage();

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const hrefs = links.map((l) => l.getAttribute("href")!).filter((h) => h.startsWith("/sessions/"));
      // Soonest future first, past at the end.
      expect(hrefs[0]).toBe("/sessions/near");
      expect(hrefs[1]).toBe("/sessions/far");
      expect(hrefs[2]).toBe("/sessions/past");
    });
  });

  it("shows a timezone abbreviation badge when event_timezone is set", async () => {
    apiGet.mockResolvedValue([
      makeSession({
        id: "s1",
        status: "scheduled",
        startsAt: "2026-05-22T08:00:00",
        timezone: "America/Chicago",
      }),
    ]);
    renderPage();

    await waitFor(() => {
      // CDT or CST depending on date; check for any 2-4 uppercase letter TZ badge.
      const tz = screen.queryAllByText(/^[A-Z]{2,4}$/);
      expect(tz.length).toBeGreaterThan(0);
    });
  });
});
