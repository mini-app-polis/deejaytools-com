// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

// Who the caller is decides whether the missing-music counts load: admins
// and this event's staff only.
let authMe: { isAdmin: boolean; eventRoles: { event_id: string; role: string }[] } = {
  isAdmin: false,
  eventRoles: [],
};
vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => authMe,
}));

import EventDetailPage from "./EventDetailPage";
import { toast } from "sonner";
import type { EventStatus, SessionStatus } from "@/schemas";
import { fx } from "@/test/fixtures";
import { renderWithQueryClient } from "@/test/render";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvent(opts: {
  id?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  status?: EventStatus;
  timezone?: string;
}) {
  return fx.event({
    id: opts.id ?? "ev-1",
    name: opts.name ?? "Test Event",
    start_date: opts.startDate ?? "2026-06-01",
    end_date: opts.endDate ?? "2026-06-05",
    status: opts.status ?? "upcoming",
    timezone: opts.timezone ?? "America/Chicago",
  });
}

function makeSession(opts: {
  id: string;
  status?: SessionStatus;
  startsAt?: string;
}) {
  const startTs = new Date(opts.startsAt ?? "2026-06-03T08:00:00").getTime();
  return fx.session({
    id: opts.id,
    event_id: "ev-1",
    name: "session-name",
    date: (opts.startsAt ?? "2026-06-03T08:00:00").slice(0, 10),
    status: opts.status ?? "scheduled",
    checkin_opens_at: startTs - 60 * 60 * 1000,
    floor_trial_starts_at: startTs,
    floor_trial_ends_at: startTs + 2 * 60 * 60 * 1000,
  });
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
  return renderWithQueryClient(
    <MemoryRouter initialEntries={[`/events/${id}`]}>
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Divisions start collapsed: wait for `division`'s header, then open every division. */
async function expandDivisions(division: string) {
  await screen.findByText(division);
  for (const header of screen.getAllByRole("button", { expanded: false })) fireEvent.click(header);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
  apiGet.mockReset();
  signedIn = true;
  authMe = { isAdmin: false, eventRoles: [] };
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
    const statuses = ["upcoming", "active", "completed"] as const;

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

  it("shows a failed load inline, not as a missing event", async () => {
    apiGet.mockRejectedValue(new Error("Network failure"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the event: Network failure");
    expect(screen.queryByText("Event not found.")).not.toBeInTheDocument();
  });

  it("says the event was not found when the API answers 404", async () => {
    apiGet.mockRejectedValue(Object.assign(new Error("Event not found"), { status: 404 }));
    renderPage();

    expect(await screen.findByText("Event not found.")).toBeInTheDocument();
  });

  it("shows 'Event not found.' when the event request fails with 404", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.reject(new Error("Event not found"));
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/event not found/i)).toBeInTheDocument()
    );
  });

  it("keeps the event on screen and reports the sessions error when only sessions fail", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({ name: "Swing Fling" }));
      if (path.startsWith("/v1/sessions")) return Promise.reject(new Error("Sessions unavailable"));
      return Promise.resolve([]);
    });
    renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Swing Fling" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/sessions unavailable/i);
    expect(screen.queryByText(/event not found/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no sessions for this event/i)).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("lists only active and upcoming sessions, tallying the rest in the heading", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (!path.startsWith("/v1/sessions")) return Promise.resolve([]);
      return Promise.resolve([
        makeSession({ id: "s-live", status: "in_progress", startsAt: "2026-06-03T08:00:00" }),
        makeSession({ id: "s-next", status: "scheduled", startsAt: "2026-06-04T08:00:00" }),
        makeSession({ id: "s-done", status: "completed", startsAt: "2026-06-02T08:00:00" }),
      ]);
    });
    renderPage();

    await waitFor(() => {
      const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
      expect(hrefs).toContain("/sessions/s-live");
    });
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/sessions/s-next");
    // Completed sessions are not cards anyone can act on...
    expect(hrefs).not.toContain("/sessions/s-done");
    // ...but the heading still accounts for them.
    expect(
      screen.getByRole("heading", { name: /sessions\s+1 active · 1 upcoming · 1 completed/i })
    ).toBeInTheDocument();
  });

  it("distinguishes an event with no sessions from one whose sessions are all done", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (!path.startsWith("/v1/sessions")) return Promise.resolve([]);
      return Promise.resolve([
        makeSession({ id: "s-done", status: "completed", startsAt: "2026-06-02T08:00:00" }),
      ]);
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/no upcoming sessions for this event/i)).toBeInTheDocument()
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
      expect(screen.getByText("Check-in open")).toBeInTheDocument()
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
    expect(apiGet).toHaveBeenCalledWith("/v1/events/custom-id", { anonymous: true });
  });

  it("ignores a late response for the previous :id", async () => {
    let releaseA!: (ev: unknown) => void;
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-a") return new Promise((r) => { releaseA = r; });
      if (path === "/v1/events/ev-b") return Promise.resolve(makeEvent({ id: "ev-b", name: "Event B" }));
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderWithQueryClient(
      <MemoryRouter initialEntries={["/events/ev-a"]}>
        <Link to="/events/ev-b">go to b</Link>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-a", { anonymous: true }));
    await user.click(screen.getByRole("link", { name: "go to b" }));
    expect(await screen.findByRole("heading", { name: "Event B" })).toBeInTheDocument();

    releaseA(makeEvent({ id: "ev-a", name: "Event A" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByRole("heading", { name: "Event B" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Event A" })).not.toBeInTheDocument();
  });

  it("does not show the previous event while the next one loads", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-a") return Promise.resolve(makeEvent({ id: "ev-a", name: "Event A" }));
      if (path === "/v1/events/ev-b") return Promise.reject(new Error("gone"));
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderWithQueryClient(
      <MemoryRouter initialEntries={["/events/ev-a"]}>
        <Link to="/events/ev-b">go to b</Link>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Event A" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "go to b" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the event: gone");
    expect(screen.queryByRole("heading", { name: "Event A" })).not.toBeInTheDocument();
  });

  it("passes event_id as a query param when fetching sessions", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      return Promise.resolve([]);
    });
    renderPage("ev-1");

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(expect.stringContaining("event_id=ev-1"), { anonymous: true })
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
    await expandDivisions("Teams");
    expect(screen.getByText("Alex Kim & Jo Ruiz")).toBeInTheDocument();
    expect(screen.getByText("Sam Lee")).toBeInTheDocument();
    expect(screen.getByText("team2026")).toBeInTheDocument();
  });

  it("lists each entity once, with no song count", async () => {
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

    await expandDivisions("Classic");
    await waitFor(() => expect(screen.getByText("Alex Kim & Jo Ruiz")).toBeInTheDocument());
    expect(screen.getByText("Sam Lee")).toBeInTheDocument();
    // Couples are what the event page counts; their songs are not shown.
    expect(screen.queryByText(/\bsongs?\b/)).toBeNull();
  });

  it("counts distinct entities in the heading", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        // The same couple entered in two divisions is two rows but one entry.
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
        screen.getByRole("heading", { name: /^entered\s+1 entry$/i })
      ).toBeInTheDocument()
    );
  });

  it("shows the entry count on each division header", async () => {
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

    await waitFor(() => expect(screen.getByText("1 entry")).toBeInTheDocument());
    expect(screen.getByText("2 entries")).toBeInTheDocument();
  });

  it("starts each division collapsed, opening and closing it from its header", async () => {
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

    // Collapsed to start: the header's counts are the overview.
    await screen.findByText("Classic");
    expect(screen.queryByText("Alex Kim & Jo Ruiz")).toBeNull();
    await user.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("Alex Kim & Jo Ruiz")).toBeInTheDocument();
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

    await expandDivisions("Classic");
    await waitFor(() => expect(screen.getByText("Alex Kim & Jo Ruiz")).toBeInTheDocument());
    // The roster deliberately carries no song fields — nothing on the page
    // should look like a title, routine name, filename or version suffix.
    expect(screen.queryByText(/\.mp3|\.wav|\.m4a|routine|\bv\d{2}\b/i)).toBeNull();
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

  it("shows a failed entity fetch inline", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.reject(new Error("Entities unavailable"));
      }
      return Promise.resolve([]);
    });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load who's entered: Entities unavailable"
    );
  });
});

describe("EventDetailPage — missing music counts", () => {
  function registration(division: string, dancer_1: string, dancer_2: string) {
    return {
      id: `${division}:${dancer_1}`,
      event_id: "ev-1",
      position: 0,
      division,
      dancer_1,
      dancer_2,
      linked_label: null,
      handled: false,
      note: null,
      scratched: false,
      hidden_submission_ids: [],
      created_at: 0,
      updated_at: 0,
    };
  }

  function submission(id: string, partnership_label: string, division: string) {
    return {
      id,
      event_id: "ev-1",
      event_name: "Test Event",
      division,
      round: "prelims_and_finals",
      song_id: `song-${id}`,
      owner_user_id: "u1",
      song_label: partnership_label,
      partnership_label,
      submitter_email: "a***@example.com",
      created_at: 1,
    };
  }

  function mockRegistrationApi() {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([
          makeDivision("Classic", [makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz" })]),
        ]);
      }
      if (path === "/v1/events/ev-1/registrations") {
        return Promise.resolve([
          registration("Classic", "Alex Kim", "Jo Ruiz"),
          registration("Classic", "Pat Long", "Sam Short"),
          registration("Masters", "Gina White", "Hank Green"),
        ]);
      }
      if (path === "/v1/events/ev-1/song-submissions") {
        return Promise.resolve([submission("s1", "Alex Kim & Jo Ruiz", "Classic")]);
      }
      if (path === SONGS_ON_FILE) {
        return Promise.resolve([
          { registration_id: "Classic:Pat Long", candidates: [songOnFile("Pat Long & Sam Short")] },
          // Alex & Jo have music in: a stale answer for them is not shown.
          { registration_id: "Classic:Alex Kim", candidates: [songOnFile("Alex Kim & Jo Ruiz")] },
        ]);
      }
      return Promise.resolve([]);
    });
  }

  const SONGS_ON_FILE = "/v1/admin/events/ev-1/registrations/songs-on-file";

  function songOnFile(partnership_label: string) {
    return {
      song_id: `song-${partnership_label}`,
      match: "strong",
      song_label: `${partnership_label} Classic 2026`,
      partnership_label,
      division: "Classic",
      season_year: "2026",
      added_at: 1,
      same_division: true,
      submitted_this_season: [],
    };
  }

  it("shows admins which entries missing music likely have a song on file, with counts", async () => {
    authMe = { isAdmin: true, eventRoles: [] };
    mockRegistrationApi();
    renderPage();

    await waitFor(() => expect(screen.getAllByText(/1 likely on file/).length).toBe(2));
    await expandDivisions("Classic");
    const pat = screen.getByText("Pat Long & Sam Short").parentElement!;
    expect(within(pat).getByText("Missing music")).toBeInTheDocument();
    expect(within(pat).getByText("Likely on file")).toBeInTheDocument();
    const gina = screen.getByText("Gina White & Hank Green").parentElement!;
    expect(within(gina).queryByText("Likely on file")).toBeNull();
    expect(screen.getAllByText("Likely on file")).toHaveLength(1);
  });

  it("lists every registered competitor to the event's staff, marking who is missing music", async () => {
    authMe = { isAdmin: false, eventRoles: [{ event_id: "ev-1", role: "coordinator" }] };
    mockRegistrationApi();
    renderPage();

    await waitFor(() => expect(screen.getAllByText(/1 missing/).length).toBeGreaterThan(0));
    // A division nobody has submitted to is still listed, so its missing
    // entries show.
    expect(screen.getByText("Masters")).toBeInTheDocument();
    expect(screen.getByText(/2 missing/)).toBeInTheDocument();
    await expandDivisions("Masters");
    expect(screen.queryByText("Nothing submitted yet.")).toBeNull();

    // Classic: the entered couple, then the registered one without music, by name.
    const alex = screen.getByText("Alex Kim & Jo Ruiz").parentElement!;
    expect(within(alex).queryByText("Missing music")).toBeNull();
    const pat = screen.getByText("Pat Long & Sam Short").parentElement!;
    expect(within(pat).getByText("Missing music")).toBeInTheDocument();
    const gina = screen.getByText("Gina White & Hank Green").parentElement!;
    expect(within(gina).getByText("Missing music")).toBeInTheDocument();
    // Songs on file are admins' only: the event's staff never ask for them.
    expect(screen.queryByText(/likely on file/i)).toBeNull();
    expect(apiGet.mock.calls.map(([p]) => p)).not.toContain(SONGS_ON_FILE);
  });

  it("marks a near-name registration as a possible match", async () => {
    authMe = { isAdmin: true, eventRoles: [] };
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([makeDivision("Classic", [makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz" })])]);
      }
      if (path === "/v1/events/ev-1/registrations") return Promise.resolve([registration("Classic", "Alexx Kim", "Jo Ruiz")]);
      if (path === "/v1/events/ev-1/song-submissions") {
        return Promise.resolve([submission("s1", "Alex Kim & Jo Ruiz", "Classic")]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() => expect(screen.getAllByText(/1 possible/).length).toBeGreaterThan(0));
    await expandDivisions("Classic");
    const row = screen.getByText("Alexx Kim & Jo Ruiz").parentElement!;
    expect(within(row).getByText("Possible match")).toBeInTheDocument();
  });

  it("marks an entered Classic couple at The Open with the round still to come, on its own row", async () => {
    authMe = { isAdmin: true, eventRoles: [] };
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({ name: "The Open 2026" }));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([makeDivision("Classic", [makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz" })])]);
      }
      if (path === "/v1/events/ev-1/registrations") return Promise.resolve([registration("Classic", "Alex Kim", "Jo Ruiz")]);
      if (path === "/v1/events/ev-1/song-submissions") {
        return Promise.resolve([{ ...submission("s1", "Alex Kim & Jo Ruiz", "Classic"), round: "prelims_only" }]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    await waitFor(() => expect(screen.getAllByText(/1 missing/).length).toBeGreaterThan(0));
    await expandDivisions("Classic");
    // One row: the entered couple, flagged, not a second registered row.
    expect(screen.getAllByText("Alex Kim & Jo Ruiz")).toHaveLength(1);
    const row = screen.getByText("Alex Kim & Jo Ruiz").parentElement!;
    expect(within(row).getByText("Finals missing")).toBeInTheDocument();
  });

  it("names registrations whose division is not recognised under their own line", async () => {
    authMe = { isAdmin: true, eventRoles: [] };
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([makeDivision("Classic", [makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz" })])]);
      }
      if (path === "/v1/events/ev-1/registrations") {
        return Promise.resolve([
          registration("Classic", "Alex Kim", "Jo Ruiz"),
          registration("Mystery Mixer", "Quinn Odd", "Remy Rare"),
        ]);
      }
      if (path === "/v1/events/ev-1/song-submissions") {
        return Promise.resolve([submission("s1", "Alex Kim & Jo Ruiz", "Classic")]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    expect(await screen.findByText(/Registrations in divisions not recognised/)).toBeInTheDocument();
    const item = screen.getByText("Quinn Odd & Remy Rare").closest("li")!;
    expect(within(item).getByText("Missing music")).toBeInTheDocument();
  });

  it("shows no registered names to anyone but the event's staff and admins", async () => {
    authMe = { isAdmin: false, eventRoles: [] };
    mockRegistrationApi();
    renderPage();

    await expandDivisions("Classic");
    expect(screen.getByText("Alex Kim & Jo Ruiz")).toBeInTheDocument();
    expect(screen.queryByText(/Pat Long|Gina White/)).toBeNull();
    expect(screen.queryByText("Missing music")).toBeNull();
  });

  it("shows the event's staff the percent complete per division and in total", async () => {
    authMe = { isAdmin: false, eventRoles: [{ event_id: "ev-1", role: "coordinator" }] };
    mockRegistrationApi();
    renderPage();

    // Classic: 1 of 2 in. Masters: 0 of 1. The event: 1 of 3.
    await waitFor(() => expect(screen.getByText(/2 total · 50% complete/)).toBeInTheDocument());
    expect(screen.getByText(/1 total · 0% complete/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^entered/i }).textContent).toMatch(
      /1 entry · 3 total · 33% complete · 2 missing$/
    );
  });

  it("counts a handled entry as complete and leaves a scratched one out", async () => {
    authMe = { isAdmin: true, eventRoles: [] };
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([
          makeDivision("Classic", [makeEntity({ key: "pt:p1", label: "Alex Kim & Jo Ruiz" })]),
        ]);
      }
      if (path === "/v1/events/ev-1/registrations") {
        return Promise.resolve([
          registration("Classic", "Alex Kim", "Jo Ruiz"),
          { ...registration("Classic", "Pat Long", "Sam Short"), handled: true },
          { ...registration("Classic", "Lee Park", "Kai Moss"), scratched: true },
          registration("Classic", "Ana Bell", "Tom Hart"),
        ]);
      }
      if (path === "/v1/events/ev-1/song-submissions") {
        return Promise.resolve([submission("s1", "Alex Kim & Jo Ruiz", "Classic")]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    // Submitted + handled = 2, of 4 less 1 scratched = 3.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /^entered/i }).textContent).toMatch(
        /1 entry · 3 total · 67% complete · 1 missing$/
      )
    );
  });

  it("shows admins the counts, a missing entry likely on file counted as on file only", async () => {
    authMe = { isAdmin: true, eventRoles: [] };
    mockRegistrationApi();
    renderPage();

    // Pat is missing but likely on file; Gina is missing.
    await waitFor(() => expect(screen.getAllByText(/1 likely on file/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/1 missing/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2 missing/)).toBeNull();
  });

  it("does not load the registration list for anyone else", async () => {
    authMe = { isAdmin: false, eventRoles: [{ event_id: "other-event", role: "event-manager" }] };
    mockRegistrationApi();
    renderPage();

    await expandDivisions("Classic");
    await waitFor(() => expect(screen.getByText("Alex Kim & Jo Ruiz")).toBeInTheDocument());
    expect(apiGet).not.toHaveBeenCalledWith("/v1/events/ev-1/registrations");
    expect(apiGet).not.toHaveBeenCalledWith("/v1/events/ev-1/song-submissions");
    expect(screen.queryByText(/missing|% complete/)).toBeNull();
    expect(screen.queryByText("Masters")).toBeNull();
  });
});

describe("EventDetailPage — staff portal links", () => {
  function mockEvent() {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({ name: "Spring Swing" }));
      return Promise.resolve([]);
    });
  }

  it("keeps an admin's view-as links off the page: they are in the Admin rows", async () => {
    authMe = { isAdmin: true, eventRoles: [] };
    mockEvent();
    renderPage();

    await screen.findByRole("heading", { name: /spring swing/i });
    expect(screen.queryByRole("link", { name: "Coordinator" })).toBeNull();
    expect(screen.queryByText(/view as/i)).toBeNull();
  });

  it("links the event's staff to their own portal", async () => {
    authMe = { isAdmin: false, eventRoles: [{ event_id: "ev-1", role: "coordinator" }] };
    mockEvent();
    renderPage();

    expect(await screen.findByRole("link", { name: /open your coordinator portal/i })).toHaveAttribute(
      "href",
      "/events/ev-1/coordinator"
    );
  });

  it("shows no portal links to anyone else", async () => {
    mockEvent();
    renderPage();

    await screen.findByRole("heading", { name: /spring swing/i });
    expect(screen.queryByRole("link", { name: /portal|coordinator/i })).toBeNull();
  });
});

describe("EventDetailPage — readable URLs", () => {
  const ID = "d4b20af5-045b-47b2-a9c3-34214dbaeca2";
  const OPEN = fx.event({
    id: ID,
    name: "The Open",
    start_date: "2026-11-26",
    end_date: "2026-11-29",
    status: "upcoming",
    timezone: "America/Los_Angeles",
  });

  function Where() {
    const location = useLocation();
    return <output data-testid="where">{location.pathname}</output>;
  }

  function renderAt(path: string) {
    return renderWithQueryClient(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/events/:id" element={<EventDetailPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    );
  }

  function mockOpen() {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") return Promise.resolve([OPEN]);
      if (path === `/v1/events/${ID}`) return Promise.resolve(OPEN);
      return Promise.resolve([]);
    });
  }

  it("opens an event by its name-year slug", async () => {
    mockOpen();
    renderAt("/events/the-open-2026");

    expect(await screen.findByRole("heading", { level: 1, name: "The Open" })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith(`/v1/events/${ID}`, expect.anything());
    expect(screen.getByTestId("where")).toHaveTextContent("/events/the-open-2026");
  });

  it("moves an id URL to the event's readable one", async () => {
    mockOpen();
    renderAt(`/events/${ID}`);

    expect(await screen.findByRole("heading", { level: 1, name: "The Open" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/events/the-open-2026"));
  });

  it("says the event was not found for a slug no event has", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") return Promise.resolve([OPEN]);
      return Promise.reject(Object.assign(new Error("Event not found"), { status: 404 }));
    });
    renderAt("/events/no-such-event-2026");

    expect(await screen.findByText("Event not found.")).toBeInTheDocument();
  });
});

describe("EventDetailPage — layout", () => {
  function mockEventWithDivisions() {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({ name: "Swing Fling", status: "active" }));
      if (path.startsWith("/v1/sessions")) return Promise.resolve([makeSession({ id: "s1" })]);
      if (path === "/v1/events/ev-1/entities") {
        return Promise.resolve([
          makeDivision("Classic", [makeEntity({ key: "us:a", label: "Ann" })]),
          makeDivision("Showcase", [makeEntity({ key: "us:b", label: "Bea" })]),
        ]);
      }
      return Promise.resolve([]);
    });
  }

  it("keeps the title, dates and status in a bar that sticks under the site header", async () => {
    mockEventWithDivisions();
    renderPage();

    const bar = await screen.findByTestId("event-header");
    expect(bar.className).toContain("sticky");
    expect(bar.style.top).toBe("var(--app-header-height, 3.5rem)");
    expect(within(bar).getByRole("heading", { level: 1, name: "Swing Fling" })).toBeInTheDocument();
    expect(within(bar).getByText("2026-06-01 – 2026-06-05")).toBeInTheDocument();
    expect(within(bar).getByText("active")).toBeInTheDocument();
  });

  it("expands and collapses every division at once", async () => {
    mockEventWithDivisions();
    const user = userEvent.setup();
    renderPage();

    const expandAll = await screen.findByRole("button", { name: "Expand all" });
    const collapseAll = screen.getByRole("button", { name: "Collapse all" });
    expect(collapseAll).toBeDisabled();
    expect(screen.queryByText("Ann")).toBeNull();

    await user.click(expandAll);
    expect(screen.getByText("Ann")).toBeInTheDocument();
    expect(screen.getByText("Bea")).toBeInTheDocument();
    expect(expandAll).toBeDisabled();

    await user.click(collapseAll);
    expect(screen.queryByText("Ann")).toBeNull();
    expect(screen.queryByText("Bea")).toBeNull();
  });

  it("shows the session cards' arrow without an 'Open session' line, the whole card still a link", async () => {
    mockEventWithDivisions();
    renderPage();

    const link = await waitFor(() => {
      const found = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/sessions/s1");
      if (!found) throw new Error("no session card yet");
      return found;
    });
    expect(screen.queryByText(/open session/i)).toBeNull();
    expect(within(link).getByText("→")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("EventDetailPage — submissions chart", () => {
  const timeline = {
    series: "The Open",
    today: -8,
    events: [
      {
        id: "ev-1", name: "The Open 2026", start_date: "2026-06-01", end_date: "2026-06-05",
        registrations: 4, submissions: 1, days: [{ day: -10, count: 1 }],
        song_added_days: [{ day: -60, count: 1 }],
        likely_on_file_days: [{ day: -9, count: 1 }],
      },
      {
        id: "ev-0", name: "The Open 2025", start_date: "2025-06-02", end_date: "2025-06-06",
        registrations: 2, submissions: 2, days: [{ day: -9, count: 1 }, { day: -7, count: 1 }],
        song_added_days: [{ day: -9, count: 1 }, { day: -7, count: 1 }],
        likely_on_file_days: [],
      },
    ],
  };

  function mockTimeline(body: unknown = timeline) {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events/ev-1") return Promise.resolve(makeEvent({}));
      if (path === "/v1/events/ev-1/submission-timeline") return Promise.resolve(body);
      return Promise.resolve([]);
    });
  }

  it("shows the event's staff today's share beside last edition's on the same day", async () => {
    authMe = { isAdmin: false, eventRoles: [{ event_id: "ev-1", role: "coordinator" }] };
    mockTimeline();
    renderPage();

    const section = await screen.findByRole("region", { name: /music submissions/i });
    expect(within(section).getByText(/share of entries by day · against last edition/)).toBeInTheDocument();
    const readout = within(section).getByRole("list");
    expect(within(readout).getByText("Day −8 (today)")).toBeInTheDocument();
    expect(within(readout).getByText("The Open 2026").nextSibling).toHaveTextContent("25%");
    expect(within(readout).getByText("The Open 2025").nextSibling).toHaveTextContent("50%");
    // This year only, its music already in deejaytools; staff never get entries likely on file.
    expect(within(readout).getAllByText(/in deejaytools$/).map((el) => el.textContent)).toEqual(["25% in deejaytools"]);
    expect(within(section).getByText("In deejaytools: songs by the day added")).toBeInTheDocument();
    expect(within(section).getByRole("img")).toHaveAccessibleName(
      /Day −8: The Open 2026: 25% submitted, 25% in deejaytools; The Open 2025: 50% submitted\./
    );
  });

  it("shows admins the chart, projecting the entries likely on file", async () => {
    authMe = { isAdmin: true, eventRoles: [] };
    mockTimeline();
    renderPage();

    const section = await screen.findByRole("region", { name: /music submissions/i });
    const readout = within(section).getByRole("list");
    expect(within(readout).getByText("50% in deejaytools")).toBeInTheDocument();
    expect(
      within(section).getByText("In deejaytools: songs by the day added, with entries likely on file")
    ).toBeInTheDocument();
  });

  it("shows nothing while no edition has a submission", async () => {
    authMe = { isAdmin: true, eventRoles: [] };
    mockTimeline({
      ...timeline,
      events: timeline.events.map((e) => ({ ...e, submissions: 0, days: [], song_added_days: [], likely_on_file_days: [] })),
    });
    renderPage();

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/submission-timeline"));
    await screen.findByRole("heading", { name: /test event/i });
    expect(screen.queryByRole("region", { name: /music submissions/i })).toBeNull();
  });

  it("does not load it for anyone else", async () => {
    authMe = { isAdmin: false, eventRoles: [{ event_id: "other-event", role: "dj" }] };
    mockTimeline();
    renderPage();

    await screen.findByRole("heading", { name: /test event/i });
    expect(apiGet).not.toHaveBeenCalledWith("/v1/events/ev-1/submission-timeline");
    expect(screen.queryByRole("region", { name: /music submissions/i })).toBeNull();
  });
});
