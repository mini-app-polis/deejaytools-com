// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// MusicHistoryPage uses the global fetch (not the api client wrapper) since
// the underlying /v1/legacy-songs endpoint is intentionally public.
const fetchMock = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

import MusicHistoryPage from "./MusicHistoryPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <MusicHistoryPage />
    </MemoryRouter>
  );
}

function legacyJsonResponse(rows: unknown[]) {
  return new Response(JSON.stringify({ data: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MusicHistoryPage — initial state", () => {
  it("renders the search form and the page heading", () => {
    renderPage();
    expect(screen.getByText(/Is your music on file/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by partnership/i)).toBeInTheDocument();
    // No fetch on mount — search is empty + division=All.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not render any results until the user types or picks a division", () => {
    renderPage();
    expect(screen.queryByText(/no results found/i)).toBeNull();
  });
});

describe("MusicHistoryPage — debounced search", () => {
  it("issues a single fetch with q=<term> after the debounce window", async () => {
    fetchMock.mockResolvedValue(legacyJsonResponse([]));
    renderPage();

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText(/search by partnership/i),
      "Smith"
    );

    // The 350ms debounce + microtasks settle within ~1s in jsdom.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    }, { timeout: 2000 });

    const url = fetchMock.mock.calls.at(-1)![0] as string;
    expect(url).toContain("q=Smith");
  });

  it("renders 'No results found' when search returns an empty list", async () => {
    fetchMock.mockResolvedValue(legacyJsonResponse([]));
    renderPage();

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText(/search by partnership/i),
      "asdfqwerty"
    );

    // Wait past debounce + fetch.
    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("renders matching rows when the search returns data", async () => {
    fetchMock.mockResolvedValue(
      legacyJsonResponse([
        {
          id: "L1",
          partnership: "Alice & Bob",
          division: "Classic",
          routine_name: "Sky High",
          descriptor: null,
          version: "1",
          submitted_at: null,
        },
      ])
    );
    renderPage();

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText(/search by partnership/i),
      "Alice"
    );

    await waitFor(() => {
      expect(screen.getAllByText("Alice & Bob").length).toBeGreaterThan(0);
    }, { timeout: 2000 });
  });
});
