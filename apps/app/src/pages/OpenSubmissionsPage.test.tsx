// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  toast: { error: vi.fn(), success: vi.fn() },
}));

import OpenSubmissionsPage from "./OpenSubmissionsPage";

const OPEN_EVENT = {
  id: "open1",
  name: "The Open 2026",
  start_date: "2026-11-26",
  end_date: "2026-11-29",
  timezone: "America/Los_Angeles",
  status: "upcoming",
  created_by: "u1",
  created_at: 1,
  updated_at: 1,
};

const OTHER_EVENT = { ...OPEN_EVENT, id: "ev1", name: "Spring Classic" };

const SONG = {
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
};

const SONG_SAME_ENTITY = {
  ...SONG,
  id: "song2",
  display_name: "Second Routine",
  processed_filename: "2026_Classic_SecondRoutine.mp3",
  routine_name: "Second Routine",
};

const SONG_OTHER_DIVISION = {
  ...SONG,
  id: "song3",
  division: "Showcase",
  display_name: "Showcase Routine",
  processed_filename: "2026_Showcase_MyRoutine.mp3",
};

const LEGACY_SONG = {
  ...SONG,
  id: "legacy1",
  display_name: "Old Routine",
  processed_filename: "2019_Classic_OldRoutine.mp3",
  routine_name: "Old Routine",
  is_legacy: true,
};

function mockApi(events: unknown[], songs: unknown[] = [SONG], submissions: unknown[] = []) {
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/events") return Promise.resolve(events);
    if (path === "/v1/songs") return Promise.resolve(songs);
    if (path.startsWith("/v1/event-song-submissions")) return Promise.resolve(submissions);
    return Promise.resolve([]);
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OpenSubmissionsPage />
    </MemoryRouter>
  );
}

describe("OpenSubmissionsPage", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiDel.mockReset();
  });

  it("auto-selects the single Open event and skips the picker", async () => {
    mockApi([OTHER_EVENT, OPEN_EVENT]);
    renderPage();

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/event-song-submissions\?event_id=open1/)
      );
    });
    expect(screen.queryByRole("combobox", { name: /event/i })).not.toBeInTheDocument();
    expect(screen.getByText(/The Open 2026/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^add$/i })).toBeInTheDocument();
  });

  it("never offers a non-Open event", async () => {
    mockApi([OTHER_EVENT, OPEN_EVENT, { ...OPEN_EVENT, id: "open2", name: "theopen fall" }]);
    const user = userEvent.setup();
    renderPage();

    const combobox = await screen.findByRole("combobox", { name: /event/i });
    await user.click(combobox);

    expect(await screen.findByRole("option", { name: /The Open 2026/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /theopen fall/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /spring classic/i })).not.toBeInTheDocument();
  });

  it("posts the submission against the Open event", async () => {
    mockApi([OPEN_EVENT]);
    apiPost.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/event-song-submissions", {
        event_id: "open1",
        song_id: "song1",
      });
    });
  });

  it("explains when no Open event is accepting submissions", async () => {
    mockApi([OTHER_EVENT]);
    renderPage();

    expect(
      await screen.findByText(/isn't accepting submissions right now/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
  });

  it("hides legacy songs and says how many were hidden", async () => {
    mockApi([OPEN_EVENT], [SONG, LEGACY_SONG]);
    renderPage();

    expect(await screen.findByText(/2026_Classic_MyRoutine/)).toBeInTheDocument();
    expect(screen.queryByText(/2019_Classic_OldRoutine/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 legacy song is hidden/i)).toBeInTheDocument();
  });

  it("keeps a legacy song visible when it is already submitted, so it can be removed", async () => {
    mockApi(
      [OPEN_EVENT],
      [LEGACY_SONG],
      [{ id: "sub1", event_id: "open1", song_id: "legacy1", created_at: 1 }]
    );
    renderPage();

    expect(await screen.findByText(/2019_Classic_OldRoutine/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/legacy song is hidden/i)).not.toBeInTheDocument();
  });

  it("shows a legacy-only empty state instead of the generic no-songs message", async () => {
    mockApi([OPEN_EVENT], [LEGACY_SONG]);
    renderPage();

    expect(await screen.findByText(/all legacy catalog rows/i)).toBeInTheDocument();
    expect(screen.queryByText(/you have no songs yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
  });

  it("disables Add for a second song in the same entity and division slot", async () => {
    mockApi(
      [OPEN_EVENT],
      [SONG, SONG_SAME_ENTITY],
      [{ id: "sub1", event_id: "open1", song_id: "song1", created_at: 1 }]
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument();
    });
    expect(await screen.findByText(/2026_Classic_SecondRoutine\.mp3/)).toBeInTheDocument();
    expect(screen.getByText(/already submitted for this division/i)).toBeInTheDocument();
    const addButtons = screen.getAllByRole("button", { name: /^add$/i });
    expect(addButtons).toHaveLength(1);
    expect(addButtons[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: /^remove$/i })).toBeEnabled();
  });

  it("still allows Add for the same entity in another division", async () => {
    mockApi(
      [OPEN_EVENT],
      [SONG, SONG_OTHER_DIVISION],
      [{ id: "sub1", event_id: "open1", song_id: "song1", created_at: 1 }]
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument();
    });
    expect(await screen.findByText(/2026_Showcase_MyRoutine\.mp3/)).toBeInTheDocument();
    expect(screen.queryByText(/already submitted for this division/i)).not.toBeInTheDocument();
    const enabledAdds = screen
      .getAllByRole("button", { name: /^add$/i })
      .filter((button) => !(button as HTMLButtonElement).disabled);
    expect(enabledAdds).toHaveLength(1);
  });
});
