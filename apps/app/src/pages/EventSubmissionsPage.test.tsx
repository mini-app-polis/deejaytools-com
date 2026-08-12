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
});
