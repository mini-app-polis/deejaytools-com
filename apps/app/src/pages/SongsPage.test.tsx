// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const apiGet = vi.fn();
const apiClient = {
  get: apiGet,
  post: vi.fn(),
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

import SongsPage from "./SongsPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <SongsPage />
    </MemoryRouter>
  );
}

describe("SongsPage", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("renders the My Songs heading and Add Song button", async () => {
    apiGet.mockResolvedValue([]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /my songs/i })).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: /add song/i })).toBeInTheDocument();
  });

  it("shows an empty state when there are no songs", async () => {
    apiGet.mockResolvedValue([]);
    renderPage();

    // Both the mobile card list and the desktop table render "No songs yet." —
    // use getAllByText and confirm at least one instance is present.
    await waitFor(() =>
      expect(screen.getAllByText(/no songs yet/i).length).toBeGreaterThan(0)
    );
  });

  it("renders a song row in the desktop table", async () => {
    apiGet.mockResolvedValue([
      {
        id: "s1",
        partner_id: null,
        processed_filename: "my_song.mp3",
        division: "Classic",
        routine_name: "The Open 2025",
        personal_descriptor: "98%",
        created_at: new Date("2026-01-15").getTime(),
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);
    renderPage();

    // Mobile card + desktop table both render the same data, so use getAllByText.
    await waitFor(() =>
      expect(screen.getAllByText("my_song.mp3").length).toBeGreaterThan(0)
    );
    expect(screen.getAllByText("Classic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("The Open 2025").length).toBeGreaterThan(0);
    expect(screen.getAllByText("98%").length).toBeGreaterThan(0);
  });
});

describe("SongsPage — delete flow", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("shows a confirm prompt when the delete button is clicked", async () => {
    const { toast } = await import("sonner");
    apiGet.mockResolvedValue([
      {
        id: "s1",
        partner_id: null,
        processed_filename: "my_song.mp3",
        division: "Classic",
        routine_name: "The Open 2025",
        personal_descriptor: "98%",
        created_at: new Date("2026-01-15").getTime(),
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);
    renderPage();

    // Wait for the song to render.
    await waitFor(() =>
      expect(screen.getAllByText("my_song.mp3").length).toBeGreaterThan(0)
    );

    // Find and click the Delete button on the desktop table (it's hidden on mobile by default).
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    const desktopDeleteBtn = deleteButtons[deleteButtons.length - 1]; // Last one is in the desktop table
    fireEvent.click(desktopDeleteBtn);

    // After the first click, a confirmation prompt should appear.
    await waitFor(() => {
      expect(screen.getByText(/delete\?/i)).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: /yes/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /no/i }).length).toBeGreaterThan(0);
  });

  it("calls api.del and removes the song from the list on confirm", async () => {
    const { toast } = await import("sonner");
    const apiDel = vi.fn();
    vi.mocked(apiClient).del = apiDel;

    apiGet.mockResolvedValue([
      {
        id: "s1",
        partner_id: null,
        processed_filename: "my_song.mp3",
        division: "Classic",
        routine_name: "The Open 2025",
        personal_descriptor: "98%",
        created_at: new Date("2026-01-15").getTime(),
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);
    apiDel.mockResolvedValue(undefined);

    renderPage();

    // Wait for the song to render.
    await waitFor(() =>
      expect(screen.getAllByText("my_song.mp3").length).toBeGreaterThan(0)
    );

    // Click the Delete button.
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    const desktopDeleteBtn = deleteButtons[deleteButtons.length - 1];
    fireEvent.click(desktopDeleteBtn);

    // Wait for the confirmation prompt.
    await waitFor(() => {
      expect(screen.getByText(/delete\?/i)).toBeInTheDocument();
    });

    // Click the "Yes" confirm button (desktop table renders last in jsdom).
    const yesButtons = screen.getAllByRole("button", { name: /yes/i });
    const desktopYesBtn = yesButtons[yesButtons.length - 1];
    fireEvent.click(desktopYesBtn);

    // Song should be removed from the list and success toast shown.
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Song removed.");
    });

    // The song filename should no longer be in the document.
    expect(screen.queryByText("my_song.mp3")).not.toBeInTheDocument();

    // apiDel should have been called with the correct path.
    expect(apiDel).toHaveBeenCalledWith("/v1/songs/s1");
  });

  it("shows toast error and keeps song in list when api.del rejects with check-in message", async () => {
    const { toast } = await import("sonner");
    const apiDel = vi.fn();
    vi.mocked(apiClient).del = apiDel;

    apiGet.mockResolvedValue([
      {
        id: "s1",
        partner_id: null,
        processed_filename: "my_song.mp3",
        division: "Classic",
        routine_name: "The Open 2025",
        personal_descriptor: "98%",
        created_at: new Date("2026-01-15").getTime(),
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);

    const checkInError = new Error(
      "This song is referenced by an active check-in. Complete or withdraw the check-in first."
    );
    apiDel.mockRejectedValueOnce(checkInError);

    renderPage();

    // Wait for the song to render.
    await waitFor(() =>
      expect(screen.getAllByText("my_song.mp3").length).toBeGreaterThan(0)
    );

    // Click the Delete button.
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    const desktopDeleteBtn = deleteButtons[deleteButtons.length - 1];
    fireEvent.click(desktopDeleteBtn);

    // Wait for the confirmation prompt.
    await waitFor(() => {
      expect(screen.getByText(/delete\?/i)).toBeInTheDocument();
    });

    // Click the "Yes" confirm button (desktop table renders last in jsdom).
    const yesButtons = screen.getAllByRole("button", { name: /yes/i });
    const desktopYesBtn = yesButtons[yesButtons.length - 1];
    fireEvent.click(desktopYesBtn);

    // Error toast should be shown.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "This song is referenced by an active check-in. Complete or withdraw the check-in first."
      );
    });

    // The song should still be in the list.
    expect(screen.getAllByText("my_song.mp3").length).toBeGreaterThan(0);
  });

  it("hides the confirmation prompt when Cancel is clicked", async () => {
    apiGet.mockResolvedValue([
      {
        id: "s1",
        partner_id: null,
        processed_filename: "my_song.mp3",
        division: "Classic",
        routine_name: "The Open 2025",
        personal_descriptor: "98%",
        created_at: new Date("2026-01-15").getTime(),
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);
    renderPage();

    // Wait for the song to render.
    await waitFor(() =>
      expect(screen.getAllByText("my_song.mp3").length).toBeGreaterThan(0)
    );

    // Click the Delete button.
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    const desktopDeleteBtn = deleteButtons[deleteButtons.length - 1];
    fireEvent.click(desktopDeleteBtn);

    // Wait for the confirmation prompt.
    await waitFor(() => {
      expect(screen.getByText(/delete\?/i)).toBeInTheDocument();
    });

    // Click the "No" cancel button (desktop table renders last in jsdom).
    const noButtons = screen.getAllByRole("button", { name: /no/i });
    const desktopNoBtn = noButtons[noButtons.length - 1];
    fireEvent.click(desktopNoBtn);

    // The confirmation prompt should disappear.
    await waitFor(() => {
      expect(screen.queryByText(/delete\?/i)).not.toBeInTheDocument();
    });

    // The Delete button should be back (one per layout — mobile + desktop both rendered in jsdom).
    expect(screen.getAllByRole("button", { name: /delete/i }).length).toBeGreaterThan(0);
  });
});
