// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const apiGet = vi.fn();
// Stable client reference — see SongsPage.test for why this matters.
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

import EventsPage from "./EventsPage";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Setup + teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

function makeEvent(opts: {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}) {
  return {
    id: opts.id,
    name: opts.name,
    start_date: opts.startDate,
    end_date: opts.endDate,
    status: opts.status,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <EventsPage />
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EventsPage", () => {
  it("shows loading state while fetching events", async () => {
    // apiGet never resolves — frozen promise keeps loading state active.
    apiGet.mockImplementation(() => new Promise(() => {}));

    const { container } = renderPage();

    // Wait a tick to allow render to complete
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Skeleton elements render with the "animate-pulse" Tailwind class.
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders event names when events are returned", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") {
        return Promise.resolve([
          makeEvent({
            id: "ev1",
            name: "Summer Nationals",
            startDate: "2026-06-01",
            endDate: "2026-06-05",
            status: "upcoming",
          }),
          makeEvent({
            id: "ev2",
            name: "Winter Championship",
            startDate: "2026-12-01",
            endDate: "2026-12-05",
            status: "upcoming",
          }),
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("Summer Nationals").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Winter Championship").length).toBeGreaterThan(0);
  });

  it("shows 'no events' empty state when API returns empty array", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText(/no current or upcoming events/i).length).toBeGreaterThan(0);
    });
  });

  it("lists only active and upcoming events, hiding completed and cancelled", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") {
        return Promise.resolve([
          makeEvent({
            id: "ev1",
            name: "Active Event",
            startDate: "2026-04-29",
            endDate: "2026-05-02",
            status: "active",
          }),
          makeEvent({
            id: "ev2",
            name: "Upcoming Event",
            startDate: "2026-06-01",
            endDate: "2026-06-05",
            status: "upcoming",
          }),
          makeEvent({
            id: "ev3",
            name: "Completed Event",
            startDate: "2026-03-01",
            endDate: "2026-03-05",
            status: "completed",
          }),
          makeEvent({
            id: "ev4",
            name: "Cancelled Event",
            startDate: "2026-05-10",
            endDate: "2026-05-12",
            status: "cancelled",
          }),
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("Active Event").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Upcoming Event").length).toBeGreaterThan(0);

    // Past and cancelled events stay off the listing entirely.
    expect(screen.queryByText("Completed Event")).toBeNull();
    expect(screen.queryByText("Cancelled Event")).toBeNull();
    expect(screen.queryByText("completed")).toBeNull();
    expect(screen.queryByText("cancelled")).toBeNull();
  });

  it("shows toast error when API fails", async () => {
    const errorMsg = "Failed to load events";
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") {
        return Promise.reject(new Error(errorMsg));
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(errorMsg);
    });
  });

  it("renders each event as a card link to /events/:id, with no table", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") {
        return Promise.resolve([
          makeEvent({
            id: "ev1",
            name: "Summer Nationals",
            startDate: "2026-06-01",
            endDate: "2026-06-05",
            status: "upcoming",
          }),
        ]);
      }
      return Promise.resolve([]);
    });

    const { container } = renderPage();

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /summer nationals/i });
      expect(link.getAttribute("href")).toBe("/events/ev1");
    });
    // Card view: the old desktop table markup is gone entirely, so there is
    // one card per event rather than a duplicated mobile + desktop pair.
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getAllByText("Summer Nationals")).toHaveLength(1);
  });

  it("renders dates in single-date or range format", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") {
        return Promise.resolve([
          makeEvent({
            id: "ev1",
            name: "Single Day Event",
            startDate: "2026-06-15",
            endDate: "2026-06-15",
            status: "upcoming",
          }),
          makeEvent({
            id: "ev2",
            name: "Multi Day Event",
            startDate: "2026-07-01",
            endDate: "2026-07-05",
            status: "upcoming",
          }),
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("Single Day Event").length).toBeGreaterThan(0);
    });

    // Single-date format: just the date (both mobile + desktop layouts render)
    expect(screen.getAllByText("2026-06-15").length).toBeGreaterThan(0);
    // Range format: start – end
    expect(screen.getAllByText("2026-07-01 – 2026-07-05").length).toBeGreaterThan(0);
  });
});
