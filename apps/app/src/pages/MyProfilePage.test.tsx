// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthMe } from "@deejaytools/schemas";

const { apiGet, apiPatch, apiClient, reload, meState } = vi.hoisted(() => {
  const me: ApiAuthMe = {
    id: "user_1",
    email: "alice@example.com",
    display_name: null,
    first_name: "Alice",
    last_name: "Smith",
    role: "user",
    created_at: 1,
    updated_at: 2,
  };
  return {
    apiGet: vi.fn(),
    apiPatch: vi.fn(),
    reload: vi.fn(async () => undefined),
    meState: { me, loading: false },
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
apiClient.patch = apiPatch;

vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({
    me: meState.me,
    loading: meState.loading,
    reload,
    isAdmin: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { toast } from "sonner";
import MyProfilePage from "./MyProfilePage";

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset();
  reload.mockReset();
  reload.mockResolvedValue(undefined);
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/partners") return Promise.resolve([]);
    if (path === "/v1/teams") return Promise.resolve([]);
    if (path === "/v1/managed-partnerships") return Promise.resolve([]);
    return Promise.resolve(undefined);
  });
  meState.me = {
    id: "user_1",
    email: "alice@example.com",
    display_name: null,
    first_name: "Alice",
    last_name: "Smith",
    role: "user",
    created_at: 1,
    updated_at: 2,
  };
  meState.loading = false;
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MyProfilePage />
    </MemoryRouter>
  );
}

describe("MyProfilePage", () => {
  it("prefills first and last name from the current profile", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/^first name$/i)).toHaveValue("Alice");
    });
    expect(screen.getByLabelText(/^last name$/i)).toHaveValue("Smith");
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("submits an edit and PATCHes the new names", async () => {
    apiPatch.mockResolvedValue({
      id: "user_1",
      email: "alice@example.com",
      display_name: null,
      first_name: "Ada",
      last_name: "Lovelace",
      role: "user",
      created_at: 1,
      updated_at: 3,
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/^first name$/i)).toHaveValue("Alice");
    });

    const firstName = screen.getByLabelText(/^first name$/i);
    const lastName = screen.getByLabelText(/^last name$/i);
    await user.clear(firstName);
    await user.type(firstName, "Ada");
    await user.clear(lastName);
    await user.type(lastName, "Lovelace");

    fireEvent.submit(screen.getByRole("button", { name: /save changes/i }).closest("form")!);

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith("/v1/auth/me", {
        firstName: "Ada",
        lastName: "Lovelace",
      });
    });
    expect(reload).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Profile updated");
  });
});
