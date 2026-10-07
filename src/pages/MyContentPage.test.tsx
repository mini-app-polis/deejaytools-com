// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
const apiDel = vi.fn();
const apiClient = {
  get: apiGet,
  post: vi.fn(),
  patch: vi.fn(),
  del: apiDel,
  postForm: vi.fn(),
};
vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import MyContentPage from "./MyContentPage";
import { fx } from "@/test/fixtures";
import { toast } from "sonner";

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

const ACTIVE_SESSION = fx.session({
  id: "sess-active-1",
  event_id: "ev1",
  event_timezone: "America/Los_Angeles",
  date: "2026-04-01",
  floor_trial_starts_at: 1700000000000,
  floor_trial_ends_at: 1700007200000,
  checkin_opens_at: 1699998200000,
  status: "checkin_open" as const,
  active_priority_max: 6,
  active_non_priority_max: 4,
  created_at: 1,
  divisions: [],
});

function defaultApiGet(path: string) {
  if (path === "/v1/checkins/mine") return Promise.resolve([]);
  if (path === "/v1/songs") return Promise.resolve([]);
  if (path === "/v1/sessions") return Promise.resolve([]);
  if (path === "/v1/events") return Promise.resolve([EVENT]);
  if (path === "/v1/event-song-submissions") return Promise.resolve([]);
  return Promise.resolve([]);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyContentPage />
    </MemoryRouter>
  );
}

describe("MyContentPage — hash deep links", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockImplementation(defaultApiGet);
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls to the Songs section for /my-content#songs", async () => {
    render(
      <MemoryRouter initialEntries={["/my-content#songs"]}>
        <MyContentPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.getElementById("songs")).toBeTruthy();
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("does not scroll when there is no hash", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^songs$/i })).toBeInTheDocument();
    });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("MyContentPage — Events section", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("renders the Events section with upcoming events", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/event-song-submissions") {
        return Promise.resolve([
          fx.eventSongSubmission({
            id: "sub1",
            event_id: "ev1",
            event_name: "Spring Classic",
            event_start_date: "2026-04-01",
            event_status: "upcoming",
            song_id: "song1",
            song_label: "2026_Classic_MyRoutine.mp3",
            division: "Classic",
            created_at: 1,
          }),
        ]);
      }
      return defaultApiGet(path);
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /^events$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /submit songs/i })).toHaveAttribute(
      "href",
      "/event-submissions"
    );
    expect(await screen.findByText("Spring Classic")).toBeInTheDocument();
    expect(screen.getByText(/2026_Classic_MyRoutine\.mp3/)).toBeInTheDocument();
  });

  it("still renders Check-ins and Songs when event-song-submissions rejects", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/event-song-submissions") {
        return Promise.reject(new Error("not found"));
      }
      return defaultApiGet(path);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^songs$/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /^check-ins$/i })).toBeNull();
    expect(screen.getByRole("heading", { name: /^events$/i })).toBeInTheDocument();
    expect(
      await screen.findByText(/you haven't added songs to any events yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Spring Classic")).toBeNull();
  });

  it("hides events with no song submissions", async () => {
    apiGet.mockImplementation(defaultApiGet);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^events$/i })).toBeInTheDocument();
    });
    expect(
      screen.getByText(/you haven't added songs to any events yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Spring Classic")).toBeNull();
  });
});

describe("MyContentPage — Active Floor Trials section", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("shows Active Floor Trials with a Go To Session link when a session is active", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          ACTIVE_SESSION,
          {
            ...ACTIVE_SESSION,
            id: "sess-scheduled",
            status: "scheduled",
          },
        ]);
      }
      return defaultApiGet(path);
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: /^active floor trials$/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Spring Classic").length).toBeGreaterThan(0);
    expect(screen.getByText(/check-in open/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^go to session$/i })).toHaveAttribute(
      "href",
      "/sessions/sess-active-1"
    );
  });

  it("hides Active Floor Trials when no sessions are checkin_open or in_progress", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          fx.session({ ...ACTIVE_SESSION, id: "sess-done", status: "completed" }),
          { ...ACTIVE_SESSION, id: "sess-later", status: "scheduled" },
        ]);
      }
      return defaultApiGet(path);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^songs$/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /^check-ins$/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /^active floor trials$/i })).toBeNull();
  });
});

function withGets(overrides: Record<string, unknown | (() => Promise<unknown>)>) {
  apiGet.mockImplementation((path: string) => {
    if (path in overrides) {
      const v = overrides[path];
      return typeof v === "function" ? (v as () => Promise<unknown>)() : Promise.resolve(v);
    }
    return defaultApiGet(path);
  });
}

function resetMocks() {
  apiGet.mockReset();
  apiDel.mockReset();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
}

describe("MyContentPage — Check-ins section", () => {
  beforeEach(resetMocks);

  // 7:00 PM CDT, Saturday May 23 2026.
  const START = Date.UTC(2026, 4, 24, 0, 0);
  const CHECKIN = fx.myCheckin({
    id: "ci-1",
    eventName: "Spring Classic",
    sessionFloorTrialStartsAt: START,
    eventTimezone: "America/Chicago",
    divisionName: "Showcase",
    entityLabel: "Ann & Bo",
    songDisplayName: "Fever",
    songProcessedFilename: "Ann_Bo_Showcase_2026.mp3",
    notes: "Lift at the end",
    queueType: "priority",
    overallPosition: 3,
    runCount: 2,
  });

  it("describes each check-in: position, runs, queue, session, division, dancer and song", async () => {
    withGets({ "/v1/checkins/mine": [CHECKIN] });
    renderPage();

    expect(await screen.findByRole("heading", { name: /^check-ins$/i })).toBeInTheDocument();
    expect(screen.getByText("This entry is", { exact: false })).toHaveTextContent(
      "This entry is #3 in line"
    );
    expect(screen.getByText("2 runs this session")).toBeInTheDocument();
    expect(screen.getByText("Priority queue")).toBeInTheDocument();
    expect(screen.getByText("Saturday - 7:00 PM - May 23, 2026")).toBeInTheDocument();
    expect(screen.getByText("Showcase")).toBeInTheDocument();
    expect(screen.getByText("Ann & Bo")).toBeInTheDocument();
    expect(screen.getByText("Fever")).toBeInTheDocument();
    expect(screen.getByText("Ann_Bo_Showcase_2026.mp3")).toBeInTheDocument();
    expect(screen.getByText("Note: Lift at the end")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /learn more/i })).toHaveAttribute(
      "href",
      "/how-it-works/the-queue"
    );
  });

  it.each([
    ["active", 0, "Active queue", "No runs yet this session"],
    ["non_priority", 1, "Standard queue", "1 run this session"],
    ["something_else", 0, "In queue", "No runs yet this session"],
  ])("labels queue type %s and %i runs", async (queueType, runCount, badge, runs) => {
    withGets({ "/v1/checkins/mine": [{ ...CHECKIN, queueType, runCount }] });
    renderPage();
    expect(await screen.findByText(badge)).toBeInTheDocument();
    expect(screen.getByText(runs)).toBeInTheDocument();
  });

  it("withdraws a check-in after confirming and removes it from the page", async () => {
    withGets({ "/v1/checkins/mine": [CHECKIN] });
    apiDel.mockResolvedValue({ withdrawn: true });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /withdraw from queue/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("You will be removed from the Showcase queue");
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/checkins/ci-1"));
    expect(toast.success).toHaveBeenCalledWith("Withdrawn from queue.");
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /^check-ins$/i })).not.toBeInTheDocument()
    );
  });

  it("keeps the check-in when cancelled or when withdrawing fails", async () => {
    withGets({ "/v1/checkins/mine": [CHECKIN] });
    apiDel.mockRejectedValue(new Error("Already running"));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /withdraw from queue/i }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(apiDel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /withdraw from queue/i }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Already running"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Ann & Bo")).toBeInTheDocument();
  });

  it("reports a failure to load check-ins", async () => {
    withGets({ "/v1/checkins/mine": () => Promise.reject(new Error("checkins down")) });
    renderPage();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("checkins down"));
    expect(screen.queryByRole("heading", { name: /^check-ins$/i })).not.toBeInTheDocument();
  });
});

describe("MyContentPage — Songs section", () => {
  beforeEach(resetMocks);

  const UPLOADED = fx.song({
    id: "song-up",
    processed_filename: "Ann_Bo_Classic_2026.mp3",
    original_filename: "my mix final.mp3",
    drive_file_id: "drive123",
    division: "Classic",
    routine_name: "Fever",
    personal_descriptor: "v3",
    partner_id: "p1",
    partner_first_name: "Bo",
    partner_last_name: "Kim",
    partner_kind: "partner",
  });
  const LEGACY = fx.song({
    id: "song-legacy",
    processed_filename: "  ",
    is_legacy: true,
    partner_id: "p2",
    partner_first_name: "Team Rocket",
    partner_kind: "team",
  });

  it("shows an empty state with a link to add a song", async () => {
    renderPage();
    expect(await screen.findByText(/no songs yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a song" })).toHaveAttribute("href", "/songs/add");
  });

  it("shows each song's file, metadata, partner and playback link", async () => {
    withGets({ "/v1/songs": [UPLOADED, LEGACY] });
    renderPage();

    const card = (await screen.findByText("Ann_Bo_Classic_2026.mp3")).closest("div.rounded-lg")!;
    expect(card).toHaveTextContent("Uploaded: my mix final.mp3");
    expect(card).toHaveTextContent("Division Classic");
    expect(card).toHaveTextContent("Partner Bo Kim");
    expect(card).toHaveTextContent("Routine Fever");
    expect(card).toHaveTextContent("Descriptor v3");
    expect(
      within(card as HTMLElement).getByRole("link", { name: /open song in google drive/i })
    ).toHaveAttribute("href", "https://drive.google.com/file/d/drive123/view");

    // Legacy songs have no audio and a placeholder entity is labelled as such.
    const legacyBtn = screen.getByRole("button", { name: "Legacy Song" });
    expect(legacyBtn).toBeDisabled();
    const legacyCard = legacyBtn.closest("div.rounded-lg")!;
    expect(legacyCard).toHaveTextContent("Entity Team Rocket");
    expect(legacyCard).toHaveTextContent("—");
  });

  it("deletes a song after confirming", async () => {
    withGets({ "/v1/songs": [UPLOADED] });
    apiDel.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("This will permanently remove Ann_Bo_Classic_2026.mp3");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/songs/song-up"));
    expect(toast.success).toHaveBeenCalledWith("Song removed.");
    expect(await screen.findByText(/no songs yet/i)).toBeInTheDocument();
  });

  it("keeps the song when deletion fails, with a generic prompt for an unnamed song", async () => {
    withGets({ "/v1/songs": [LEGACY] });
    apiDel.mockRejectedValue(new Error("Song is checked in"));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("This will permanently remove the song.");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Song is checked in"));
    expect(screen.getByRole("button", { name: "Legacy Song" })).toBeInTheDocument();
  });

  it("reports a failure to load songs", async () => {
    withGets({ "/v1/songs": () => Promise.reject(new Error("songs down")) });
    renderPage();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("songs down"));
  });
});

describe("MyContentPage — events and sessions details", () => {
  beforeEach(resetMocks);

  it("links active events to their page and hides completed ones", async () => {
    const active = fx.event({ id: "act", name: "Live Fest", status: "active", start_date: "2026-05-01" });
    const done = fx.event({ id: "done", name: "Old Fest", status: "completed" });
    withGets({
      "/v1/events": [active, done, EVENT],
      "/v1/event-song-submissions": [
        fx.eventSongSubmission({ id: "a", event_id: "act", song_label: "Live Song", division: null }),
        fx.eventSongSubmission({ id: "b", event_id: "done", song_label: "Old Song" }),
        fx.eventSongSubmission({ id: "c", event_id: "ev1", song_label: "Spring Song", division: "Classic" }),
      ],
    });
    renderPage();

    expect(await screen.findByText("Live Fest")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to event" })).toHaveAttribute("href", "/events/act");
    expect(screen.getAllByRole("link", { name: "Go to event" })).toHaveLength(1);
    expect(screen.getByText("Spring Song").parentElement).toHaveTextContent("Spring Song · Classic");
    expect(screen.getByText("Live Song").parentElement).toHaveTextContent(/^Live Song$/);
    expect(screen.queryByText("Old Fest")).not.toBeInTheDocument();
  });

  it("lists in-progress sessions in start order", async () => {
    const later = fx.session({
      ...ACTIVE_SESSION,
      id: "later",
      status: "in_progress",
      event_id: null,
      floor_trial_starts_at: ACTIVE_SESSION.floor_trial_starts_at + 86_400_000,
      floor_trial_ends_at: ACTIVE_SESSION.floor_trial_ends_at + 86_400_000,
    });
    withGets({ "/v1/sessions": [later, ACTIVE_SESSION] });
    renderPage();

    await screen.findByRole("heading", { name: /^active floor trials$/i });
    const links = screen.getAllByRole("link", { name: /^go to session$/i });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/sessions/sess-active-1",
      "/sessions/later",
    ]);
    expect(screen.getByText("in progress")).toBeInTheDocument();
  });

  it("hides the active floor trials section when sessions fail to load", async () => {
    withGets({ "/v1/sessions": () => Promise.reject(new Error("down")) });
    renderPage();
    await screen.findByRole("heading", { name: /^songs$/i });
    expect(screen.queryByRole("heading", { name: /^active floor trials$/i })).toBeNull();
  });
});
