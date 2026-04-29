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

const TODAY = "2026-04-29";

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
  it("shows scheduled, checkin_open, and in_progress sessions", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled",    startsAt: `${TODAY}T08:00:00` }),
          makeSession({ id: "s2", status: "checkin_open", startsAt: `${TODAY}T10:00:00` }),
          makeSession({ id: "s3", status: "in_progress",  startsAt: `${TODAY}T12:00:00` }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.queryAllByRole("link", { name: /open session/i })).toHaveLength(3);
    });
  });

  it("filters out completed and cancelled sessions", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled",   startsAt: `${TODAY}T08:00:00` }),
          makeSession({ id: "s2", status: "completed",   startsAt: `${TODAY}T06:00:00` }),
          makeSession({ id: "s3", status: "cancelled",   startsAt: `${TODAY}T04:00:00` }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.queryAllByRole("link", { name: /open session/i })).toHaveLength(1);
    });

    // Only s1 (scheduled) should appear
    expect(screen.getByRole("link", { name: /open session/i })).toHaveAttribute(
      "href",
      "/sessions/s1"
    );
  });

  it("orders cards by floor_trial_starts_at ascending (soonest first)", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "last",   status: "scheduled",   startsAt: `${TODAY}T14:00:00` }),
          makeSession({ id: "first",  status: "in_progress", startsAt: `${TODAY}T08:00:00` }),
          makeSession({ id: "middle", status: "scheduled",   startsAt: `${TODAY}T11:00:00` }),
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
    expect(links[0].getAttribute("href")).toBe("/sessions/first");
    expect(links[1].getAttribute("href")).toBe("/sessions/middle");
    expect(links[2].getAttribute("href")).toBe("/sessions/last");
  });

  it("shows the event name as a badge on the card when present", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({
            id: "s1",
            status: "scheduled",
            startsAt: `${TODAY}T07:00:00`,
            eventId: "event-1",
          }),
        ]);
      }
      if (path === "/v1/events") {
        return Promise.resolve([
          { id: "event-1", name: "GNDC", start_date: TODAY, end_date: TODAY, status: "upcoming" },
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
          makeSession({ id: "s1", status: "completed", startsAt: `${TODAY}T08:00:00` }),
          makeSession({ id: "s2", status: "cancelled", startsAt: `${TODAY}T10:00:00` }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no upcoming sessions right now/i)).toBeInTheDocument();
    });
  });

  it("links each card to /sessions/:id", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "abc-123", status: "scheduled", startsAt: `${TODAY}T07:00:00` }),
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
    // Pin Date so the formatted title is deterministic
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));

    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled", startsAt: `${TODAY}T19:30:00` }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      // "Wednesday - 7:30 PM - April 29, 2026"
      const card = screen.getByRole("link", { name: /open session/i }).closest("div")!;
      const titleText = within(card.parentElement!).getByText(/Wednesday - 7:30 PM - April 29, 2026/);
      expect(titleText).toBeInTheDocument();
    });
  });

  it("polls for session and event updates every 10 seconds", async () => {
    // Spy on window.setInterval directly so we can capture and invoke the
    // polling callback without relying on fake-timer global patching (which
    // doesn't reliably replace window.setInterval in JSDOM when
    // vi.useFakeTimers is called more than once).
    let capturedCallback: (() => void) | null = null;
    const setIntervalSpy = vi
      .spyOn(window, "setInterval")
      .mockImplementationOnce((cb: TimerHandler) => {
        capturedCallback = cb as () => void;
        return 999 as unknown as ReturnType<typeof setInterval>;
      });

    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled", startsAt: `${TODAY}T07:00:00` }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /open session/i })).toBeInTheDocument();
    });

    expect(capturedCallback).not.toBeNull();
    apiGet.mockClear();

    // Simulate the 10 s tick firing
    await act(async () => {
      capturedCallback!();
    });

    expect(apiGet).toHaveBeenCalledWith("/v1/sessions");
    expect(apiGet).toHaveBeenCalledWith("/v1/events");

    setIntervalSpy.mockRestore();
  });

  it("stops polling when component unmounts", async () => {
    let capturedIntervalId = -1;
    const setIntervalSpy = vi
      .spyOn(window, "setInterval")
      .mockImplementationOnce((cb: TimerHandler) => {
        capturedIntervalId = 999;
        return capturedIntervalId as unknown as ReturnType<typeof setInterval>;
      });
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled", startsAt: `${TODAY}T07:00:00` }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const { unmount } = renderPage();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /open session/i })).toBeInTheDocument();
    });

    unmount();

    // clearInterval must have been called with the registered interval ID
    expect(clearIntervalSpy).toHaveBeenCalledWith(capturedIntervalId);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});

describe("FloorTrialsPage — check-in flow", () => {
  it("shows session status badges: scheduled, checkin_open, in_progress", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled",   startsAt: `${TODAY}T08:00:00` }),
          makeSession({ id: "s2", status: "checkin_open", startsAt: `${TODAY}T10:00:00` }),
          makeSession({ id: "s3", status: "in_progress",  startsAt: `${TODAY}T12:00:00` }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: /open session/i }).length).toBe(3);
    });

    expect(screen.getByText("scheduled")).toBeInTheDocument();
    expect(screen.getByText("checkin_open")).toBeInTheDocument();
    expect(screen.getByText("in_progress")).toBeInTheDocument();
  });

  it("renders session cards as links that navigate to detail page", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "session-123", status: "checkin_open", startsAt: `${TODAY}T08:00:00` }),
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

  it("includes event badge when session is tied to an event", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "checkin_open", startsAt: `${TODAY}T08:00:00`, eventId: "ev-1" }),
        ]);
      }
      if (path === "/v1/events") {
        return Promise.resolve([
          { id: "ev-1", name: "Championship", start_date: TODAY, end_date: TODAY, status: "active", timezone: "America/Chicago" },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Championship")).toBeInTheDocument();
    });

    expect(screen.getByText("checkin_open")).toBeInTheDocument();
  });

  it("applies timezone abbreviation badge when timezone is available", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled", startsAt: `${TODAY}T08:00:00`, eventId: "ev-1" }),
        ]);
      }
      if (path === "/v1/events") {
        return Promise.resolve([
          { id: "ev-1", name: "Floor Trial Event", start_date: TODAY, end_date: TODAY, status: "active", timezone: "America/Chicago" },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Floor Trial Event")).toBeInTheDocument();
    });

    const timezoneElements = screen.queryAllByText(/[A-Z]{2,3}/);
    expect(timezoneElements.length).toBeGreaterThan(0);
  });
});

describe("FloorTrialsPage — queue state", () => {
  it("renders session info and check-in times for checkin_open sessions", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "checkin_open", startsAt: `${TODAY}T08:00:00` }),
        ]);
      }
      if (path === "/v1/events") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/open session/i)).toBeInTheDocument();
    });

    expect(screen.getByText("checkin_open")).toBeInTheDocument();
    expect(screen.getByText(/Open:/i)).toBeInTheDocument();
    expect(screen.getByText(/Floor trial:/i)).toBeInTheDocument();
  });

  it("distinguishes between scheduled and checkin_open sessions visually", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled",   startsAt: `${TODAY}T08:00:00` }),
          makeSession({ id: "s2", status: "checkin_open", startsAt: `${TODAY}T10:00:00` }),
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

    const badges = screen.getAllByText(/scheduled|checkin_open/i);
    expect(badges).toHaveLength(2);
  });

  it("includes event badge when session is tied to an event", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "checkin_open", startsAt: `${TODAY}T08:00:00`, eventId: "ev-1" }),
        ]);
      }
      if (path === "/v1/events") {
        return Promise.resolve([
          { id: "ev-1", name: "Championship", start_date: TODAY, end_date: TODAY, status: "active", timezone: "America/Chicago" },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Championship")).toBeInTheDocument();
    });

    expect(screen.getByText("checkin_open")).toBeInTheDocument();
  });

  it("applies timezone abbreviation badge when timezone is available", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          makeSession({ id: "s1", status: "scheduled", startsAt: `${TODAY}T08:00:00`, eventId: "ev-1" }),
        ]);
      }
      if (path === "/v1/events") {
        return Promise.resolve([
          { id: "ev-1", name: "Floor Trial Event", start_date: TODAY, end_date: TODAY, status: "active", timezone: "America/Chicago" },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Floor Trial Event")).toBeInTheDocument();
    });

    const timezoneElements = screen.queryAllByText(/[A-Z]{2,3}/);
    expect(timezoneElements.length).toBeGreaterThan(0);
  });
});
