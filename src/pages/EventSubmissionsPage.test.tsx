// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));
const apiGet = vi.fn();
const apiPost = vi.fn();
const apiDel = vi.fn();
const apiClient = {
  get: apiGet,
  post: apiPost,
  patch: vi.fn(),
  del: apiDel,
  postForm: vi.fn(),
};
vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

// The division list as loaded; a test swaps in a failed load.
const useDivisionsMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useDivisions", () => ({ useDivisions: useDivisionsMock }));

import EventSubmissionsPage, { OpenSubmissionsRedirect } from "./EventSubmissionsPage";
import { fx } from "@/test/fixtures";
import { LOADED_DIVISIONS } from "@/test/divisions";
import { renderWithQueryClient } from "@/test/render";

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

const OPEN_EVENT = fx.event({
  ...EVENT,
  id: "open1",
  name: "The Open 2026",
  start_date: "2026-11-26",
  end_date: "2026-11-29",
});

const SONG = fx.song({
  id: "song1",
  user_id: "u1",
  partner_id: "p1",
  display_name: "My Routine",
  original_filename: "track.mp3",
  drive_file_id: null,
  drive_folder_id: null,
  processed_filename: "2026_Classic_MyRoutine.mp3",
  division: "Classic",
  routine_name: "My Routine",
  personal_descriptor: null,
  season_year: "2026",
  is_legacy: false,
  created_at: 1,
  updated_at: 1,
});

const SONG_SHOWCASE = fx.song({
  ...SONG,
  id: "song3",
  division: "Showcase",
  display_name: "Showcase Routine",
  processed_filename: "2026_Showcase_MyRoutine.mp3",
});

const LEGACY_SONG = fx.song({
  ...SONG,
  id: "legacy1",
  display_name: "Old Routine",
  processed_filename: "2019_Classic_OldRoutine.mp3",
  routine_name: "Old Routine",
  is_legacy: true,
});

// A song owned by someone else and listed because the caller is its linked
// partner. The API lets the partner submit it (POST /v1/event-song-submissions
// accepts a song shared with the caller) and withdraw a submission the caller
// made (DELETE checks the submitter); the list endpoint returns only the
// caller's own submissions, so every listed one is the caller's to remove.
const SHARED_SONG = fx.song({
  ...SONG,
  id: "shared1",
  user_id: "owner_u",
  partner_id: "owner_partner_row",
  display_name: "Partner Routine",
  routine_name: "Partner Routine",
  processed_filename: "2026_Classic_PartnerRoutine.mp3",
  shared_with_me: true,
});

function mockApi(events: unknown[], songs: unknown[] = [SONG], submissions: unknown[] = []) {
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/events") return Promise.resolve(events);
    if (path === "/v1/songs") return Promise.resolve(songs);
    if (path.startsWith("/v1/event-song-submissions")) {
      return Promise.resolve(
        submissions.map((s) =>
          fx.listedEventSongSubmission(s as Parameters<typeof fx.listedEventSongSubmission>[0])
        )
      );
    }
    return Promise.resolve([]);
  });
}

function renderAt(path: string) {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/event-submissions" element={<EventSubmissionsPage />} />
        <Route path="/event-submissions/:eventId" element={<EventSubmissionsPage />} />
        <Route path="/open-submissions" element={<OpenSubmissionsRedirect />} />
      </Routes>
    </MemoryRouter>
  );
}

async function pickSong(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole("combobox", { name: /song/i }));
  await user.click(await screen.findByRole("option", { name }));
}

async function pickDivision(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole("combobox", { name: /division/i }));
  await user.click(await screen.findByRole("option", { name }));
}

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiDel.mockReset();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  useDivisionsMock.mockReset();
  useDivisionsMock.mockReturnValue(LOADED_DIVISIONS);
});

describe("EventSubmissionsPage — picker", () => {
  it("lists every upcoming event, The Open included, and opens the chosen one", async () => {
    mockApi([EVENT, OPEN_EVENT, { ...EVENT, id: "done", name: "Old Fest", status: "completed" }]);
    const user = userEvent.setup();
    renderAt("/event-submissions");

    await user.click(await screen.findByRole("combobox", { name: /event/i }));
    expect(await screen.findByRole("option", { name: /the open 2026/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /old fest/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /spring classic/i }));

    expect(await screen.findByRole("heading", { name: "Spring Classic" })).toBeInTheDocument();
    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/event-song-submissions\?event_id=ev1/)
      );
    });
  });

  it("says when no events are available", async () => {
    mockApi([]);
    renderAt("/event-submissions");
    expect(await screen.findByText(/no upcoming events are available/i)).toBeInTheDocument();
  });

  it("says the events couldn't load, not that none are available, and retries", async () => {
    let fail = true;
    apiGet.mockImplementation((path: string) =>
      path === "/v1/events" && fail ? Promise.reject(new Error("events down")) : Promise.resolve([])
    );
    const user = userEvent.setup();
    renderAt("/event-submissions");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the events: events down");
    expect(screen.queryByText(/no upcoming events are available/i)).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/no upcoming events are available/i)).toBeInTheDocument();
  });
});

describe("EventSubmissionsPage — event page", () => {
  it("says an unknown or finished event is not open for submissions", async () => {
    mockApi([EVENT]);
    renderAt("/event-submissions/nope");

    expect(await screen.findByText(/event not open for submissions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /choose another event/i })).toHaveAttribute(
      "href",
      "/event-submissions"
    );
  });

  it("selecting a song defaults the division to the song's", async () => {
    mockApi([EVENT], [SONG]);
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    await pickSong(user, /Classic - My Routine/);
    await user.click(await screen.findByRole("combobox", { name: /division/i }));
    expect(await screen.findByRole("option", { name: /^Classic$/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("never shows the round control outside The Open, even for Classic", async () => {
    mockApi([EVENT], [SONG]);
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    await pickSong(user, /Classic - My Routine/);
    expect(screen.queryByRole("radio", { name: /prelims & finals/i })).not.toBeInTheDocument();
  });

  it("posts the chosen division and no round for a regular event", async () => {
    mockApi([EVENT], [SONG]);
    apiPost.mockResolvedValue(fx.eventSongSubmission());
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    await pickSong(user, /Classic - My Routine/);
    await pickDivision(user, /^Showcase$/);
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/event-song-submissions", {
        event_id: "ev1",
        song_id: "song1",
        division: "Showcase",
      });
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Song added to Spring Classic.");
  });

  it("surfaces a 409 as an error toast and keeps the form filled", async () => {
    mockApi([EVENT]);
    apiPost.mockRejectedValue(new Error("This entity already has a song submitted for Classic."));
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    await pickSong(user, /Classic - My Routine/);
    await user.click(await screen.findByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "This entity already has a song submitted for Classic."
      );
    });
    expect(await screen.findByRole("combobox", { name: /song/i })).toHaveTextContent(
      /Classic - My Routine/
    );
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("hides legacy songs and says how many were hidden", async () => {
    mockApi([EVENT], [SONG, LEGACY_SONG]);
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    expect(await screen.findByRole("option", { name: /Classic - My Routine/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Classic - Old Routine/ })).not.toBeInTheDocument();
    expect(screen.getByText(/1 legacy song is hidden/i)).toBeInTheDocument();
  });

  it("shows a legacy-only empty state instead of the generic no-songs message", async () => {
    mockApi([EVENT], [LEGACY_SONG]);
    renderAt("/event-submissions/ev1");

    expect(await screen.findByText(/came over from the old catalog without an audio file/i)).toBeInTheDocument();
    expect(screen.queryByText(/you have no songs yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /song/i })).not.toBeInTheDocument();
  });

  it("lists existing submissions with Remove and leaves them out of the song picker", async () => {
    mockApi(
      [EVENT],
      [SONG, SONG_SHOWCASE],
      [{ id: "sub1", event_id: "ev1", song_id: "song1", song_label: "2026_Classic_MyRoutine.mp3", division: "Classic", created_at: 1, can_withdraw: true }]
    );
    apiDel.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    expect(await screen.findByText("Your submissions")).toBeInTheDocument();
    expect(screen.getByText("Division Classic")).toBeInTheDocument();

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    expect(await screen.findByRole("option", { name: /Showcase - My Routine/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Classic - My Routine/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => {
      expect(apiDel).toHaveBeenCalledWith("/v1/event-song-submissions/sub1");
    });
  });

  it("offers a song shared by a linked partner and submits it", async () => {
    mockApi([EVENT], [SHARED_SONG]);
    apiPost.mockResolvedValue(fx.eventSongSubmission());
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    await pickSong(user, /Partner Routine/);
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/event-song-submissions", {
        event_id: "ev1",
        song_id: "shared1",
        division: "Classic",
      });
    });
  });

  it("lists the caller's submission of a shared song with Remove, and withdraws it", async () => {
    mockApi(
      [EVENT],
      [SHARED_SONG],
      [{ id: "sub_shared", event_id: "ev1", song_id: "shared1", song_label: "2026_Classic_PartnerRoutine.mp3", division: "Classic", created_at: 1, can_withdraw: true }]
    );
    apiDel.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    expect(await screen.findByText("Your submissions")).toBeInTheDocument();
    expect(screen.getByText("2026_Classic_PartnerRoutine.mp3")).toBeInTheDocument();
    // Submitted already, so not offered again.
    expect(screen.getByText(/every song in your library is already submitted/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => {
      expect(apiDel).toHaveBeenCalledWith("/v1/event-song-submissions/sub_shared");
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Song removed from Spring Classic.");
  });

  it("lists a partner's submission of a shared song without Remove", async () => {
    mockApi(
      [EVENT],
      [SHARED_SONG],
      [{ id: "sub_partner", event_id: "ev1", song_id: "shared1", song_label: "2026_Classic_PartnerRoutine.mp3", division: "Classic", created_at: 1, can_withdraw: false }]
    );
    renderAt("/event-submissions/ev1");

    expect(await screen.findByText("Your submissions")).toBeInTheDocument();
    expect(screen.getByText("2026_Classic_PartnerRoutine.mp3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remove$/i })).not.toBeInTheDocument();
  });

  it("flags a submission whose song is no longer in the library, and lets it be removed", async () => {
    mockApi(
      [EVENT],
      [SONG],
      [{ id: "orphan_sub", event_id: "ev1", song_id: "missing_song", song_label: "2025_Classic_GoneRoutine.mp3", division: "Classic", created_at: 1, can_withdraw: true }]
    );
    renderAt("/event-submissions/ev1");

    expect(await screen.findByText(/2025_Classic_GoneRoutine\.mp3/)).toBeInTheDocument();
    expect(screen.getByText(/no longer in your library/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument();
  });

  it("says when every song is already submitted", async () => {
    mockApi(
      [EVENT],
      [SONG],
      [{ id: "sub1", event_id: "ev1", song_id: "song1", created_at: 1 }]
    );
    renderAt("/event-submissions/ev1");

    expect(await screen.findByText(/every song in your library is already submitted/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /song/i })).not.toBeInTheDocument();
  });
});

describe("EventSubmissionsPage — failed loads", () => {
  it("says the event and songs couldn't load, not that the event is closed, and retries", async () => {
    let fail = true;
    mockApi([EVENT], [SONG]);
    const served = apiGet.getMockImplementation()!;
    apiGet.mockImplementation((path: string) =>
      path === "/v1/songs" && fail ? Promise.reject(new Error("songs down")) : served(path)
    );
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load .*songs down/i);
    expect(screen.queryByText(/event not open for submissions/i)).not.toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { name: "Spring Classic" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error when the events request fails", async () => {
    mockApi([EVENT], [SONG]);
    const served = apiGet.getMockImplementation()!;
    apiGet.mockImplementation((path: string) =>
      path === "/v1/events" ? Promise.reject(new Error("events down")) : served(path)
    );
    renderAt("/event-submissions/ev1");

    expect(await screen.findByRole("alert")).toHaveTextContent(/events down/);
    expect(screen.queryByText(/event not open for submissions/i)).not.toBeInTheDocument();
  });

  it("shows a failed submissions load instead of an empty list, blocks submitting, and retries", async () => {
    let fail = true;
    mockApi(
      [EVENT],
      [SONG, SONG_SHOWCASE],
      [{ id: "sub1", event_id: "ev1", song_id: "song1", song_label: "2026_Classic_MyRoutine.mp3", division: "Classic", created_at: 1, can_withdraw: true }]
    );
    const served = apiGet.getMockImplementation()!;
    apiGet.mockImplementation((path: string) =>
      path.startsWith("/v1/event-song-submissions") && fail
        ? Promise.reject(new Error("submissions down"))
        : served(path)
    );
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't load your submissions to this event: submissions down/i
    );
    expect(screen.queryByText("Your submissions")).not.toBeInTheDocument();

    await pickSong(user, /Showcase - My Routine/);
    expect(screen.getByRole("button", { name: /^submit$/i })).toBeDisabled();

    fail = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Your submissions")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^submit$/i })).toBeEnabled();
  });

  it("shows a failed divisions load with a retry", async () => {
    const retry = vi.fn();
    useDivisionsMock.mockReturnValue({
      groups: [], divisions: [], loading: false, error: "divisions down", retry,
    });
    mockApi([EVENT], [SONG]);
    const user = userEvent.setup();
    renderAt("/event-submissions/ev1");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't load the divisions: divisions down/i
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("EventSubmissionsPage — The Open", () => {
  it("shows the round control only for Classic and defaults to Prelims & Finals", async () => {
    mockApi([OPEN_EVENT], [SONG]);
    const user = userEvent.setup();
    renderAt("/event-submissions/open1");

    await pickSong(user, /Classic - My Routine/);
    expect(await screen.findByRole("radio", { name: /prelims & finals/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: /prelims only/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /finals only/i })).toBeInTheDocument();

    await pickDivision(user, /^Showcase$/);
    expect(screen.queryByRole("radio", { name: /prelims & finals/i })).not.toBeInTheDocument();
  });

  it("re-derives division from the new song when the song changes", async () => {
    mockApi([OPEN_EVENT], [SONG, SONG_SHOWCASE]);
    const user = userEvent.setup();
    renderAt("/event-submissions/open1");

    await pickSong(user, /Classic - My Routine/);
    await pickDivision(user, /^Showcase$/);
    await pickSong(user, /Showcase - My Routine/);
    await pickSong(user, /Classic - My Routine/);

    await user.click(await screen.findByRole("combobox", { name: /division/i }));
    // Override must not stick after a song change — Classic song re-derives Classic.
    expect(await screen.findByRole("option", { name: /^Classic$/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("radio", { name: /prelims & finals/i })).toBeInTheDocument();
  });

  it("resets round to Prelims & Finals when the song changes", async () => {
    mockApi([OPEN_EVENT], [SONG, SONG_SHOWCASE]);
    const user = userEvent.setup();
    renderAt("/event-submissions/open1");

    await pickSong(user, /Classic - My Routine/);
    await user.click(await screen.findByRole("radio", { name: /finals only/i }));
    expect(screen.getByRole("radio", { name: /finals only/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    await pickSong(user, /Showcase - My Routine/);
    await pickSong(user, /Classic - My Routine/);

    expect(await screen.findByRole("radio", { name: /prelims & finals/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("posts division and round on submit", async () => {
    mockApi([OPEN_EVENT]);
    apiPost.mockResolvedValue(fx.eventSongSubmission());
    const user = userEvent.setup();
    renderAt("/event-submissions/open1");

    await pickSong(user, /Classic - My Routine/);
    await user.click(await screen.findByRole("radio", { name: /prelims only/i }));
    await user.click(await screen.findByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/event-song-submissions", {
        event_id: "open1",
        song_id: "song1",
        division: "Classic",
        round: "prelims_only",
      });
    });
  });

  it("lists an existing Classic submission with its round", async () => {
    mockApi(
      [OPEN_EVENT],
      [SONG],
      [
        {
          id: "sub1",
          event_id: "open1",
          song_id: "song1",
          song_label: "2026_Classic_MyRoutine.mp3",
          division: "Classic",
          round: "finals_only",
          created_at: 1,
        },
      ]
    );
    renderAt("/event-submissions/open1");

    expect(await screen.findByText(/finals only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument();
  });
});

describe("OpenSubmissionsRedirect", () => {
  it("forwards to The Open's event page when exactly one is open", async () => {
    mockApi([EVENT, OPEN_EVENT]);
    renderAt("/open-submissions");
    expect(await screen.findByRole("heading", { name: "The Open 2026" })).toBeInTheDocument();
  });

  it("forwards to the picker when none or several are open", async () => {
    mockApi([EVENT, OPEN_EVENT, { ...OPEN_EVENT, id: "open2", name: "The Open 2027" }]);
    renderAt("/open-submissions");
    expect(await screen.findByRole("combobox", { name: /event/i })).toBeInTheDocument();
  });
});
