// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// NavBar pulls in Clerk hooks + useAuthMe — replace with a stub so the test
// only exercises the LandingPage logic.
vi.mock("@/components/NavBar", () => ({
  default: () => <nav data-testid="navbar-stub" />,
}));

// LandingPage's footer CTA renders <SignedIn> / <SignedOut> directly, so we
// also need to mock @clerk/clerk-react. Default to "signed out" so the
// SignInButton path renders (and we can verify it doesn't crash).
vi.mock("@clerk/clerk-react", () => ({
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="sign-in-button">{children}</span>
  ),
}));

// Real LandingPage uses the global fetch (not the api client wrapper).
const fetchMock = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

import LandingPage from "./LandingPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

function legacyJsonResponse(rows: unknown[]) {
  return new Response(JSON.stringify({ data: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LandingPage — initial state", () => {
  it("renders hero copy and the music-lookup form", () => {
    renderPage();
    expect(screen.getByText(/Music management/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by partnership/i)).toBeInTheDocument();
    // No fetch on mount — search is empty + division=All.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not render any results until the user types or picks a division", () => {
    renderPage();
    expect(screen.queryByText(/no results found/i)).toBeNull();
  });
});

describe("LandingPage — debounced search", () => {
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
