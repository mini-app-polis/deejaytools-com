// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
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

    await waitFor(() =>
      expect(screen.getByText(/no songs yet/i)).toBeInTheDocument()
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

    await waitFor(() =>
      expect(screen.getByText("my_song.mp3")).toBeInTheDocument()
    );
    expect(screen.getByText("Classic")).toBeInTheDocument();
    expect(screen.getByText("The Open 2025")).toBeInTheDocument();
    expect(screen.getByText("98%")).toBeInTheDocument();
  });
});
