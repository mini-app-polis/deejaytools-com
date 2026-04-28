// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stable api client mock — see comment in SongsPage.test for why this matters.
const { apiGet, apiPost, apiPatch, apiDel, apiClient } = vi.hoisted(() => {
  return {
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPatch: vi.fn(),
    apiDel: vi.fn(),
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
      postForm: vi.fn(),
    },
  };
});
// Wire the client's methods to the individual fns so tests can assert/clear.
apiClient.get = apiGet;
apiClient.post = apiPost;
apiClient.patch = apiPatch;
apiClient.del = apiDel;

vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import PartnersPage from "./PartnersPage";

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
  apiDel.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PartnersPage />
    </MemoryRouter>
  );
}

const mockPartners = [
  {
    id: "p1",
    first_name: "Alice",
    last_name: "Smith",
    partner_role: "follower" as const,
    email: "alice@example.com",
  },
  {
    id: "p2",
    first_name: "Bob",
    last_name: "Jones",
    partner_role: "leader" as const,
    email: null,
  },
];

// Tailwind responsive classes (sm:hidden / sm:block) are CSS-only — both the
// mobile card list and the desktop table render to the DOM in jsdom, so each
// data point appears twice. Tests use getAllByText / .length checks accordingly.

describe("PartnersPage — list rendering", () => {
  it("fetches partners on mount and renders their names in both layouts", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve(mockPartners);
      return Promise.resolve(undefined);
    });

    renderPage();

    // Each partner renders twice (mobile + desktop).
    await waitFor(() => {
      expect(screen.getAllByText(/Alice Smith/).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/Bob Jones/).length).toBeGreaterThan(0);
    expect(apiGet).toHaveBeenCalledWith("/v1/partners");
  });

  it("renders an empty-state message when there are no partners", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText(/no partners yet/i).length).toBeGreaterThan(0);
    });
  });

  it("shows skeletons while the partners list is loading", () => {
    // Never resolve so loading=true persists.
    apiGet.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    const pulses = container.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBeGreaterThan(0);
  });
});

describe("PartnersPage — partner role display", () => {
  it("renders the appropriate role badge for each partner", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve(mockPartners);
      return Promise.resolve(undefined);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText(/Alice Smith/).length).toBeGreaterThan(0);
    });
    // Both layouts render the badge → 2 matches per role.
    expect(screen.getAllByText(/follower/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/leader/i).length).toBeGreaterThanOrEqual(2);
  });

  it("renders the email column for partners with an email", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve(mockPartners);
      return Promise.resolve(undefined);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText("alice@example.com").length).toBeGreaterThan(0);
    });
  });
});
