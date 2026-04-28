// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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

import FloorTrialsPage from "./FloorTrialsPage";

// Helper: build a full session row.
function makeSession(opts: {
  id: string;
  status: string;
  /** Local-time ISO string for floor_trial_starts_at. */
  startsAt: string;
  eventId?: string | null;
}) {
  const startTs = new Date(opts.startsAt).getTime();
  return {
    id: opts.id,
    event_id: opts.eventId ?? null,
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
      <FloorTrialsPage />
    </MemoryRouter>
  );
}

describe("FloorTrialsPage", () => {
  it("filters out completed and cancelled sessions", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled", startsAt: "2026-04-28T08:00:00" }),
          makeSession({ id: "s2", status: "completed", startsAt: "2026-04-25T08:00:00" }),
          makeSession({ id: "s3", status: "cancelled", startsAt: "2026-04-26T08:00:00" }),
          makeSession({ id: "s4", status: "in_progress", startsAt: "2026-04-27T08:00:00" }),
          makeSession({ id: "s5", status: "checkin_open", startsAt: "2026-04-29T08:00:00" }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    // Wait for the loading to settle and active/upcoming cards to render.
    await waitFor(() => {
      expect(screen.queryAllByRole("link", { name: /open session/i })).toHaveLength(3);
    });
  });

  it("orders cards by floor_trial_starts_at ascending (soonest first)", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "may22", status: "scheduled", startsAt: "2026-05-22T07:00:00" }),
          makeSession({ id: "today", status: "in_progress", startsAt: "2026-04-27T08:00:00" }),
          makeSession({ id: "may24", status: "scheduled", startsAt: "2026-05-24T07:00:00" }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      const links = screen.queryAllByRole("link", { name: /open session/i });
      expect(links).toHaveLength(3);
    });

    const links = screen.getAllByRole("link", { name: /open session/i });
    // Each link's href should reveal its session id.
    expect(links[0].getAttribute("href")).toBe("/sessions/today");
    expect(links[1].getAttribute("href")).toBe("/sessions/may22");
    expect(links[2].getAttribute("href")).toBe("/sessions/may24");
  });

  it("shows the event name as a badge on the card when present", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({
            id: "s1",
            status: "scheduled",
            startsAt: "2026-05-22T07:00:00",
            eventId: "event-1",
          }),
        ]);
      }
      if (path === "/v1/events") {
        return Promise.resolve([
          { id: "event-1", name: "GNDC", start_date: "2026-05-22", end_date: "2026-05-25", status: "upcoming" },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("GNDC")).toBeInTheDocument();
    });
  });

  it("renders the empty state when there are no active or upcoming sessions", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          // Only completed sessions exist.
          makeSession({ id: "s1", status: "completed", startsAt: "2026-04-01T08:00:00" }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no active or upcoming sessions/i)).toBeInTheDocument();
    });
  });

  it("links each card to /sessions/:id", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "abc-123", status: "scheduled", startsAt: "2026-05-22T07:00:00" }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /open session/i });
      expect(link.getAttribute("href")).toBe("/sessions/abc-123");
    });
  });

  it("shows session title in 'Day - Time - Date' order", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled", startsAt: "2026-05-23T19:30:00" }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      // "Saturday - 7:30 PM - May 23, 2026"
      const card = screen.getByRole("link", { name: /open session/i }).closest("div")!;
      const titleText = within(card.parentElement!).getByText(/Saturday - 7:30 PM - May 23, 2026/);
      expect(titleText).toBeInTheDocument();
    });
  });
});
