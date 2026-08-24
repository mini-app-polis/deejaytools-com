// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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

const SONG_SHOWCASE = {
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
    toastMocks.error.mockReset();
    toastMocks.success.mockReset();
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
    expect(await screen.findByRole("combobox", { name: /song/i })).toBeInTheDocument();
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

  it("selecting a song defaults the division to the song's", async () => {
    mockApi([OPEN_EVENT], [SONG]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Classic_MyRoutine/ }));

    await user.click(await screen.findByRole("combobox", { name: /division/i }));
    expect(await screen.findByRole("option", { name: /^Classic$/ })).toBeInTheDocument();
  });

  it("shows the round control only for Classic and defaults to Prelims & Finals", async () => {
    mockApi([OPEN_EVENT], [SONG]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Classic_MyRoutine/ }));

    expect(await screen.findByRole("radio", { name: /prelims & finals/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: /prelims only/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /finals only/i })).toBeInTheDocument();
  });

  it("hides the round control for non-Classic divisions", async () => {
    mockApi([OPEN_EVENT], [SONG_SHOWCASE]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Showcase_MyRoutine/ }));

    await user.click(await screen.findByRole("combobox", { name: /division/i }));
    await user.click(await screen.findByRole("option", { name: /^Showcase$/ }));

    expect(screen.queryByRole("radio", { name: /prelims & finals/i })).not.toBeInTheDocument();
  });

  it("re-derives division from the new song when the song changes", async () => {
    mockApi([OPEN_EVENT], [SONG, SONG_SHOWCASE]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Classic_MyRoutine/ }));

    await user.click(await screen.findByRole("combobox", { name: /division/i }));
    await user.click(await screen.findByRole("option", { name: /^Showcase$/ }));

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Showcase_MyRoutine/ }));
    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Classic_MyRoutine/ }));

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
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Classic_MyRoutine/ }));
    await user.click(await screen.findByRole("radio", { name: /finals only/i }));
    expect(screen.getByRole("radio", { name: /finals only/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Showcase_MyRoutine/ }));
    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Classic_MyRoutine/ }));

    expect(await screen.findByRole("radio", { name: /prelims & finals/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("clears the form when switching events", async () => {
    const OPEN_EVENT_2 = { ...OPEN_EVENT, id: "open2", name: "The Open 2027" };
    mockApi([OPEN_EVENT, OPEN_EVENT_2], [SONG]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: /event/i }));
    await user.click(await screen.findByRole("option", { name: /the open 2026/i }));

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Classic_MyRoutine/ }));
    expect(await screen.findByRole("radio", { name: /prelims & finals/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^submit$/i })).toBeEnabled();

    await user.click(await screen.findByRole("combobox", { name: /event/i }));
    await user.click(await screen.findByRole("option", { name: /the open 2027/i }));

    await waitFor(() => {
      expect(screen.queryByRole("radio", { name: /prelims & finals/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^submit$/i })).toBeDisabled();
  });

  it("posts division and round on submit", async () => {
    mockApi([OPEN_EVENT]);
    apiPost.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Classic_MyRoutine/ }));
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

  it("surfaces a 409 as an error toast and keeps the form filled", async () => {
    mockApi([OPEN_EVENT]);
    apiPost.mockRejectedValue(new Error("This entity already has a song submitted for Classic."));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: /song/i }));
    await user.click(await screen.findByRole("option", { name: /2026_Classic_MyRoutine/ }));
    await user.click(await screen.findByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        "This entity already has a song submitted for Classic."
      );
    });
    expect(await screen.findByRole("combobox", { name: /song/i })).toHaveTextContent(
      /2026_Classic_MyRoutine/
    );
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("explains when no Open event is accepting submissions", async () => {
    mockApi([OTHER_EVENT]);
    renderPage();

    expect(
      await screen.findByText(/isn't accepting submissions right now/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /song/i })).not.toBeInTheDocument();
  });

  it("hides legacy songs and says how many were hidden", async () => {
    mockApi([OPEN_EVENT], [SONG, LEGACY_SONG]);
    renderPage();

    await userEvent.setup().click(await screen.findByRole("combobox", { name: /song/i }));
    expect(await screen.findByRole("option", { name: /2026_Classic_MyRoutine/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /2019_Classic_OldRoutine/ })).not.toBeInTheDocument();
    expect(screen.getByText(/1 legacy song is hidden/i)).toBeInTheDocument();
  });

  it("lists an existing submission with division and round", async () => {
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
    renderPage();

    expect(await screen.findByText(/finals only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /song/i })).not.toBeInTheDocument();
  });
});
