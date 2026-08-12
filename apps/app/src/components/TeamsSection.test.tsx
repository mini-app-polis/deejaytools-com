// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { toast } from "sonner";
import TeamsSection from "./TeamsSection";

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
  apiDel.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

function renderSection() {
  return render(<TeamsSection />);
}

describe("TeamsSection", () => {
  it("renders the empty state from a mocked GET /v1/teams", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/teams") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/no teams yet/i)).toBeInTheDocument();
    });
    expect(apiGet).toHaveBeenCalledWith("/v1/teams");
  });

  it("opens the add dialog, submits, and surfaces a toast when api.post rejects", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/teams") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    apiPost.mockRejectedValue(
      new Error("Teams are not persisted yet — database schema pending.")
    );

    const user = userEvent.setup();
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/no teams yet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^add team$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^add team$/i })).toBeInTheDocument();
    });

    const dialog = screen
      .getByRole("heading", { name: /^add team$/i })
      .closest('[role="dialog"]') as HTMLElement;
    await user.type(
      within(dialog).getByLabelText(/^team name$/i),
      "JTSwing Team Junior Varsity Season 13"
    );

    fireEvent.submit(
      within(dialog).getByRole("button", { name: /^add team$/i }).closest("form") as HTMLFormElement
    );

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/teams", {
        identifier: "JTSwing Team Junior Varsity Season 13",
      });
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Teams are not persisted yet — database schema pending."
    );
  });
});
