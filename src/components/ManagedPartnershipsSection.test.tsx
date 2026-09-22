// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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
import ManagedPartnershipsSection from "./ManagedPartnershipsSection";

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
  apiDel.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

function renderSection() {
  return render(
    <MemoryRouter>
      <ManagedPartnershipsSection />
    </MemoryRouter>
  );
}

describe("ManagedPartnershipsSection", () => {
  it("renders the empty state from a mocked GET /v1/managed-partnerships", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/managed-partnerships") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/no managed partnerships yet/i)).toBeInTheDocument();
    });
    expect(apiGet).toHaveBeenCalledWith("/v1/managed-partnerships");
  });

  it("opens the add dialog, submits, and surfaces a toast when api.post rejects", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/managed-partnerships") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    apiPost.mockRejectedValue(
      new Error("Managed partnerships are not persisted yet — database schema pending.")
    );

    const user = userEvent.setup();
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/no managed partnerships yet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^add partnership$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^add partnership$/i })).toBeInTheDocument();
    });

    const dialog = screen
      .getByRole("heading", { name: /^add partnership$/i })
      .closest('[role="dialog"]') as HTMLElement;

    const firstNames = within(dialog).getAllByLabelText(/^first name$/i);
    const lastNames = within(dialog).getAllByLabelText(/^last name$/i);
    await user.type(firstNames[0], "Wendal");
    await user.type(lastNames[0], "Smith");
    await user.type(firstNames[1], "Lara");
    await user.type(lastNames[1], "Jones");

    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: /^add partnership$/i })
        .closest("form") as HTMLFormElement
    );

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/managed-partnerships", {
        leader_first_name: "Wendal",
        leader_last_name: "Smith",
        follower_first_name: "Lara",
        follower_last_name: "Jones",
      });
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Managed partnerships are not persisted yet — database schema pending."
    );
  });
});
