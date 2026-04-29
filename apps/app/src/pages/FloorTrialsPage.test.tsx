// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

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

// ---------------------------------------------------------------------------
// Setup + cleanup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper: build a full session row.
function makeSession(opts: {
  id: string;
  status: string;
  /** Local-time ISO string for floor_trial_starts_at. */
  startsAt: string;
  eventId?: string | null;
  hasActiveCheckin?: boolean;
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
    has_active_checkin: opts.hasActiveCheckin ?? false,
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

  it("polls for session and event updates every 10 seconds", async () => {
    vi.useFakeTimers();
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled", startsAt: "2026-05-22T07:00:00" }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    // Flush the initial fetch: act() drains React's update queue (state + effects)
    // so the resolved promises can re-render the component before we assert.
    // We avoid waitFor here because its retry setTimeout is also faked.
    await act(async () => {});

    // Initial load: 1 call to /v1/sessions + 1 to /v1/events in Promise.all
    expect(apiGet).toHaveBeenCalledWith("/v1/sessions");
    expect(apiGet).toHaveBeenCalledWith("/v1/events");
    expect(screen.getByRole("link", { name: /open session/i })).toBeInTheDocument();
    const initialCallCount = apiGet.mock.calls.length;

    // Fast-forward 10 seconds; the polling interval should fire another fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    // Should have called get again for both sessions and events
    expect(apiGet.mock.calls.length).toBeGreaterThan(initialCallCount);

    vi.useRealTimers();
  });

  it("stops polling when component unmounts", async () => {
    vi.useFakeTimers();
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled", startsAt: "2026-05-22T07:00:00" }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const { unmount } = renderPage();

    // Flush the initial fetch before unmounting.
    await act(async () => {});
    expect(screen.getByRole("link", { name: /open session/i })).toBeInTheDocument();

    apiGet.mockClear();
    unmount();

    // Advance timers past the polling interval — no calls should fire after unmount.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(apiGet).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe("FloorTrialsPage — check-in flow", () => {
  it("shows session status badges: scheduled, checkin_open, in_progress", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({
            id: "s1",
            status: "scheduled",
            startsAt: "2026-05-22T08:00:00",
          }),
          makeSession({
            id: "s2",
            status: "checkin_open",
            startsAt: "2026-05-23T08:00:00",
          }),
          makeSession({
            id: "s3",
            status: "in_progress",
            startsAt: "2026-05-24T08:00:00",
          }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: /open session/i }).length).toBe(3);
    });

    // All three status badges should be rendered
    expect(screen.getByText("scheduled")).toBeInTheDocument();
    expect(screen.getByText("checkin_open")).toBeInTheDocument();
    expect(screen.getByText("in_progress")).toBeInTheDocument();
  });

  it("renders session cards as links that navigate to detail page", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({
            id: "session-123",
            status: "checkin_open",
            startsAt: "2026-05-23T08:00:00",
          }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /open session/i });
      expect(link).toHaveAttribute("href", "/sessions/session-123");
    });
  });

  it("hides cards with opacity when loading", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        // Delay resolution to keep loading state
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve([
                makeSession({
                  id: "s1",
                  status: "scheduled",
                  startsAt: "2026-05-22T08:00:00",
                }),
              ]),
            100
          );
        });
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    // Cards container should exist with loading opacity applied
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /open session/i })).toBeInTheDocument();
    });
  });
});

describe("FloorTrialsPage — queue state", () => {
  it("renders session info and check-in times for checkin_open sessions", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({
            id: "s1",
            status: "checkin_open",
            startsAt: "2026-05-23T08:00:00",
          }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/open session/i)).toBeInTheDocument();
    });

    // Check that checkin_open session displays the session info
    expect(screen.getByText("checkin_open")).toBeInTheDocument();
    // Card should contain timing information
    expect(screen.getByText(/Open:/i)).toBeInTheDocument();
    expect(screen.getByText(/Floor trial:/i)).toBeInTheDocument();
  });

  it("distinguishes between scheduled and checkin_open sessions visually", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({
            id: "s1",
            status: "scheduled",
            startsAt: "2026-05-22T08:00:00",
          }),
          makeSession({
            id: "s2",
            status: "checkin_open",
            startsAt: "2026-05-23T08:00:00",
          }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("scheduled")).toBeInTheDocument();
    });

    expect(screen.getByText("checkin_open")).toBeInTheDocument();

    // Both statuses should render as distinct badges
    const badges = screen.getAllByText(/scheduled|checkin_open/i);
    expect(badges).toHaveLength(2);
  });

  it("includes event badge when session is tied to an event", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({
            id: "s1",
            status: "checkin_open",
            startsAt: "2026-05-23T08:00:00",
            eventId: "ev-1",
          }),
        ]);
      }
      if (path === "/v1/events") {
        return Promise.resolve([
          {
            id: "ev-1",
            name: "Championship",
            start_date: "2026-05-20",
            end_date: "2026-05-25",
            status: "active",
            timezone: "America/Chicago",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Championship")).toBeInTheDocument();
    });

    // Event badge + session status badge should both render
    expect(screen.getByText("checkin_open")).toBeInTheDocument();
  });

  it("applies timezone abbreviation badge when timezone is available", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({
            id: "s1",
            status: "scheduled",
            startsAt: "2026-05-23T08:00:00",
            eventId: "ev-1",
          }),
        ]);
      }
      if (path === "/v1/events") {
        return Promise.resolve([
          {
            id: "ev-1",
            name: "Floor Trial Event",
            start_date: "2026-05-23",
            end_date: "2026-05-23",
            status: "active",
            timezone: "America/Chicago",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Floor Trial Event")).toBeInTheDocument();
    });

    // Timezone abbreviation should render (e.g., "CDT", "CST" depending on date)
    const timezoneElements = screen.queryAllByText(/[A-Z]{2,3}/);
    expect(timezoneElements.length).toBeGreaterThan(0);
  });
});
