// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const apiGet = vi.fn();
const apiPost = vi.fn();
// Build the client object ONCE and return the same reference on every call.
// AddSongPage has `useEffect([api])` that re-runs the data load when `api`
// changes, and shows a full-page Skeleton while loading. A non-stable client
// reference would cause the effect to re-run on every render → loading stays
// true forever in tests.
const apiClient = {
  get: apiGet,
  post: apiPost,
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

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: () => Promise.resolve("fake-token") }),
}));

import AddSongPage from "./AddSongPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <AddSongPage />
    </MemoryRouter>
  );
}

describe("AddSongPage — Claim from history", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
  });

  it("opens the claim dialog and searches /v1/legacy-songs as the user types", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve([]);
      if (path === "/v1/auth/me") return Promise.resolve({ id: "u1", first_name: "U", last_name: "1" });
      if (path.startsWith("/v1/legacy-songs")) {
        return Promise.resolve([
          {
            id: "L1",
            partnership: "Alice & Bob",
            division: "Classic",
            routine_name: "The Open 2025",
            descriptor: null,
            version: "The Open 2025",
            submitted_at: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    // Wait past initial loads (skeleton then header).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /claim from history/i })).toBeInTheDocument()
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /claim from history/i }));

    // Search input appears.
    const search = await screen.findByLabelText(/search past songs/i);
    await user.type(search, "Alice");

    // Result row renders (debounced search hits the API).
    await waitFor(() => {
      expect(screen.getByText("Alice & Bob")).toBeInTheDocument();
    });
    expect(screen.getByText(/Classic · The Open 2025/)).toBeInTheDocument();
  });

  it("calls POST /v1/songs/claim-legacy with the selected legacy id and partner", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") {
        return Promise.resolve([
          {
            id: "partner-1",
            first_name: "Bob",
            last_name: "Jones",
            partner_role: "follower",
          },
        ]);
      }
      if (path === "/v1/auth/me") return Promise.resolve({ id: "u1", first_name: "U", last_name: "1" });
      if (path.startsWith("/v1/legacy-songs")) {
        return Promise.resolve([
          {
            id: "L1",
            partnership: "Alice & Bob",
            division: "Classic",
            routine_name: "The Open 2025",
            descriptor: null,
            version: "The Open 2025",
            submitted_at: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    apiPost.mockResolvedValue({
      id: "song-new",
      partner_id: "partner-1",
      processed_filename: null,
      division: "Classic",
      routine_name: "The Open 2025",
      personal_descriptor: null,
      created_at: Date.now(),
      partner_first_name: "Bob",
      partner_last_name: "Jones",
    });

    renderPage();

    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /claim from history/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: /claim from history/i }));

    // Type to trigger search.
    const search = await screen.findByLabelText(/search past songs/i);
    await user.type(search, "Alice");

    // Wait for the claim button on the result row.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^claim$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^claim$/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        "/v1/songs/claim-legacy",
        expect.objectContaining({ legacy_song_id: "L1" })
      );
    });
  });

  it("shows the typing-prompt empty state when the search input is blank", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve([]);
      if (path === "/v1/auth/me") return Promise.resolve({ id: "u1", first_name: "U", last_name: "1" });
      if (path.startsWith("/v1/legacy-songs")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /claim from history/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: /claim from history/i }));

    expect(
      await screen.findByText(/type a partnership or routine name to search/i)
    ).toBeInTheDocument();
  });
});
