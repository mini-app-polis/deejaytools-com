// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiDel = vi.fn();
const apiClient = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  del: apiDel,
  postForm: vi.fn(),
};

vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({
    me: { id: "admin_1", email: "admin@example.com", role: "admin" },
    loading: false,
    isAdmin: true,
    isManager: false,
  }),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: () => Promise.resolve("fake-token") }),
}));

import ManagerPage from "./ManagerPage";
import { fx } from "@/test/fixtures";
import { toast } from "sonner";

function renderPage(path: string = "/manager/active-sessions") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/manager/:section" element={<ManagerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ManagerPage — Event Songs section", () => {
  const EVENT = fx.event({
    id: "ev1",
    name: "Spring Classic",
    start_date: "2026-04-01",
    end_date: "2026-04-03",
    timezone: "America/Los_Angeles",
    status: "upcoming",
    created_by: "u1",
    created_at: 1,
    updated_at: 1,
  });

  function mockManagerGets(opts?: {
    events?: unknown[];
    submissions?: unknown[] | (() => Promise<unknown>);
  }) {
    const events = opts?.events ?? [EVENT];
    const submissions = opts?.submissions ?? [];
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") return Promise.resolve(events);
      if (path.startsWith("/v1/admin/event-song-submissions")) {
        return typeof submissions === "function"
          ? submissions()
          : Promise.resolve(submissions);
      }
      return Promise.resolve([]);
    });
  }

  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiPatch.mockReset();
    apiDel.mockReset();
  });

  it("renders the event picker on /manager/event-songs", async () => {
    mockManagerGets();
    renderPage("/manager/event-songs");

    await waitFor(() => {
      expect(screen.getByText(/spring classic/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/select an event to view submitted songs/i)).toBeInTheDocument();
  });

  it("loads submissions when an event is selected and groups by division", async () => {
    mockManagerGets({
      submissions: [
        {
          id: "sub1",
          event_id: "ev1",
          event_name: "Spring Classic",
          division: "Classic",
          song_id: "s1",
          song_label: "Sky High",
          partnership_label: "Alice & Bob",
          submitter_email: "alice@example.com",
          created_at: 1,
        },
        {
          id: "sub2",
          event_id: "ev1",
          event_name: "Spring Classic",
          division: "Strictly",
          song_id: "s2",
          song_label: "Midnight",
          partnership_label: "Carol & Dan",
          submitter_email: "carol@example.com",
          created_at: 2,
        },
        {
          id: "sub3",
          event_id: "ev1",
          event_name: "Spring Classic",
          division: null,
          song_id: "s3",
          song_label: "Untitled",
          partnership_label: "Eve Solo",
          submitter_email: "eve@example.com",
          created_at: 3,
        },
      ],
    });

    const user = userEvent.setup();
    renderPage("/manager/event-songs");

    await waitFor(() => {
      expect(screen.getByText(/spring classic/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /spring classic/i }));

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/admin\/event-song-submissions\?event_id=ev1/)
      );
    });

    expect(await screen.findByRole("button", { name: /classic\s+1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /strictly\s+1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unspecified\s+1/i })).toBeInTheDocument();
    expect(screen.getByText(/alice & bob/i)).toBeInTheDocument();
    expect(screen.getByText(/sky high/i)).toBeInTheDocument();
    expect(screen.getByText(/carol & dan/i)).toBeInTheDocument();
    expect(screen.getByText(/eve solo/i)).toBeInTheDocument();
  });

  it("still renders the section when admin submissions reject", async () => {
    mockManagerGets({
      submissions: () => Promise.reject(new Error("not found")),
    });

    const user = userEvent.setup();
    renderPage("/manager/event-songs");

    await waitFor(() => {
      expect(screen.getByText(/spring classic/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /spring classic/i }));

    expect(
      await screen.findByText(/no songs submitted to this event yet/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^manager$/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Shared helpers for the remaining sections
// ---------------------------------------------------------------------------

type GetRoutes = Record<string, unknown | ((path: string) => unknown)>;

/** Route GETs by path (query string ignored); unknown paths return []. */
function routeGets(routes: GetRoutes) {
  apiGet.mockImplementation((path: string) => {
    const base = path.split("?")[0];
    if (base in routes) {
      const r = routes[base];
      if (typeof r === "function") {
        try {
          return Promise.resolve((r as (p: string) => unknown)(path));
        } catch (e) {
          return Promise.reject(e);
        }
      }
      return Promise.resolve(r);
    }
    return Promise.resolve([]);
  });
}

function resetAll() {
  apiGet.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
  apiDel.mockReset();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
}

function queueCalls(kind: "active" | "priority" | "non-priority") {
  return apiGet.mock.calls.filter(([p]) => (p as string).endsWith(`/${kind}`)).length;
}

// ---------------------------------------------------------------------------
// Active Sessions (live queue)
// ---------------------------------------------------------------------------

describe("ManagerPage — Active Sessions", () => {
  /** Noon UTC is the same calendar day in every US timezone the tests might run in. */
  const NOW = Date.UTC(2026, 4, 23, 17, 0);
  const TZ = "America/Chicago";
  const LIVE = fx.session({
    id: "live",
    event_id: "e1",
    status: "checkin_open",
    event_timezone: TZ,
    checkin_opens_at: NOW - 30 * 60_000,
    floor_trial_starts_at: NOW,
    floor_trial_ends_at: NOW + 120 * 60_000,
  });
  const LIVE_TITLE = "Saturday - 12:00 PM - May 23, 2026";

  beforeEach(() => {
    resetAll();
    // Fake only the polling clock; React Testing Library's waitFor keeps real timeouts.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("explains when nothing is scheduled for today", async () => {
    routeGets({
      "/v1/sessions": [fx.session({ id: "old", floor_trial_starts_at: NOW - 3 * 86_400_000 })],
    });
    renderPage();
    expect(
      await screen.findByText(/no floor-trial sessions scheduled for today/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open guide/i })).toHaveAttribute("href", "/manager/guide");
  });

  it("lists today's sessions live-first and waits for a choice when more than one is live", async () => {
    const live2 = fx.session({ id: "live2", status: "in_progress", event_timezone: TZ, floor_trial_starts_at: NOW + 60 * 60_000 });
    const done = fx.session({ id: "done", status: "completed", event_timezone: TZ, floor_trial_starts_at: NOW - 60 * 60_000 });
    routeGets({ "/v1/sessions": [done, live2, LIVE] });
    renderPage();

    const group = await screen.findByRole("radiogroup", { name: "Session" });
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      LIVE_TITLE,
      "Saturday - 1:00 PM - May 23, 2026",
      "Saturday - 11:00 AM - May 23, 2026 (completed)",
    ]);
    expect(screen.getByText(/choose a session above/i)).toBeInTheDocument();
    expect(queueCalls("active")).toBe(0);
  });

  it("auto-selects the only live session and renders all three queues", async () => {
    routeGets({
      "/v1/sessions": [LIVE],
      "/v1/partners/leading-pairs": [fx.leadingPair({ id: "pair-9", display_name: "Pair From Map" })],
      "/v1/songs": [fx.song({ id: "song-9", processed_filename: "pair_classic_2026.mp3" })],
      "/v1/queue/live/active": [
        fx.queueEntry({ queueEntryId: "a2", position: 2, entityLabel: "Second Pair", songDisplayName: "Song Two" }),
        fx.queueEntry({
          queueEntryId: "a1",
          position: 1,
          entityLabel: "—",
          entityPairId: "pair-9",
          songId: "song-9",
          songProcessedFilename: "Pair_Classic.mp3",
          notes: "Starts on the 5",
        }),
      ],
      "/v1/queue/live/priority": [fx.queueEntry({ queueEntryId: "p1", entityLabel: "Prio Pair", songId: null })],
      "/v1/queue/live/non-priority": [],
    });
    renderPage();

    expect(await screen.findByText("Pair From Map")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: LIVE_TITLE })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("2 slots")).toBeInTheDocument();
    // Song label falls back to the song catalog when the entry has no display name.
    expect(screen.getByText("Classic · pair_classic_2026.mp3")).toBeInTheDocument();
    expect(screen.getByText("Pair_Classic.mp3")).toBeInTheDocument();
    expect(screen.getByText("Note: Starts on the 5")).toBeInTheDocument();
    expect(screen.getByText("Classic · Song Two")).toBeInTheDocument();
    expect(screen.getByText("Classic · —")).toBeInTheDocument();
    expect(screen.getByText("1 waiting")).toBeInTheDocument();
    expect(screen.getByText("Standard queue is empty.")).toBeInTheDocument();

    // "Move down" is offered on every active slot except the last.
    const slotOne = screen.getByText("Pair From Map").parentElement!;
    const slotTwo = screen.getByText("Second Pair").parentElement!;
    expect(within(slotOne).getByRole("button", { name: "Move down" })).toBeInTheDocument();
    expect(within(slotTwo).queryByRole("button", { name: "Move down" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /updated just now/i })).toBeInTheDocument();
  });

  it("shows empty queues", async () => {
    routeGets({ "/v1/sessions": [LIVE] });
    renderPage();
    expect(await screen.findByText("No one on deck.")).toBeInTheDocument();
    expect(screen.getByText("Priority queue is empty.")).toBeInTheDocument();
    expect(screen.getByText("0 slots")).toBeInTheDocument();
  });

  it.each([
    ["Run complete", "/v1/queue/complete", { completed: true }],
    ["Run incomplete", "/v1/queue/incomplete", { rotated: true }],
    ["Withdraw", "/v1/queue/withdraw", { withdrawn: true }],
  ])("'%s' posts the entry to %s and reloads the queues", async (label, path, ack) => {
    routeGets({
      "/v1/sessions": [LIVE],
      "/v1/queue/live/active": [fx.queueEntry({ queueEntryId: "a1", position: 1 })],
    });
    apiPost.mockResolvedValue(ack);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Leader & Follower");
    const before = queueCalls("active");
    await user.click(screen.getByRole("button", { name: label }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith(path, { queueEntryId: "a1" }));
    await waitFor(() => expect(queueCalls("active")).toBe(before + 1));
  });

  it("moves a waiting entry down", async () => {
    routeGets({
      "/v1/sessions": [LIVE],
      "/v1/queue/live/non-priority": [
        fx.queueEntry({ queueEntryId: "n1", position: 1, entityLabel: "First" }),
        fx.queueEntry({ queueEntryId: "n2", position: 2, entityLabel: "Second" }),
      ],
    });
    apiPost.mockResolvedValue({ moved: true });
    const user = userEvent.setup();
    renderPage();

    const first = (await screen.findByText("First")).parentElement!;
    await user.click(within(first).getByRole("button", { name: "Move down" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/queue/move-down", { queueEntryId: "n1" })
    );
  });

  it("shows the API error when a queue action fails", async () => {
    routeGets({
      "/v1/sessions": [LIVE],
      "/v1/queue/live/priority": [fx.queueEntry({ queueEntryId: "p1", position: 1 })],
    });
    apiPost.mockRejectedValue(new Error("Entry already withdrawn"));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Leader & Follower");
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Entry already withdrawn"));
  });

  it("polls quietly every 8 seconds, ages the 'Updated' label, and offers a retry after a failed poll", async () => {
    let failQueues = false;
    const active = () => {
      if (failQueues) throw new Error("offline");
      return [];
    };
    routeGets({ "/v1/sessions": [LIVE], "/v1/queue/live/active": active });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: "Updated just now" })).toBeInTheDocument();
    const initial = queueCalls("active");

    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(screen.getByRole("button", { name: "Updated 6s ago" })).toBeInTheDocument();
    expect(queueCalls("active")).toBe(initial);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    await waitFor(() => expect(queueCalls("active")).toBe(initial + 1));
    expect(await screen.findByRole("button", { name: "Updated just now" })).toBeInTheDocument();

    // A failed background poll is silent but changes the label to a retry.
    failQueues = true;
    await act(async () => {
      vi.advanceTimersByTime(8_000);
    });
    expect(
      await screen.findByRole("button", { name: /couldn't refresh — tap to retry/i })
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();

    // A manual retry is loud.
    await user.click(screen.getByRole("button", { name: /tap to retry/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("offline"));

    failQueues = false;
    await user.click(screen.getByRole("button", { name: /tap to retry/i }));
    expect(await screen.findByRole("button", { name: "Updated just now" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Event Songs — filters and collapsing
// ---------------------------------------------------------------------------

describe("ManagerPage — Event Songs filters", () => {
  beforeEach(resetAll);

  const CURRENT = fx.event({ id: "cur", name: "Current Fest", status: "active", start_date: "2026-05-01" });
  const PAST = fx.event({ id: "past", name: "Past Fest", status: "completed", start_date: "2025-05-01" });

  it("hides past events until asked, and drops a past selection when they are hidden again", async () => {
    routeGets({ "/v1/events": [CURRENT, PAST] });
    const user = userEvent.setup();
    renderPage("/manager/event-songs");

    await screen.findByRole("button", { name: /current fest/i });
    expect(screen.queryByRole("button", { name: /past fest/i })).not.toBeInTheDocument();

    const toggle = screen.getByRole("checkbox", { name: /show past events/i });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: /past fest/i }));
    expect(await screen.findByText("No songs submitted to this event yet.")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText(/select an event to view submitted songs/i)).toBeInTheDocument();
  });

  it("shows a message when there are no events", async () => {
    routeGets({ "/v1/events": [PAST] });
    renderPage("/manager/event-songs");
    expect(await screen.findByText("No events to show.")).toBeInTheDocument();
  });

  it("collapses a division and deselects the event on a second click", async () => {
    routeGets({
      "/v1/events": [CURRENT],
      "/v1/admin/event-song-submissions": [
        fx.adminEventSongSubmission({ id: "x", event_id: "cur", division: "Classic", partnership_label: "Ann & Bo" }),
      ],
    });
    const user = userEvent.setup();
    renderPage("/manager/event-songs");

    await user.click(await screen.findByRole("button", { name: /current fest/i }));
    const header = await screen.findByRole("button", { name: /classic\s+1/i });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Ann & Bo")).toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Ann & Bo")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /current fest/i }));
    expect(screen.getByText(/select an event to view submitted songs/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Upload For
// ---------------------------------------------------------------------------

describe("ManagerPage — Upload For", () => {
  beforeEach(resetAll);

  const ALICE = fx.adminUser({ id: "u-alice", email: "alice@example.com", first_name: "Alice", last_name: "Smith" });
  const NONAME = fx.adminUser({ id: "u-x", email: "x@example.com" });

  it("prompts for a search, then shows matches", async () => {
    routeGets({ "/v1/admin/users": [ALICE, NONAME] });
    const user = userEvent.setup();
    renderPage("/manager/upload-for");

    expect(await screen.findByText("Type a name or email to search.")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/search by name or email/i), "ali");

    expect(await screen.findByRole("button", { name: /alice smith/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\(no name\)/i })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/v1/admin/users?q=ali");
  });

  it("says when nothing matches and reports a failed search", async () => {
    let fail = false;
    routeGets({
      "/v1/admin/users": () => {
        if (fail) throw new Error("search down");
        return [];
      },
    });
    const user = userEvent.setup();
    renderPage("/manager/upload-for");

    const box = await screen.findByPlaceholderText(/search by name or email/i);
    await user.type(box, "zz");
    expect(await screen.findByText("No matches.")).toBeInTheDocument();

    fail = true;
    await user.type(box, "z");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("search down"));
  });

  it("opens the upload form on behalf of the chosen user, and can switch back", async () => {
    routeGets({ "/v1/admin/users": [ALICE] });
    const user = userEvent.setup();
    renderPage("/manager/upload-for");

    await user.type(await screen.findByPlaceholderText(/search by name or email/i), "alice");
    await user.click(await screen.findByRole("button", { name: /alice smith/i }));

    expect(screen.getByText("Upload For: Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith (alice@example.com)")).toBeInTheDocument();
    // The form loads the user's partners, not the manager's own.
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/admin/users/u-alice/partners"));

    await user.click(screen.getByRole("button", { name: "Change user" }));
    expect(screen.getByPlaceholderText(/search by name or email/i)).toHaveValue("");
    expect(screen.getByText("Type a name or email to search.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CheckIn For
// ---------------------------------------------------------------------------

describe("ManagerPage — CheckIn For", () => {
  beforeEach(resetAll);

  const ALICE = fx.adminUser({ id: "u-alice", email: "alice@example.com", first_name: "Alice", last_name: "Smith" });
  const START = Date.UTC(2026, 4, 23, 17, 0);
  const OPEN = fx.session({
    id: "open",
    event_id: "e1",
    status: "checkin_open",
    event_timezone: "America/Chicago",
    floor_trial_starts_at: START,
    divisions: [
      { id: "d1", division_name: "Classic", is_priority: true, sort_order: 0, priority_run_limit: 1 },
      { id: "d2", division_name: "Showcase", is_priority: false, sort_order: 1, priority_run_limit: null },
    ],
  });
  const OPEN_TITLE = "Saturday - 12:00 PM - May 23, 2026";
  const NO_EVENT = fx.session({
    id: "noev",
    event_id: null,
    status: "in_progress",
    event_timezone: "America/Chicago",
    floor_trial_starts_at: START + 3_600_000,
  });
  const SCHEDULED = fx.session({ id: "later", status: "scheduled", event_timezone: "America/Chicago" });
  const SUB_CLASSIC = fx.eventSongSubmission({ id: "sub1", song_id: "song-c", song_label: "Our Classic", division: "Classic" });
  const SUB_OTHER = fx.eventSongSubmission({ id: "sub2", song_id: "song-x", song_label: "Our Cabaret", division: "Cabaret" });

  async function pickAlice(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByPlaceholderText(/search by name or email/i), "alice");
    await user.click(await screen.findByRole("button", { name: /alice smith/i }));
  }

  it("checks a user in to a live session with their submitted song and its division", async () => {
    routeGets({
      "/v1/sessions": [OPEN, NO_EVENT, SCHEDULED],
      "/v1/admin/users": [ALICE],
      "/v1/admin/users/u-alice/event-song-submissions": [SUB_CLASSIC, SUB_OTHER],
    });
    apiPost.mockResolvedValue(fx.checkinCreated());
    const user = userEvent.setup();
    renderPage("/manager/checkin-for");

    await pickAlice(user);
    expect(screen.getByText("CheckIn For: Alice Smith")).toBeInTheDocument();
    const sessions = screen.getByRole("radiogroup", { name: "Session" });
    // Only sessions that are open or in progress are offered.
    expect(within(sessions).getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();

    await user.click(within(sessions).getByRole("radio", { name: OPEN_TITLE }));
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(
        "/v1/admin/users/u-alice/event-song-submissions?event_id=e1"
      )
    );
    const division = screen.getByRole("radiogroup", { name: "Division" });

    // A song whose division the session doesn't run leaves the division unset.
    await user.click(await screen.findByRole("radio", { name: "Our Cabaret" }));
    expect(within(division).getByRole("radio", { name: "Classic" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();

    // A song in one of the session's divisions pre-selects it.
    await user.click(screen.getByRole("radio", { name: "Our Classic" }));
    expect(within(division).getByRole("radio", { name: "Classic" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/checkins", {
        sessionId: "open",
        songId: "song-c",
        divisionName: "Classic",
        on_behalf_of_user_id: "u-alice",
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Checked in Alice Smith");
    expect(screen.getByRole("radio", { name: "Our Classic" })).toHaveAttribute("aria-checked", "false");
  });

  it("explains when the session has no event or the user has no songs for it", async () => {
    routeGets({
      "/v1/sessions": [OPEN, NO_EVENT],
      "/v1/admin/users": [ALICE],
      "/v1/admin/users/u-alice/event-song-submissions": [],
    });
    const user = userEvent.setup();
    renderPage("/manager/checkin-for");

    await pickAlice(user);
    await user.click(screen.getByRole("radio", { name: "Saturday - 1:00 PM - May 23, 2026" }));
    expect(screen.getByText("This session has no event")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: OPEN_TITLE }));
    expect(
      await screen.findByText("No songs submitted to this event for this user")
    ).toBeInTheDocument();
  });

  it("shows the API error when the check-in is rejected", async () => {
    routeGets({
      "/v1/sessions": [OPEN],
      "/v1/admin/users": [ALICE],
      "/v1/admin/users/u-alice/event-song-submissions": [SUB_CLASSIC],
    });
    apiPost.mockRejectedValue(new Error("Already checked in"));
    const user = userEvent.setup();
    renderPage("/manager/checkin-for");

    await pickAlice(user);
    await user.click(screen.getByRole("radio", { name: OPEN_TITLE }));
    await user.click(await screen.findByRole("radio", { name: "Our Classic" }));
    await user.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Already checked in"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("returns to the search when changing user, and reports a failed search", async () => {
    let fail = false;
    routeGets({
      "/v1/sessions": [OPEN],
      "/v1/admin/users": () => {
        if (fail) throw new Error("search down");
        return [ALICE];
      },
    });
    const user = userEvent.setup();
    renderPage("/manager/checkin-for");

    await pickAlice(user);
    await user.click(screen.getByRole("button", { name: "Change user" }));
    const box = screen.getByPlaceholderText(/search by name or email/i);
    expect(box).toHaveValue("");

    fail = true;
    await user.type(box, "bob");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("search down"));
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

describe("ManagerPage — Guide", () => {
  beforeEach(resetAll);

  it("renders the operations guide with links into the admin and manager tools", async () => {
    routeGets({});
    renderPage("/manager/guide");

    expect(await screen.findAllByRole("heading", { level: 2 })).not.toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "Run History" })[0]).toHaveAttribute("href", "/admin/runs");
    expect(screen.getAllByRole("link", { name: "CheckIn For" })[0]).toHaveAttribute("href", "/manager/checkin-for");
    expect(screen.getAllByRole("link", { name: "Active Sessions" })[0]).toHaveAttribute(
      "href",
      "/manager/active-sessions"
    );
  });

  it("falls back to Active Sessions for an unknown slug", async () => {
    routeGets({});
    renderPage("/manager/nope");
    expect(await screen.findByRole("link", { name: /open guide/i })).toBeInTheDocument();
  });
});
