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
  partner_id: null,
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

function mockApi(events: unknown[], songs: unknown[] = [SONG]) {
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/events") return Promise.resolve(events);
    if (path === "/v1/songs") return Promise.resolve(songs);
    if (path.startsWith("/v1/event-song-submissions")) return Promise.resolve([]);
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
});
