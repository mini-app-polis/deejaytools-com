// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

import SessionsPage from "./SessionsPage";
import type { SessionStatus } from "@/schemas";
import { fx } from "@/test/fixtures";
import { renderWithQueryClient } from "@/test/render";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(opts: {
  id: string;
  status: SessionStatus;
  /** Local-time ISO string for floor_trial_starts_at. */
  startsAt: string;
  timezone?: string | null;
}) {
  const startTs = new Date(opts.startsAt).getTime();
  return fx.session({
    id: opts.id,
    event_id: null as string | null,
    event_timezone: opts.timezone ?? null,
    name: "session-name",
    date: opts.startsAt.slice(0, 10),
    status: opts.status,
    checkin_opens_at: startTs - 60 * 60 * 1000,
    floor_trial_starts_at: startTs,
    floor_trial_ends_at: startTs + 2 * 60 * 60 * 1000,
  });
}

function renderPage() {
  return renderWithQueryClient(
    <MemoryRouter>
      <SessionsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
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

  it("shows the error in place of the list when the API call fails, not an empty list", async () => {
    apiGet.mockRejectedValue(new Error("Network error"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load sessions: Network error");
    expect(screen.queryByText(/no sessions yet/i)).not.toBeInTheDocument();
  });

  it("loads the sessions again when Try again is pressed", async () => {
    apiGet.mockRejectedValueOnce(new Error("Network error"));
    apiGet.mockResolvedValueOnce([
      makeSession({ id: "s1", status: "scheduled", startsAt: "2026-05-22T08:00:00" }),
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /try again/i }));

    await waitFor(() => expect(screen.getAllByText("scheduled").length).toBeGreaterThan(0));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledTimes(2);
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

  it("opens a session from its table row with Tab and Enter", async () => {
    apiGet.mockResolvedValue([
      makeSession({ id: "abc-123", status: "scheduled", startsAt: "2026-05-22T08:00:00" }),
    ]);
    const user = userEvent.setup();
    renderWithQueryClient(
      <MemoryRouter initialEntries={["/sessions"]}>
        <Routes>
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/sessions/:id" element={<p>Session detail page</p>} />
        </Routes>
      </MemoryRouter>
    );

    const table = await screen.findByRole("table");
    const rowLink = await within(table).findByRole("link");
    expect(rowLink).toHaveAttribute("href", "/sessions/abc-123");

    // Tab through the page until the row's link has focus.
    for (let i = 0; i < 10 && document.activeElement !== rowLink; i++) {
      await user.tab();
    }
    expect(rowLink).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Session detail page")).toBeInTheDocument();
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
    // compareSessionChrono uses Date.now() for bucketing; pin "now" so fixed
    // fixture dates stay in the future/past buckets regardless of when CI runs.
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-04-27T12:00:00").getTime());

    const farFuture = makeSession({ id: "far",  status: "scheduled", startsAt: "2026-07-01T08:00:00" });
    const nearFuture = makeSession({ id: "near", status: "scheduled", startsAt: "2026-05-22T08:00:00" });
    const past       = makeSession({ id: "past", status: "completed", startsAt: "2026-03-01T08:00:00" });

    // Deliberately supply them in wrong order.
    apiGet.mockResolvedValue([farFuture, nearFuture, past]);
    renderPage();

    try {
      await waitFor(() => {
        const links = screen.getAllByRole("link");
        const hrefs = links.map((l) => l.getAttribute("href")!).filter((h) => h.startsWith("/sessions/"));
        // Soonest future first, past at the end.
        expect(hrefs[0]).toBe("/sessions/near");
        expect(hrefs[1]).toBe("/sessions/far");
        expect(hrefs[2]).toBe("/sessions/past");
      });
    } finally {
      nowSpy.mockRestore();
    }
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
