// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const apiGet = vi.fn();
const apiPost = vi.fn();
// Stable client reference — see SongsPage.test for why this matters.
const apiClient = {
  get: apiGet,
  post: apiPost,
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

// Clerk: a single signedIn flag drives <SignedIn>/<SignedOut> visibility and
// useUser/useAuth return values.
let signedIn = true;
const fakeUser = { id: "user_1" };

vi.mock("@clerk/clerk-react", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    signedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    signedIn ? null : <>{children}</>,
  // <span> instead of <button> to avoid nested-button warnings — children
  // typically include a real <Button> which renders its own <button>.
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="sign-in-button">{children}</span>
  ),
  useAuth: () => ({ isSignedIn: signedIn }),
  useUser: () => ({ user: signedIn ? fakeUser : null }),
}));

import SessionDetailPage from "./SessionDetailPage";

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

function makeSession(opts: {
  /** ISO local-time strings around "now". */
  checkinOpensAt: string;
  floorTrialStartsAt: string;
  floorTrialEndsAt: string;
  hasActiveCheckin?: boolean;
  activeCheckinDivision?: string | null;
  divisions?: { division_name: string; is_priority: boolean }[];
  eventName?: string | null;
}) {
  return {
    id: "s1",
    event_id: opts.eventName ? "event-1" : null,
    event_name: opts.eventName ?? null,
    name: "ignored",
    date: opts.floorTrialStartsAt.slice(0, 10),
    checkin_opens_at: new Date(opts.checkinOpensAt).getTime(),
    floor_trial_starts_at: new Date(opts.floorTrialStartsAt).getTime(),
    floor_trial_ends_at: new Date(opts.floorTrialEndsAt).getTime(),
    status: "in_progress",
    divisions: opts.divisions ?? [],
    has_active_checkin: opts.hasActiveCheckin ?? false,
    active_checkin_division: opts.activeCheckinDivision ?? undefined,
    queue_depth: { priority: 0, non_priority: 0, active: 0 },
  };
}

/** Stub the four GET calls SessionDetailPage makes. */
function stubGets(opts: {
  session: ReturnType<typeof makeSession>;
  active?: unknown[];
  waiting?: unknown[];
  pairs?: unknown[];
  songs?: unknown[];
}) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith("/v1/sessions/")) return Promise.resolve(opts.session);
    if (path.includes("/active")) return Promise.resolve(opts.active ?? []);
    if (path.includes("/waiting")) return Promise.resolve(opts.waiting ?? []);
    if (path === "/v1/partners/leading-pairs") return Promise.resolve(opts.pairs ?? []);
    if (path === "/v1/songs") return Promise.resolve(opts.songs ?? []);
    return Promise.resolve([]);
  });
}

function renderAt(id = "s1") {
  return render(
    <MemoryRouter initialEntries={[`/sessions/${id}`]}>
      <Routes>
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionDetailPage — header", () => {
  it("renders event name as a co-title above the session title", async () => {
    signedIn = true;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-05-22T06:30:00",
        floorTrialStartsAt: "2026-05-23T19:30:00",
        floorTrialEndsAt: "2026-05-23T22:00:00",
        eventName: "GNDC",
      }),
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getByText("GNDC")).toBeInTheDocument();
    });
    expect(screen.getByText(/Saturday - 7:30 PM - May 23, 2026/)).toBeInTheDocument();
  });

  it("renders Open / Start / End time badges with the correct values", async () => {
    signedIn = true;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-05-23T07:00:00",
        floorTrialStartsAt: "2026-05-23T08:00:00",
        floorTrialEndsAt: "2026-05-23T22:00:00",
      }),
    });
    renderAt();

    // The three badge prefix labels are unique in the DOM (the reason text
    // says "Check-in opens at ..." not "Open: ..."), so getByText is safe.
    await waitFor(() => {
      expect(screen.getByText("Open:")).toBeInTheDocument();
    });
    expect(screen.getByText("Start:")).toBeInTheDocument();
    expect(screen.getByText("End:")).toBeInTheDocument();
    // The time strings appear in both the badge and the reason text, plus the
    // checkInBlock renders top + bottom — getAllByText is the right query.
    expect(screen.getAllByText(/7:00 AM/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/8:00 AM/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10:00 PM/).length).toBeGreaterThan(0);
  });

  it("renders priority and standard division lists when divisions are configured", async () => {
    signedIn = true;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-05-23T07:00:00",
        floorTrialStartsAt: "2026-05-23T08:00:00",
        floorTrialEndsAt: "2026-05-23T22:00:00",
        divisions: [
          { division_name: "Classic", is_priority: true },
          { division_name: "Showcase", is_priority: true },
          { division_name: "Masters", is_priority: false },
          { division_name: "Teams", is_priority: false },
        ],
      }),
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getByText(/Priority:/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Standard:/i)).toBeInTheDocument();
    expect(screen.getByText("Classic")).toBeInTheDocument();
    expect(screen.getByText("Showcase")).toBeInTheDocument();
    expect(screen.getByText("Masters")).toBeInTheDocument();
    expect(screen.getByText("Teams")).toBeInTheDocument();
  });
});

describe("SessionDetailPage — check-in button", () => {
  it("renders 'Sign in to check in' for signed-out visitors", async () => {
    signedIn = false;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-04-26T07:00:00",
        floorTrialStartsAt: "2026-04-27T08:00:00",
        floorTrialEndsAt: "2026-04-27T22:00:00",
      }),
    });
    renderAt();

    // The check-in block renders both at the top and the bottom of the page,
    // so the sign-in copy appears twice. Assert at least one match.
    await waitFor(() => {
      expect(screen.getAllByText(/sign in to check in/i).length).toBeGreaterThan(0);
    });
  });

  it("shows 'Already in queue (division: X)' fallback when has_active_checkin but no exact match", async () => {
    signedIn = true;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-04-27T07:00:00",
        floorTrialStartsAt: "2026-04-27T08:00:00",
        floorTrialEndsAt: "2026-04-27T22:00:00",
        hasActiveCheckin: true,
        activeCheckinDivision: "Teams",
      }),
      // active+waiting empty so userQueuePosition can't compute a precise number.
      active: [],
      waiting: [],
      pairs: [],
      songs: [],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByText(/already in queue/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/division: Teams/).length).toBeGreaterThan(0);
  });

  it("shows 'no songs uploaded' when window open and user has no songs", async () => {
    signedIn = true;
    // Build "now" by making the current moment fall inside the window.
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    stubGets({
      session: {
        ...makeSession({
          checkinOpensAt: new Date(nowMs - 60 * 60 * 1000).toISOString(),
          floorTrialStartsAt: new Date(nowMs).toISOString(),
          floorTrialEndsAt: new Date(nowMs + 4 * 60 * 60 * 1000).toISOString(),
        }),
        has_active_checkin: false,
      },
      songs: [],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByText(/no songs uploaded/i).length).toBeGreaterThan(0);
    });
  });
});

describe("SessionDetailPage — queue rendering", () => {
  it("splits Active / Priority / Standard sections with continuous numbering", async () => {
    signedIn = true;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-04-27T07:00:00",
        floorTrialStartsAt: "2026-04-27T08:00:00",
        floorTrialEndsAt: "2026-04-27T22:00:00",
      }),
      active: [
        {
          queueEntryId: "qe1",
          checkinId: "c1",
          position: 1,
          enteredQueueAt: 1,
          entityPairId: "p1",
          entitySoloUserId: null,
          entityLabel: "Alice Smith & Bob Jones",
          divisionName: "Classic",
          songId: "song1",
          notes: null,
          initialQueue: "priority",
          checkedInAt: 1,
        },
        {
          queueEntryId: "qe2",
          checkinId: "c2",
          position: 2,
          enteredQueueAt: 1,
          entityPairId: "p2",
          entitySoloUserId: null,
          entityLabel: "Carol Lee & Dave Park",
          divisionName: "Showcase",
          songId: "song2",
          notes: null,
          initialQueue: "non_priority",
          checkedInAt: 1,
        },
      ],
      waiting: [
        {
          queueEntryId: "qe3",
          checkinId: "c3",
          position: 1,
          enteredQueueAt: 1,
          entityPairId: "p3",
          entitySoloUserId: null,
          entityLabel: "Priority Pair",
          divisionName: "Classic",
          songId: "song3",
          notes: null,
          initialQueue: "priority",
          checkedInAt: 1,
          subQueue: "priority",
        },
        {
          queueEntryId: "qe4",
          checkinId: "c4",
          position: 1,
          enteredQueueAt: 1,
          entityPairId: "p4",
          entitySoloUserId: null,
          entityLabel: "Standard Pair",
          divisionName: "Showcase",
          songId: "song4",
          notes: null,
          initialQueue: "non_priority",
          checkedInAt: 1,
          subQueue: "non_priority",
        },
      ],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    // All three section titles render.
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();

    // Real partnership names rendered (server-provided entityLabel).
    expect(screen.getByText("Alice Smith & Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Carol Lee & Dave Park")).toBeInTheDocument();
    expect(screen.getByText("Priority Pair")).toBeInTheDocument();
    expect(screen.getByText("Standard Pair")).toBeInTheDocument();

    // Position numbers continue across groups: active = 1,2; priority = 3; standard = 4.
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
    expect(screen.getByText("#4")).toBeInTheDocument();
  });

  it("shows empty-state copy in each section when its queue is empty", async () => {
    signedIn = true;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-04-27T07:00:00",
        floorTrialStartsAt: "2026-04-27T08:00:00",
        floorTrialEndsAt: "2026-04-27T22:00:00",
      }),
      active: [],
      waiting: [],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getByText(/no one on deck/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/priority queue is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/standard queue is empty/i)).toBeInTheDocument();
  });
});
