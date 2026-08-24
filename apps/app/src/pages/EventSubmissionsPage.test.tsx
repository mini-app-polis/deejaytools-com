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

import EventSubmissionsPage from "./EventSubmissionsPage";
import { toast } from "sonner";

const EVENT = {
  id: "ev1",
  name: "Spring Classic",
  start_date: "2026-04-01",
  end_date: "2026-04-03",
  timezone: "America/Los_Angeles",
  status: "upcoming",
  created_by: "u1",
  created_at: 1,
  updated_at: 1,
};

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
  processed_filename: "[Legacy] Kaiano Levine & Dana Whitfield · Classic · The Open 2025",
  routine_name: "Old Routine",
  is_legacy: true,
};

function mockApi(songs: unknown[], submissions: unknown[] = []) {
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/events") return Promise.resolve([EVENT]);
    if (path === "/v1/songs") return Promise.resolve(songs);
    if (path.startsWith("/v1/event-song-submissions")) return Promise.resolve(submissions);
    return Promise.resolve([]);
  });
}

async function selectEvent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("combobox", { name: /event/i }));
  await user.click(await screen.findByRole("option", { name: /spring classic/i }));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <EventSubmissionsPage />
    </MemoryRouter>
  );
}

describe("EventSubmissionsPage", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiDel.mockReset();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("renders available events and loads submissions when one is selected", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") return Promise.resolve([EVENT]);
      if (path === "/v1/songs") return Promise.resolve([SONG]);
      if (path.startsWith("/v1/event-song-submissions")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /event/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/select an event to manage submissions/i)).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /event/i }));
    await user.click(await screen.findByRole("option", { name: /spring classic/i }));

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/event-song-submissions\?event_id=ev1/)
      );
    });

    expect(await screen.findByText(/2026_Classic_MyRoutine\.mp3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();
  });

  it("posts a submission on Add and surfaces toast.error on 501", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") return Promise.resolve([EVENT]);
      if (path === "/v1/songs") return Promise.resolve([SONG]);
      if (path.startsWith("/v1/event-song-submissions")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    apiPost.mockRejectedValue(new Error("DB stub pending — not yet implemented"));

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /event/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("combobox", { name: /event/i }));
    await user.click(await screen.findByRole("option", { name: /spring classic/i }));

    await user.click(await screen.findByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/event-song-submissions", {
        event_id: "ev1",
        song_id: "song1",
      });
    });
    expect(toast.error).toHaveBeenCalledWith("DB stub pending — not yet implemented");
  });

  it("hides The Open from the picker and links to its dedicated page", async () => {
    const openEvent = { ...EVENT, id: "open1", name: "The Open 2026" };
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") return Promise.resolve([EVENT, openEvent]);
      if (path === "/v1/songs") return Promise.resolve([SONG]);
      if (path.startsWith("/v1/event-song-submissions")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const user = userEvent.setup();
    renderPage();

    const link = await screen.findByRole("link", { name: /go to the open submissions/i });
    expect(link).toHaveAttribute("href", "/open-submissions");

    await user.click(screen.getByRole("combobox", { name: /event/i }));
    expect(await screen.findByRole("option", { name: /spring classic/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /the open/i })).not.toBeInTheDocument();
  });

  it("still renders events and songs when event-song-submissions rejects", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") return Promise.resolve([EVENT]);
      if (path === "/v1/songs") return Promise.resolve([SONG]);
      if (path.startsWith("/v1/event-song-submissions")) {
        return Promise.reject(new Error("not found"));
      }
      return Promise.resolve([]);
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /event/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("combobox", { name: /event/i }));
    await user.click(await screen.findByRole("option", { name: /spring classic/i }));

    expect(await screen.findByText(/2026_Classic_MyRoutine\.mp3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();
  });

  it("hides legacy songs and says how many were hidden", async () => {
    mockApi([SONG, LEGACY_SONG]);
    const user = userEvent.setup();
    renderPage();
    await selectEvent(user);

    expect(await screen.findByText(/2026_Classic_MyRoutine\.mp3/)).toBeInTheDocument();
    expect(screen.queryByText(/\[Legacy\]/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 legacy song is hidden/i)).toBeInTheDocument();
  });

  it("keeps a legacy song visible when it is already submitted, so it can be removed", async () => {
    mockApi([LEGACY_SONG], [{ id: "sub1", event_id: "ev1", song_id: "legacy1", created_at: 1 }]);
    const user = userEvent.setup();
    renderPage();
    await selectEvent(user);

    expect(await screen.findByText(/\[Legacy\]/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^remove$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/legacy song is hidden/i)).not.toBeInTheDocument();
  });

  it("shows a legacy-only empty state instead of the generic no-songs message", async () => {
    mockApi([LEGACY_SONG]);
    const user = userEvent.setup();
    renderPage();
    await selectEvent(user);

    expect(await screen.findByText(/all legacy catalog rows/i)).toBeInTheDocument();
    expect(screen.queryByText(/you have no songs yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add$/i })).not.toBeInTheDocument();
  });

  it("disables Add for a second song in the same entity and division slot", async () => {
    mockApi(
      [SONG, SONG_SAME_ENTITY],
      [{ id: "sub1", event_id: "ev1", song_id: "song1", created_at: 1 }]
    );
    const user = userEvent.setup();
    renderPage();
    await selectEvent(user);

    expect(await screen.findByText(/2026_Classic_SecondRoutine\.mp3/)).toBeInTheDocument();
    expect(screen.getByText(/already submitted for this division/i)).toBeInTheDocument();
    const addButtons = screen.getAllByRole("button", { name: /^add$/i });
    expect(addButtons).toHaveLength(1);
    expect(addButtons[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: /^remove$/i })).toBeEnabled();
  });

  it("still allows Add for the same entity in another division", async () => {
    mockApi(
      [SONG, SONG_OTHER_DIVISION],
      [{ id: "sub1", event_id: "ev1", song_id: "song1", created_at: 1 }]
    );
    const user = userEvent.setup();
    renderPage();
    await selectEvent(user);

    expect(await screen.findByText(/2026_Showcase_MyRoutine\.mp3/)).toBeInTheDocument();
    expect(screen.queryByText(/already submitted for this division/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeEnabled();
  });
});
