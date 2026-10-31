// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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
import { toast } from "sonner";
import { fx } from "@/test/fixtures";

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
  return fx.session({
    id: "s1",
    event_id: opts.eventName ? "event-1" : null,
    event_name: opts.eventName ?? null,
    name: "ignored",
    date: opts.floorTrialStartsAt.slice(0, 10),
    checkin_opens_at: new Date(opts.checkinOpensAt).getTime(),
    floor_trial_starts_at: new Date(opts.floorTrialStartsAt).getTime(),
    floor_trial_ends_at: new Date(opts.floorTrialEndsAt).getTime(),
    status: "in_progress",
    divisions: (opts.divisions ?? []).map((d, i) => ({
      id: `d${i}`,
      sort_order: i,
      priority_run_limit: null,
      ...d,
    })),
    has_active_checkin: opts.hasActiveCheckin ?? false,
    active_checkin_division: opts.activeCheckinDivision ?? undefined,
    queue_depth: { priority: 0, non_priority: 0, active: 0 },
  });
}

/** Stub the GET calls SessionDetailPage makes. */
function stubGets(opts: {
  session: ReturnType<typeof makeSession>;
  active?: unknown[];
  waiting?: unknown[];
  pairs?: unknown[];
  songs?: unknown[];
  myCheckins?: unknown[];
  eventSubmissions?: unknown[] | "reject";
}) {
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith("/v1/sessions/")) return Promise.resolve(opts.session);
    if (path.includes("/active")) return Promise.resolve(opts.active ?? []);
    if (path.includes("/waiting")) return Promise.resolve(opts.waiting ?? []);
    if (path === "/v1/partners/leading-pairs") return Promise.resolve(opts.pairs ?? []);
    if (path === "/v1/songs") {
      return Promise.resolve(
        (opts.songs ?? []).map((s) => fx.song(s as Parameters<typeof fx.song>[0]))
      );
    }
    if (path === "/v1/checkins/mine") return Promise.resolve(opts.myCheckins ?? []);
    if (path.startsWith("/v1/event-song-submissions")) {
      if (opts.eventSubmissions === "reject") {
        return Promise.reject(new Error("event submissions unavailable"));
      }
      return Promise.resolve(opts.eventSubmissions ?? []);
    }
    return Promise.resolve([]);
  });
}

function makeMyCheckin(opts: {
  sessionId?: string;
  queueEntryId?: string;
  entityPairId?: string | null;
  entitySoloUserId?: string | null;
  entityManagedPartnershipId?: string | null;
  divisionName?: string;
  canWithdraw?: boolean;
}) {
  return fx.myCheckin({
    id: `ci_${opts.queueEntryId ?? "qe1"}`,
    sessionId: opts.sessionId ?? "s1",
    eventName: "GNDC",
    sessionName: "Session",
    sessionFloorTrialStartsAt: 1,
    sessionStatus: "in_progress",
    eventTimezone: null,
    divisionName: opts.divisionName ?? "Classic",
    entityPairId: opts.entityPairId ?? null,
    entitySoloUserId: opts.entitySoloUserId ?? null,
    entityManagedPartnershipId: opts.entityManagedPartnershipId ?? null,
    entityLabel: "Test Entity",
    songDisplayName: null,
    songProcessedFilename: null,
    notes: null,
    checkedInAt: 1,
    queueEntryId: opts.queueEntryId ?? "qe1",
    queueType: "priority",
    queuePosition: 1,
    overallPosition: 1,
    runCount: 0,
    ...(opts.canWithdraw === undefined ? {} : { canWithdraw: opts.canWithdraw }),
  });
}

function openCheckinWindowSession(eventName = "GNDC") {
  const nowMs = Date.now();
  return makeSession({
    eventName,
    checkinOpensAt: new Date(nowMs - 60 * 60 * 1000).toISOString(),
    floorTrialStartsAt: new Date(nowMs).toISOString(),
    floorTrialEndsAt: new Date(nowMs + 4 * 60 * 60 * 1000).toISOString(),
    divisions: [{ division_name: "Classic", is_priority: true }],
  });
}

const sampleSongs = [
  fx.song({
    id: "song1",
    routine_name: "Song One",
    division: "Classic",
    partner_id: null,
  }),
  fx.song({
    id: "song2",
    routine_name: "Song Two",
    division: "Classic",
    partner_id: null,
  }),
  fx.song({
    id: "song3",
    routine_name: "Song Three",
    division: "Classic",
    partner_id: null,
  }),
];

function makeSubmission(songId: string) {
  return fx.eventSongSubmission({
    id: `sub_${songId}`,
    event_id: "event-1",
    event_name: "GNDC",
    event_start_date: "2026-05-22",
    event_status: "upcoming",
    song_id: songId,
    song_label: songId,
    division: "Classic",
    created_at: 1,
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

  it("shows queue position when user's partnership is in the waiting queue", async () => {
    signedIn = true;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-04-27T07:00:00",
        floorTrialStartsAt: "2026-04-27T08:00:00",
        floorTrialEndsAt: "2026-04-27T22:00:00",
      }),
      active: [],
      waiting: [
        {
          queueEntryId: "qe1",
          checkinId: "c1",
          position: 1,
          enteredQueueAt: 1,
          entityPairId: "pair_1",
          entitySoloUserId: null,
          entityLabel: "User One & Partner A",
          divisionName: "Classic",
          songId: "song1",
          notes: null,
          initialQueue: "priority",
          checkedInAt: 1,
          subQueue: "priority",
        },
      ],
      pairs: [{ id: "pair_1", display_name: "User One & Partner A", partner_b_id: "partner_1" }],
      songs: [],
      myCheckins: [makeMyCheckin({ entityPairId: "pair_1", queueEntryId: "qe1" })],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByText(/#1 in queue/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/priority/i).length).toBeGreaterThan(0);
  });

  it("shows a position line for each partnership when multiple are in queue", async () => {
    signedIn = true;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-04-27T07:00:00",
        floorTrialStartsAt: "2026-04-27T08:00:00",
        floorTrialEndsAt: "2026-04-27T22:00:00",
      }),
      active: [],
      waiting: [
        {
          queueEntryId: "qe1",
          checkinId: "c1",
          position: 1,
          enteredQueueAt: 1,
          entityPairId: "pair_1",
          entitySoloUserId: null,
          entityLabel: "User One & Partner A",
          divisionName: "Classic",
          songId: "song1",
          notes: null,
          initialQueue: "priority",
          checkedInAt: 1,
          subQueue: "priority",
        },
        {
          queueEntryId: "qe2",
          checkinId: "c2",
          position: 1,
          enteredQueueAt: 2,
          entityPairId: "pair_2",
          entitySoloUserId: null,
          entityLabel: "User One & Partner B",
          divisionName: "Showcase",
          songId: "song2",
          notes: null,
          initialQueue: "non_priority",
          checkedInAt: 2,
          subQueue: "non_priority",
        },
      ],
      pairs: [
        { id: "pair_1", display_name: "User One & Partner A", partner_b_id: "partner_1" },
        { id: "pair_2", display_name: "User One & Partner B", partner_b_id: "partner_2" },
      ],
      songs: [],
      myCheckins: [
        makeMyCheckin({ entityPairId: "pair_1", queueEntryId: "qe1", divisionName: "Classic" }),
        makeMyCheckin({ entityPairId: "pair_2", queueEntryId: "qe2", divisionName: "Showcase" }),
      ],
    });
    renderAt();

    // Both entries should render a position line (the check-in block renders twice)
    await waitFor(() => {
      expect(screen.getAllByText(/#1 in queue/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/#2 in queue/i).length).toBeGreaterThan(0);
    // Entity labels are shown when multiple entries are present
    expect(screen.getAllByText(/Partner A/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Partner B/i).length).toBeGreaterThan(0);
  });

  it("shows queue position for a placeholder partner absent from leading-pairs", async () => {
    signedIn = true;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-04-27T07:00:00",
        floorTrialStartsAt: "2026-04-27T08:00:00",
        floorTrialEndsAt: "2026-04-27T22:00:00",
      }),
      active: [],
      waiting: [
        {
          queueEntryId: "qe_team",
          checkinId: "c_team",
          position: 2,
          enteredQueueAt: 1,
          entityPairId: "pair_team",
          entitySoloUserId: null,
          entityLabel: "User One · Team Alpha",
          divisionName: "Teams",
          songId: "song_team",
          notes: null,
          initialQueue: "non_priority",
          checkedInAt: 1,
          subQueue: "non_priority",
        },
      ],
      pairs: [],
      songs: [],
      myCheckins: [makeMyCheckin({ entityPairId: "pair_team", queueEntryId: "qe_team", divisionName: "Teams" })],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByText(/#2 in queue/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/Teams/i).length).toBeGreaterThan(0);
  });

  it("shows a position line for both a normal partner and a placeholder entry", async () => {
    signedIn = true;
    stubGets({
      session: makeSession({
        checkinOpensAt: "2026-04-27T07:00:00",
        floorTrialStartsAt: "2026-04-27T08:00:00",
        floorTrialEndsAt: "2026-04-27T22:00:00",
      }),
      active: [],
      waiting: [
        {
          queueEntryId: "qe1",
          checkinId: "c1",
          position: 1,
          enteredQueueAt: 1,
          entityPairId: "pair_1",
          entitySoloUserId: null,
          entityLabel: "User One & Partner A",
          divisionName: "Classic",
          songId: "song1",
          notes: null,
          initialQueue: "priority",
          checkedInAt: 1,
          subQueue: "priority",
        },
        {
          queueEntryId: "qe_team",
          checkinId: "c_team",
          position: 1,
          enteredQueueAt: 2,
          entityPairId: "pair_team",
          entitySoloUserId: null,
          entityLabel: "User One · Team Alpha",
          divisionName: "Teams",
          songId: "song_team",
          notes: null,
          initialQueue: "non_priority",
          checkedInAt: 2,
          subQueue: "non_priority",
        },
      ],
      pairs: [{ id: "pair_1", display_name: "User One & Partner A", partner_b_id: "partner_1" }],
      songs: [],
      myCheckins: [
        makeMyCheckin({ entityPairId: "pair_1", queueEntryId: "qe1", divisionName: "Classic" }),
        makeMyCheckin({ entityPairId: "pair_team", queueEntryId: "qe_team", divisionName: "Teams" }),
      ],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByText(/#1 in queue/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/Classic/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Teams/i).length).toBeGreaterThan(0);
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

describe("SessionDetailPage — check-in song selector", () => {
  it("shows only songs submitted to the session event", async () => {
    signedIn = true;
    stubGets({
      session: openCheckinWindowSession(),
      songs: sampleSongs,
      eventSubmissions: [makeSubmission("song1"), makeSubmission("song2")],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^check in$/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /^check in$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByRole("radiogroup", { name: /^song$/i })).toBeInTheDocument();
    });

    const songGroup = screen.getByRole("radiogroup", { name: /^song$/i });
    const labels = within(songGroup)
      .getAllByRole("radio")
      .map((radio) => radio.textContent);

    expect(labels).toContain("Classic - Song One");
    expect(labels).toContain("Classic - Song Two");
    expect(labels).not.toContain("Classic - Song Three");
  });

  it("falls back to all songs when event submissions cannot be loaded", async () => {
    signedIn = true;
    stubGets({
      session: openCheckinWindowSession(),
      songs: sampleSongs,
      eventSubmissions: "reject",
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^check in$/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /^check in$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByRole("radiogroup", { name: /^song$/i })).toBeInTheDocument();
    });

    const songGroup = screen.getByRole("radiogroup", { name: /^song$/i });
    const labels = within(songGroup)
      .getAllByRole("radio")
      .map((radio) => radio.textContent);

    expect(labels).toContain("Classic - Song One");
    expect(labels).toContain("Classic - Song Two");
    expect(labels).toContain("Classic - Song Three");
  });

  it("shows an add-to-event message when no songs are submitted", async () => {
    signedIn = true;
    stubGets({
      session: openCheckinWindowSession(),
      songs: sampleSongs,
      eventSubmissions: [],
    });
    renderAt();

    await waitFor(() => {
      expect(
        screen.getAllByText(/you haven't added any songs to this event yet/i).length
      ).toBeGreaterThan(0);
    });

    const submitLinks = screen.getAllByRole("link", { name: /submit songs to this event/i });
    expect(submitLinks.length).toBeGreaterThan(0);
    for (const link of submitLinks) {
      expect(link).toHaveAttribute("href", "/event-submissions/event-1");
    }
    expect(screen.queryByRole("radiogroup", { name: /^song$/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^check in$/i })[0]).toBeDisabled();
  });

  it("sends entityManagedPartnershipId when checking in with a managed-partnership song", async () => {
    signedIn = true;
    apiPost.mockResolvedValue({});
    stubGets({
      session: openCheckinWindowSession(),
      songs: [
        {
          id: "song_mp",
          routine_name: "Managed Routine",
          division: "Classic",
          partner_id: null,
          managed_partnership_id: "mp_1",
        },
      ],
      eventSubmissions: [makeSubmission("song_mp")],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^check in$/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /^check in$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByRole("radiogroup", { name: /^song$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("radio", { name: /Managed Routine/i }));
    const submitButton = screen
      .getAllByRole("button", { name: /^check in$/i })
      .find((button) => button.getAttribute("type") === "submit");
    expect(submitButton).toBeTruthy();
    fireEvent.click(submitButton!);

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/checkins", {
        sessionId: "s1",
        divisionName: "Classic",
        entityPairId: null,
        entityManagedPartnershipId: "mp_1",
        songId: "song_mp",
        notes: undefined,
      });
    });
    expect(apiPost).not.toHaveBeenCalledWith("/v1/pairs/find-or-create", expect.anything());
  });

  it("sends entityPairId when checking in with a partner song", async () => {
    signedIn = true;
    apiPost.mockResolvedValue({});
    stubGets({
      session: openCheckinWindowSession(),
      songs: [
        {
          id: "song_pair",
          routine_name: "Partner Routine",
          division: "Classic",
          partner_id: "partner_1",
          managed_partnership_id: null,
        },
      ],
      pairs: [{ id: "pair_1", display_name: "User One & Partner A", partner_b_id: "partner_1" }],
      eventSubmissions: [makeSubmission("song_pair")],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^check in$/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /^check in$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByRole("radiogroup", { name: /^song$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("radio", { name: /Partner Routine/i }));
    const submitButton = screen
      .getAllByRole("button", { name: /^check in$/i })
      .find((button) => button.getAttribute("type") === "submit");
    expect(submitButton).toBeTruthy();
    fireEvent.click(submitButton!);

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/checkins", {
        sessionId: "s1",
        divisionName: "Classic",
        entityPairId: "pair_1",
        entityManagedPartnershipId: null,
        songId: "song_pair",
        notes: undefined,
      });
    });
    expect(apiPost).not.toHaveBeenCalledWith("/v1/pairs/find-or-create", expect.anything());
  });

  it("warns and disables submit when a placeholder entity is already queued", async () => {
    signedIn = true;
    stubGets({
      session: openCheckinWindowSession(),
      active: [],
      waiting: [
        {
          queueEntryId: "qe_team",
          checkinId: "c_team",
          position: 1,
          enteredQueueAt: 1,
          entityPairId: "pair_team",
          entitySoloUserId: null,
          entityLabel: "User One · Team Alpha",
          divisionName: "Teams",
          songId: "song_team",
          notes: null,
          initialQueue: "non_priority",
          checkedInAt: 1,
          subQueue: "non_priority",
        },
      ],
      pairs: [],
      songs: [
        {
          id: "song_team",
          routine_name: "Team Routine",
          division: "Teams",
          partner_id: "partner_team",
          managed_partnership_id: null,
        },
      ],
      myCheckins: [makeMyCheckin({ entityPairId: "pair_team", queueEntryId: "qe_team", divisionName: "Teams" })],
      eventSubmissions: [makeSubmission("song_team")],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^check in$/i }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /^check in$/i })[0]!);

    await waitFor(() => {
      expect(screen.getByRole("radiogroup", { name: /^song$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("radio", { name: /Team Routine/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/already in the queue/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/withdraw your current entry first/i)).toBeInTheDocument();
    expect(screen.queryByText(/checked in by your partner/i)).not.toBeInTheDocument();

    const submitButton = screen
      .getAllByRole("button", { name: /^check in$/i })
      .find((button) => button.getAttribute("type") === "submit");
    expect(submitButton).toBeDisabled();
  });

  it("says the partner checked the couple in when the caller cannot withdraw the entry", async () => {
    signedIn = true;
    stubGets({
      session: openCheckinWindowSession(),
      active: [],
      waiting: [
        {
          queueEntryId: "qe_couple",
          checkinId: "c_couple",
          position: 1,
          enteredQueueAt: 1,
          entityPairId: "pair_couple",
          entitySoloUserId: null,
          entityLabel: "Ann & Bo",
          divisionName: "Classic",
          songId: "song_shared",
          notes: null,
          initialQueue: "priority",
          checkedInAt: 1,
          subQueue: "priority",
        },
      ],
      pairs: [],
      songs: [
        {
          id: "song_shared",
          user_id: "user_partner",
          routine_name: "Shared Routine",
          division: "Classic",
          partner_id: "partner_of_owner",
          managed_partnership_id: null,
          shared_with_me: true,
        },
      ],
      myCheckins: [
        makeMyCheckin({ entityPairId: "pair_couple", queueEntryId: "qe_couple", canWithdraw: false }),
      ],
      eventSubmissions: [makeSubmission("song_shared")],
    });
    renderAt();

    await waitFor(() => {
      expect(screen.getAllByText(/#1 in queue/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/checked in by your partner/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /withdraw/i })).not.toBeInTheDocument();

    await openFormAndPick(/Shared Routine/i);

    await waitFor(() => {
      expect(
        screen.getByText(/your partner already checked this partnership in/i)
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/withdraw your current entry/i)).not.toBeInTheDocument();
    const submitButton = screen
      .getAllByRole("button", { name: /^check in$/i })
      .find((button) => button.getAttribute("type") === "submit");
    expect(submitButton).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Submitting a check-in
// ---------------------------------------------------------------------------

const partnerSong = {
  id: "song_pair",
  routine_name: "Partner Routine",
  division: "Classic",
  partner_id: "partner_1",
  managed_partnership_id: null,
};

/** Open the check-in form and pick a song by its label. */
async function openFormAndPick(song: RegExp) {
  await waitFor(() => {
    expect(screen.getAllByRole("button", { name: /^check in$/i }).length).toBeGreaterThan(0);
  });
  fireEvent.click(screen.getAllByRole("button", { name: /^check in$/i })[0]!);
  await waitFor(() => {
    expect(screen.getByRole("radiogroup", { name: /^song$/i })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole("radio", { name: song }));
}

function submitForm() {
  const submit = screen
    .getAllByRole("button", { name: /^check in$/i })
    .find((b) => b.getAttribute("type") === "submit");
  fireEvent.click(submit!);
}

describe("SessionDetailPage — the check-in confirmation", () => {
  it("names the partnership as the API ordered it, leader first", async () => {
    signedIn = true;
    stubGets({
      session: openCheckinWindowSession(),
      songs: [{ ...partnerSong, partnership_label: "Fabio Zanardelli & Amelie Gruber" }],
      pairs: [],
      eventSubmissions: [makeSubmission("song_pair")],
    });
    renderAt();

    await openFormAndPick(/Partner Routine/i);

    const line = (await screen.findByText("Partner", { selector: "span" })).parentElement!;
    expect(line).toHaveTextContent("Fabio Zanardelli & Amelie Gruber");
  });

  it("shows a dash when the API sent no partnership label", async () => {
    signedIn = true;
    stubGets({
      session: openCheckinWindowSession(),
      songs: [partnerSong],
      pairs: [],
      eventSubmissions: [makeSubmission("song_pair")],
    });
    renderAt();

    await openFormAndPick(/Partner Routine/i);

    const line = (await screen.findByText("Partner", { selector: "span" })).parentElement!;
    expect(line).toHaveTextContent("—");
  });

  it("says Solo for a song with no partner or managed partnership", async () => {
    signedIn = true;
    stubGets({
      session: openCheckinWindowSession(),
      songs: [
        {
          id: "song_solo",
          routine_name: "Solo Routine",
          division: "Classic",
          partner_id: null,
          managed_partnership_id: null,
        },
      ],
      pairs: [],
      eventSubmissions: [makeSubmission("song_solo")],
    });
    renderAt();

    await openFormAndPick(/Solo Routine/i);

    const line = (await screen.findByText("Partner", { selector: "span" })).parentElement!;
    expect(line).toHaveTextContent("Solo");
  });
});

describe("SessionDetailPage — submitting a check-in", () => {
  it("creates the pair first when the song's partner has none yet, and sends trimmed notes", async () => {
    signedIn = true;
    apiPost.mockReset();
    apiPost.mockImplementation((path: string) =>
      Promise.resolve(path === "/v1/pairs/find-or-create" ? { id: "pair_new" } : {})
    );
    stubGets({
      session: openCheckinWindowSession(),
      songs: [partnerSong],
      pairs: [],
      eventSubmissions: [makeSubmission("song_pair")],
    });
    renderAt();

    await openFormAndPick(/Partner Routine/i);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  late arrival  " } });
    submitForm();

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/checkins", {
        sessionId: "s1",
        divisionName: "Classic",
        entityPairId: "pair_new",
        entityManagedPartnershipId: null,
        songId: "song_pair",
        notes: "late arrival",
      });
    });
    expect(apiPost).toHaveBeenCalledWith("/v1/pairs/find-or-create", { partner_id: "partner_1" });
  });

  it.each([
    ["Entity already has a live check-in in this session", "You're already in the queue for this session."],
    ["Check-in window closed", "Check-in window closed"],
  ])("reports a refused check-in (%s)", async (apiMessage, shown) => {
    signedIn = true;
    apiPost.mockReset();
    apiPost.mockRejectedValue(new Error(apiMessage));
    vi.mocked(toast.error).mockClear();
    stubGets({
      session: openCheckinWindowSession(),
      songs: [partnerSong],
      pairs: [{ id: "pair_1", display_name: "User One & Partner A", partner_b_id: "partner_1" }],
      eventSubmissions: [makeSubmission("song_pair")],
    });
    renderAt();

    await openFormAndPick(/Partner Routine/i);
    submitForm();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(shown);
    });
    // The form stays open so the dancer can try again.
    expect(screen.getByRole("radiogroup", { name: /^song$/i })).toBeInTheDocument();
  });

  it("leaves the division for the dancer to pick when the song's is not run in this session", async () => {
    signedIn = true;
    apiPost.mockReset();
    vi.mocked(toast.error).mockClear();
    stubGets({
      session: openCheckinWindowSession(),
      songs: [{ ...partnerSong, division: "Showcase" }],
      pairs: [{ id: "pair_1", display_name: "User One & Partner A", partner_b_id: "partner_1" }],
      eventSubmissions: [makeSubmission("song_pair")],
    });
    renderAt();

    await openFormAndPick(/Partner Routine/i);
    const division = screen.getByRole("radiogroup", { name: /^division$/i });
    expect(within(division).getByRole("radio", { name: "Classic" })).toHaveAttribute("aria-checked", "false");
    submitForm();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Pick a division");
    });
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe("SessionDetailPage — loading", () => {
  it("reports a failure to load and says the session was not found", async () => {
    signedIn = true;
    vi.mocked(toast.error).mockClear();
    apiGet.mockImplementation(() => Promise.reject(new Error("Session not found")));
    renderAt();

    expect(await screen.findByText("Session not found.")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Session not found");
  });
});

// ---------------------------------------------------------------------------
// A song shared by a linked partner
// ---------------------------------------------------------------------------

// Owned by the partner and listed because the caller is its linked partner.
// The API lets the caller check it in for themselves when the song has a
// submission to the session's event; the entity is the owner's pair with
// their partner row, which POST /v1/pairs/find-or-create returns for a row
// linked to the caller. The picker offers songs among the submissions listed
// by GET /v1/event-song-submissions: the caller's and their partner's.
const sharedSong = {
  id: "song_shared",
  user_id: "user_owner",
  routine_name: "Shared Routine",
  division: "Classic",
  partner_id: "owner_partner_row",
  managed_partnership_id: null,
  shared_with_me: true,
};

describe("SessionDetailPage — a song shared by a linked partner", () => {
  it("offers a shared song the caller submitted and checks it in as the owner's pair", async () => {
    signedIn = true;
    apiPost.mockReset();
    apiPost.mockImplementation((path: string) =>
      Promise.resolve(path === "/v1/pairs/find-or-create" ? { id: "pair_owner" } : {})
    );
    stubGets({
      session: openCheckinWindowSession(),
      songs: [sharedSong],
      pairs: [],
      eventSubmissions: [makeSubmission("song_shared")],
    });
    renderAt();

    await openFormAndPick(/Shared Routine/i);
    submitForm();

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/checkins", {
        sessionId: "s1",
        divisionName: "Classic",
        entityPairId: "pair_owner",
        entityManagedPartnershipId: null,
        songId: "song_shared",
        notes: undefined,
      });
    });
    expect(apiPost).toHaveBeenCalledWith("/v1/pairs/find-or-create", {
      partner_id: "owner_partner_row",
    });
  });

  it("offers a shared song only the partner submitted", async () => {
    signedIn = true;
    stubGets({
      session: openCheckinWindowSession(),
      songs: [sharedSong],
      pairs: [],
      eventSubmissions: [{ ...makeSubmission("song_shared"), can_withdraw: false }],
    });
    renderAt();

    await openFormAndPick(/Shared Routine/i);
    expect(screen.getByRole("radio", { name: /Shared Routine/i })).toBeChecked();
  });

  it("does not offer a shared song that is not among the caller's submissions to the event", async () => {
    signedIn = true;
    stubGets({
      session: openCheckinWindowSession(),
      songs: [sharedSong],
      pairs: [],
      eventSubmissions: [],
    });
    renderAt();

    expect(
      (await screen.findAllByText(/haven't added any songs to this event yet/i)).length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("radio", { name: /Shared Routine/i })).not.toBeInTheDocument();
  });
});

describe("SessionDetailPage — clock and polling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function soonSession(opensInMs: number) {
    const nowMs = Date.now();
    return makeSession({
      eventName: "GNDC",
      checkinOpensAt: new Date(nowMs + opensInMs).toISOString(),
      floorTrialStartsAt: new Date(nowMs + opensInMs + 3_600_000).toISOString(),
      floorTrialEndsAt: new Date(nowMs + opensInMs + 4 * 3_600_000).toISOString(),
      divisions: [{ division_name: "Classic", is_priority: true }],
    });
  }

  it("enables Check in as the window opens, without waiting for the next poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signedIn = true;
    stubGets({
      session: soonSession(30_000),
      songs: [{ id: "song1", routine_name: "Song One", division: "Classic", partner_id: null }],
      eventSubmissions: [makeSubmission("song1")],
    });
    renderAt();

    const [button] = await screen.findAllByRole("button", { name: "Check in" });
    expect(button).toBeDisabled();
    expect(screen.getAllByText(/^Check-in opens /).length).toBeGreaterThan(0);
    const gets = apiGet.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Check in" })[0]).toBeEnabled());
    // The clock ticked on its own; nothing was fetched for it.
    expect(apiGet.mock.calls.length).toBe(gets);
  });

  it("says when a background refresh fails, without blocking the page, and retries", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signedIn = true;
    vi.mocked(toast.error).mockClear();
    const session = openCheckinWindowSession();
    stubGets({
      session,
      songs: [{ id: "song1", routine_name: "Song One", division: "Classic", partner_id: null }],
      eventSubmissions: [makeSubmission("song1")],
    });
    renderAt();
    expect(await screen.findByText("No one on deck.")).toBeInTheDocument();

    const ok = apiGet.getMockImplementation()!;
    apiGet.mockImplementation((path: string) =>
      path.includes("/waiting") ? Promise.reject(new Error("offline")) : ok(path)
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/couldn't refresh the queue/i);
    expect(toast.error).not.toHaveBeenCalled();
    // The page stays usable: the queues and the check-in action are still there.
    expect(screen.getByText("No one on deck.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Check in" })[0]).toBeEnabled();

    apiGet.mockImplementation(ok);
    fireEvent.click(within(notice).getByRole("button", { name: "Retry now" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});
