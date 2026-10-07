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
import { fx } from "@/test/fixtures";

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

describe("ManagedPartnershipsSection — managing partnerships", () => {
  const MP1 = fx.managedPartnership({
    id: "mp1",
    leader_first_name: "Lee",
    leader_last_name: "Der",
    follower_first_name: "Fay",
    follower_last_name: "Lo",
  });
  const MP2 = fx.managedPartnership({
    id: "mp2",
    leader_first_name: "Max",
    leader_last_name: "Ray",
    follower_first_name: "Ivy",
    follower_last_name: "Day",
  });
  const MP1_LABEL = "Lee Der (Leader) + Fay Lo (Follower)";
  const MP2_LABEL = "Max Ray (Leader) + Ivy Day (Follower)";

  function withItems(items: unknown) {
    apiGet.mockImplementation((path: string) =>
      path === "/v1/managed-partnerships" ? Promise.resolve(items) : Promise.resolve(undefined)
    );
  }

  function dialog() {
    return screen.getByRole("dialog");
  }

  async function fillNames(
    user: ReturnType<typeof userEvent.setup>,
    [lf, ll, ff, fl]: [string, string, string, string]
  ) {
    const firsts = within(dialog()).getAllByLabelText(/^first name$/i);
    const lasts = within(dialog()).getAllByLabelText(/^last name$/i);
    for (const [el, v] of [
      [firsts[0], lf],
      [lasts[0], ll],
      [firsts[1], ff],
      [lasts[1], fl],
    ] as const) {
      await user.clear(el);
      if (v) await user.type(el, v);
    }
  }

  it("lists each partnership as leader + follower", async () => {
    withItems([MP1, MP2]);
    renderSection();
    expect(await screen.findByText(MP1_LABEL)).toBeInTheDocument();
    expect(screen.getByText(MP2_LABEL)).toBeInTheDocument();
  });

  it("reports a failure to load", async () => {
    apiGet.mockRejectedValue(new Error("list down"));
    renderSection();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("list down"));
  });

  it("adds a partnership with trimmed names and shows it first", async () => {
    withItems([MP2]);
    apiPost.mockResolvedValue(MP1);
    const user = userEvent.setup();
    renderSection();

    await screen.findByText(MP2_LABEL);
    await user.click(screen.getByRole("button", { name: /^add partnership$/i }));
    await fillNames(user, [" Lee ", "Der", "Fay", " Lo"]);
    await user.click(within(dialog()).getByRole("button", { name: /^add partnership$/i }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/managed-partnerships", {
        leader_first_name: "Lee",
        leader_last_name: "Der",
        follower_first_name: "Fay",
        follower_last_name: "Lo",
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Partnership added");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const labels = screen.getAllByText(/\(Leader\)/).map((n) => n.textContent);
    expect(labels).toEqual([MP1_LABEL, MP2_LABEL]);
  });

  it("requires all four names", async () => {
    withItems([]);
    const user = userEvent.setup();
    renderSection();

    await screen.findByText(/no managed partnerships yet/i);
    await user.click(screen.getByRole("button", { name: /^add partnership$/i }));
    await fillNames(user, ["Lee", "", "Fay", "   "]);
    await user.click(within(dialog()).getByRole("button", { name: /^add partnership$/i }));

    await waitFor(() =>
      expect(within(dialog()).getAllByText(/too small|>=1/i)).toHaveLength(2)
    );
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("edits a partnership with a PATCH pre-filled from the row", async () => {
    withItems([MP1, MP2]);
    apiPatch.mockResolvedValue({ ...MP1, follower_first_name: "Faye" });
    const user = userEvent.setup();
    renderSection();

    await screen.findByText(MP1_LABEL);
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(within(dialog()).getByRole("heading", { name: "Edit partnership" })).toBeInTheDocument();
    const firsts = within(dialog()).getAllByLabelText(/^first name$/i);
    expect(firsts.map((i) => (i as HTMLInputElement).value)).toEqual(["Lee", "Fay"]);

    await user.type(firsts[1], "e");
    await user.click(within(dialog()).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/v1/managed-partnerships/mp1", {
        leader_first_name: "Lee",
        leader_last_name: "Der",
        follower_first_name: "Faye",
        follower_last_name: "Lo",
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Partnership updated");
    expect(await screen.findByText("Lee Der (Leader) + Faye Lo (Follower)")).toBeInTheDocument();
    expect(screen.getByText(MP2_LABEL)).toBeInTheDocument();
  });

  it("deletes a partnership after confirmation", async () => {
    withItems([MP1, MP2]);
    apiDel.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection();

    await screen.findByText(MP1_LABEL);
    await user.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    expect(dialog()).toHaveTextContent(`${MP2_LABEL} will be removed from your list.`);
    await user.click(within(dialog()).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/managed-partnerships/mp2"));
    expect(toast.success).toHaveBeenCalledWith("Partnership removed.");
    await waitFor(() => expect(screen.queryByText(MP2_LABEL)).not.toBeInTheDocument());
    expect(screen.getByText(MP1_LABEL)).toBeInTheDocument();
  });

  it("keeps the partnership when cancelled or when deletion fails", async () => {
    withItems([MP1]);
    apiDel.mockRejectedValue(new Error("Partnership is checked in"));
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(apiDel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(dialog()).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Partnership is checked in"));
    expect(screen.getByText(MP1_LABEL)).toBeInTheDocument();
  });
});
