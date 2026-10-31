// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAuthMe } from "@/schemas";

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
    event_roles: [],
  };
  return {
    apiGet: vi.fn(),
    apiPatch: vi.fn(),
    reload: vi.fn(async () => undefined),
    meState: { me: me as ApiAuthMe | null, loading: false, error: null as string | null },
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
    error: meState.error,
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
    event_roles: [],
  };
  meState.loading = false;
  meState.error = null;
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

  it("shows a skeleton instead of the form while the profile is loading", () => {
    meState.me = null;
    meState.loading = true;
    const { container } = renderPage();

    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(screen.queryByLabelText(/^first name$/i)).toBeNull();
  });

  it("shows a failed profile load with a retry instead of an empty form", async () => {
    meState.me = null;
    meState.error = "server down";
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your account: server down");
    expect(screen.queryByLabelText(/^first name$/i)).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("leaves the names empty and shows a dash when the profile has no names or email", async () => {
    meState.me = { ...meState.me!, first_name: null, last_name: null, email: null as unknown as string };
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/^first name$/i)).toHaveValue(""));
    expect(screen.getByLabelText(/^last name$/i)).toHaveValue("");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("does not submit, and says why, when a name is blank", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/^first name$/i)).toHaveValue("Alice"));

    await user.clear(screen.getByLabelText(/^first name$/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("First name is required")).toBeInTheDocument();
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it("shows Saving... while the update is in flight", async () => {
    let resolve: (v: unknown) => void = () => {};
    apiPatch.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/^first name$/i)).toHaveValue("Alice"));

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    resolve({ ...meState.me, event_roles: undefined });
    expect(await screen.findByRole("button", { name: /save changes/i })).toBeEnabled();
  });

  it("toasts the API's message when the update fails", async () => {
    apiPatch.mockRejectedValue(new Error("Name too long"));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/^first name$/i)).toHaveValue("Alice"));

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Name too long"));
    expect(reload).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("toasts a generic message when the failure is not an Error", async () => {
    apiPatch.mockRejectedValue("nope");
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/^first name$/i)).toHaveValue("Alice"));

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to update profile"));
  });
});
