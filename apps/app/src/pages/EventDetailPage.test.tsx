// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
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

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Clerk drives both the <SignedIn>/<SignedOut> wrappers around the entity
// roster and the useAuth() flag that gates its fetch. One mutable flag keeps
// the two in agreement, so a test that flips `signedIn` gets a consistent page.
let signedIn = true;
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn: signedIn }),
  SignedIn: ({ children }: { children: React.ReactNode }) => (signedIn ? <>{children}</> : null),
  SignedOut: ({ children }: { children: React.ReactNode }) => (signedIn ? null : <>{children}</>),
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="sign-in-button">{children}</span>
  ),
}));

import EventDetailPage from "./EventDetailPage";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvent(opts: {
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  timezone?: string;
}) {
  return {
    id: opts.id ?? "ev-1",
    name: opts.name ?? "Test Event",
    start_date: opts.startDate ?? "2026-06-01",
    end_date: opts.endDate ?? "2026-06-05",
    status: opts.status ?? "upcoming",
    timezone: opts.timezone ?? "America/Chicago",
  };
}

function makeSession(opts: {
  id: string;
  status?: string;
  startsAt?: string;
}) {
  const startTs = new Date(opts.startsAt ?? "2026-06-03T08:00:00").getTime();
  return {
    id: opts.id,
    event_id: "ev-1",
    name: "session-name",
    date: (opts.startsAt ?? "2026-06-03T08:00:00").slice(0, 10),
    status: opts.status ?? "scheduled",
    checkin_opens_at: startTs - 60 * 60 * 1000,
    floor_trial_starts_at: startTs,
    floor_trial_ends_at: startTs + 2 * 60 * 60 * 1000,
  };
}

function makeEntity(opts: { key: string; label: string; songs?: number }) {
  return {
    entity_key: opts.key,
    label: opts.label,
    song_count: opts.songs ?? 1,
  };
}

function makeDivision(division: string, entities: ReturnType<typeof makeEntity>[]) {
  return { division, entities };
}

// ---------------------------------------------------------------------------
// Render helper — provides the :id route param via Routes
// ---------------------------------------------------------------------------

function renderPage(id = "ev-1") {
  return render(
    <MemoryRouter initialEntries={[`/events/${id}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
  apiGet.mockReset();
  signedIn = true;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EventDetailPage", () => {
  it("shows loading skeleton while fetching", async () => {
    apiGet.mockImplementation(() => new Promise(() => {})); // never resolves
    const { container } = renderPage();

    await waitFor(() => {
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });
  });

  it("renders the event name when loaded", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({ name: "Summer Nationals" }));
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /summer nationals/i })).toBeInTheDocument()
    );
  });

  it("renders a single date when start_date equals end_date", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1")
        return Promise.resolve(makeEvent({ startDate: "2026-06-15", endDate: "2026-06-15" }));
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("2026-06-15")).toBeInTheDocument());
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it("renders a date range when start_date differs from end_date", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1")
        return Promise.resolve(makeEvent({ startDate: "2026-06-01", endDate: "2026-06-05" }));
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("2026-06-01 – 2026-06-05")).toBeInTheDocument()
    );
  });

  it("renders the correct status badge for each event status", async () => {
    const statuses = ["upcoming", "active", "completed", "cancelled"] as const;

    for (const status of statuses) {
      apiGet.mockReset();
      apiGet.mockImplementation((path: string) => {
        if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({ status }));
        return Promise.resolve([]);
      });
      const { unmount } = renderPage();
      await waitFor(() =>
        expect(screen.getByText(new RegExp(status, "i"))).toBeInTheDocument()
      );
      unmount();
    }
  });

  it("shows toast error when the API call fails", async () => {
    apiGet.mockRejectedValue(new Error("Network failure"));
    renderPage();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Network failure")
    );
  });

  it("shows 'Event not found.' when event resolves to null", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(null);
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/event not found/i)).toBeInTheDocument()
    );
  });

  it("shows 'No sessions for this event.' when sessions list is empty", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/no sessions for this event/i)).toBeInTheDocument()
    );
  });

  it("renders session cards as links to /sessions/:id", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (!path.startsWith("/v1/sessions")) return Promise.resolve([]);
      return Promise.resolve([
        makeSession({ id: "sess-abc", startsAt: "2026-06-03T08:00:00" }),
      ]);
    });
    renderPage();

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      expect(links.some((l) => l.getAttribute("href") === "/sessions/sess-abc")).toBe(true);
    });
  });

  it("renders multiple session cards", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (!path.startsWith("/v1/sessions")) return Promise.resolve([]);
      return Promise.resolve([
        makeSession({ id: "s1", startsAt: "2026-06-03T08:00:00" }),
        makeSession({ id: "s2", startsAt: "2026-06-04T08:00:00" }),
        makeSession({ id: "s3", startsAt: "2026-06-05T08:00:00" }),
      ]);
    });
    renderPage();

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const hrefs = links.map((l) => l.getAttribute("href"));
      expect(hrefs).toContain("/sessions/s1");
      expect(hrefs).toContain("/sessions/s2");
      expect(hrefs).toContain("/sessions/s3");
    });
  });

  it("shows session status badges on session cards", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (!path.startsWith("/v1/sessions")) return Promise.resolve([]);
      return Promise.resolve([
        makeSession({ id: "s1", status: "checkin_open", startsAt: "2026-06-03T08:00:00" }),
      ]);
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("checkin_open")).toBeInTheDocument()
    );
  });

  it("renders a timezone abbreviation badge on each session card", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1")
        return Promise.resolve(makeEvent({ timezone: "America/Chicago" }));
      if (!path.startsWith("/v1/sessions")) return Promise.resolve([]);
      return Promise.resolve([
        makeSession({ id: "s1", startsAt: "2026-06-03T08:00:00" }),
      ]);
    });
    renderPage();

    await waitFor(() => {
      // CDT or CST — any 2-4 uppercase letter timezone abbreviation
      const tzBadges = screen.queryAllByText(/^[A-Z]{2,4}$/);
      expect(tzBadges.length).toBeGreaterThan(0);
    });
  });

  it("renders the '← Events' back link pointing to /events", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() => {
      const backLink = screen.getByRole("link", { name: /← events/i });
      expect(backLink.getAttribute("href")).toBe("/events");
    });
  });

  it("fetches using the :id from the URL", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/custom-id")
        return Promise.resolve(makeEvent({ id: "custom-id", name: "Custom Event" }));
      return Promise.resolve([]);
    });
    renderPage("custom-id");

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /custom event/i })).toBeInTheDocument()
    );
    expect(apiGet).toHaveBeenCalledWith("/v1/events/custom-id");
  });

  it("passes event_id as a query param when fetching sessions", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      return Promise.resolve([]);
    });
    renderPage("ev-1");

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(expect.stringContaining("event_id=ev-1"))
    );
  });
});

describe("EventDetailPage — entered entities", () => {
  it("groups entities under a heading per division", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([
          makeDivision("Classic", [
            makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz", songs: 2 }),
            makeEntity({ key: "us:u2", label: "Sam Lee", songs: 1 }),
          ]),
          makeDivision("Teams", [makeEntity({ key: "pt:p9", label: "team2026", songs: 1 })]),
        ]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Classic")).toBeInTheDocument());
    expect(screen.getByText("Teams")).toBeInTheDocument();
    expect(screen.getByText("Alex Kim & Jo Ruiz")).toBeInTheDocument();
    expect(screen.getByText("Sam Lee")).toBeInTheDocument();
    expect(screen.getByText("team2026")).toBeInTheDocument();
  });

  it("collapses an entity's songs into a count instead of listing them", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([
          makeDivision("Classic", [
            makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz", songs: 2 }),
            makeEntity({ key: "us:u2", label: "Sam Lee", songs: 1 }),
          ]),
        ]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("2 songs")).toBeInTheDocument());
    // Singular for one, so the row never reads "1 songs".
    expect(screen.getByText("1 song")).toBeInTheDocument();
  });

  it("counts distinct entities in the heading but sums their songs", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        // The same couple entered in two divisions is two rows but one entry —
        // and their songs from both divisions still both count as songs.
        return Promise.resolve([
          makeDivision("Classic", [
            makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz", songs: 2 }),
          ]),
          makeDivision("Masters", [
            makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz", songs: 1 }),
          ]),
        ]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /entered\s+1 entry · 3 songs/i })
      ).toBeInTheDocument()
    );
  });

  it("shows entry and song counts on each division header", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([
          makeDivision("Classic", [
            makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz", songs: 2 }),
          ]),
          makeDivision("Teams", [
            makeEntity({ key: "pt:p9", label: "team2026", songs: 1 }),
            makeEntity({ key: "us:u2", label: "Sam Lee", songs: 1 }),
          ]),
        ]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    // One couple with two Classic songs: the counts differ, which is the whole
    // reason both are printed.
    await waitFor(() => expect(screen.getByText("1 entry · 2 songs")).toBeInTheDocument());
    expect(screen.getByText("2 entries · 2 songs")).toBeInTheDocument();
  });

  it("hides a division's rows when its header is collapsed", async () => {
    const user = userEvent.setup();
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([
          makeDivision("Classic", [makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz" })]),
        ]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Alex Kim & Jo Ruiz")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByText("Alex Kim & Jo Ruiz")).toBeNull();
    // The header itself stays, so the section can be reopened.
    expect(screen.getByText("Classic")).toBeInTheDocument();
  });

  it("never renders song identity for an entity", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([
          makeDivision("Classic", [
            makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz", songs: 3 }),
          ]),
        ]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Alex Kim & Jo Ruiz")).toBeInTheDocument());
    // The roster deliberately carries no song fields — nothing on the page
    // should look like a title, routine name, filename or version suffix.
    // "3 songs" is the count, which is the whole point, so it is not a leak.
    expect(screen.queryByText(/\.mp3|\.wav|\.m4a|routine|\bv\d{2}\b/i)).toBeNull();
    expect(screen.getByText("3 songs")).toBeInTheDocument();
  });

  it("shows an empty state when nothing has been submitted", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/no music submitted for this event yet/i)).toBeInTheDocument()
    );
  });

  it("shows a sign-in CTA and skips the fetch when signed out", async () => {
    signedIn = false;
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId("sign-in-button")).toBeInTheDocument());
    expect(apiGet).not.toHaveBeenCalledWith("/v1/events/ev-1/entities");
  });

  it("surfaces a toast when the entity fetch fails", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.reject(new Error("Entities unavailable"));
      }
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Entities unavailable"));
  });
});
