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
import PartnersSection from "./PartnersSection";
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
      <PartnersSection />
    </MemoryRouter>
  );
}

const mockPartners = [
  fx.partner({
    id: "p1",
    first_name: "Alice",
    last_name: "Smith",
    partner_role: "follower" as const,
    email: "alice@example.com",
  }),
  fx.partner({
    id: "p2",
    first_name: "Bob",
    last_name: "Jones",
    partner_role: "leader" as const,
    email: null,
  }),
];

describe("PartnersSection — list rendering", () => {
  it("fetches partners on mount and renders their names", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve(mockPartners);
      return Promise.resolve(undefined);
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Bob Jones/)).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/v1/partners");
  });

  it("renders an empty-state message when there are no partners", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/no partners yet/i)).toBeInTheDocument();
    });
  });

  it("shows a skeleton while the partners list is loading", () => {
    apiGet.mockImplementation(() => new Promise(() => {}));
    const { container } = renderSection();
    const pulses = container.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBeGreaterThan(0);
  });
});

describe("PartnersSection — create partner", () => {
  it("opens the add dialog and creates a partner", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    apiPost.mockResolvedValue(fx.partner({
      id: "p-new",
      first_name: "Carol",
      last_name: "Lee",
      partner_role: "leader",
      email: null,
    }));

    const user = userEvent.setup();
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/no partners yet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^add partner$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^add partner$/i })).toBeInTheDocument();
    });

    const dialog = screen
      .getByRole("heading", { name: /^add partner$/i })
      .closest('[role="dialog"]') as HTMLElement;
    await user.type(within(dialog).getByLabelText(/^first name$/i), "Carol");
    await user.type(within(dialog).getByLabelText(/^last name$/i), "Lee");

    fireEvent.submit(
      within(dialog).getByRole("button", { name: /^add partner$/i }).closest("form") as HTMLFormElement
    );

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/partners", {
        first_name: "Carol",
        last_name: "Lee",
        partner_role: "follower",
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Partner added");
    await waitFor(() => {
      expect(screen.getByText(/Carol Lee/)).toBeInTheDocument();
    });
  });
});

describe("PartnersSection — delete confirm flow", () => {
  it("checks associations then deletes the partner", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve(mockPartners);
      if (path === "/v1/partners/p1/associations") {
        return Promise.resolve({
          song_count: 0,
          has_active_checkin: false,
          has_checkin_history: false,
        });
      }
      return Promise.resolve(undefined);
    });
    apiDel.mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderSection();

    await waitFor(() => {
      expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
    });

    const aliceCard = screen.getByText(/Alice Smith/).closest("div.rounded-lg") as HTMLElement;
    await user.click(within(aliceCard).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /remove partner/i })).toBeInTheDocument();
    });
    expect(apiGet).toHaveBeenCalledWith("/v1/partners/p1/associations");

    const dialog = screen
      .getByRole("heading", { name: /remove partner/i })
      .closest('[role="dialog"]') as HTMLElement;
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(apiDel).toHaveBeenCalledWith("/v1/partners/p1");
    });
    expect(toast.success).toHaveBeenCalledWith("Partner removed.");
    await waitFor(() => {
      expect(screen.queryByText(/Alice Smith/)).toBeNull();
    });
  });
});

type Associations = { song_count: number; has_active_checkin: boolean; has_checkin_history: boolean };

/** Partners for the list, and Alice's associations (or a failure to load them). */
function mockGets(associations: Associations | Error = {
  song_count: 0,
  has_active_checkin: false,
  has_checkin_history: false,
}) {
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/partners") return Promise.resolve(mockPartners);
    if (path === "/v1/partners/p1/associations") {
      return associations instanceof Error ? Promise.reject(associations) : Promise.resolve(associations);
    }
    return Promise.resolve(undefined);
  });
}

function dialogTitled(name: RegExp): HTMLElement {
  return screen.getByRole("heading", { name }).closest('[role="dialog"]') as HTMLElement;
}

async function openDeleteFor(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const card = (await screen.findByText(name)).closest("div.rounded-lg") as HTMLElement;
  await user.click(within(card).getByRole("button", { name: /^delete$/i }));
  return dialogTitled(/remove partner/i);
}

describe("PartnersSection — loading", () => {
  it("reports a failure to load partners", async () => {
    apiGet.mockRejectedValue(new Error("Network down"));
    renderSection();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Network down");
    });
  });
});

describe("PartnersSection — edit partner", () => {
  it("opens prefilled, saves trimmed changes, and clears an emptied email to null", async () => {
    mockGets();
    apiPatch.mockResolvedValue(
      fx.partner({ ...mockPartners[0], last_name: "Smythe", email: null })
    );
    const user = userEvent.setup();
    renderSection();

    const card = (await screen.findByText(/Alice Smith/)).closest("div.rounded-lg") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: /^edit$/i }));
    const dialog = dialogTitled(/^edit partner$/i);
    expect(within(dialog).getByLabelText(/^first name$/i)).toHaveValue("Alice");
    expect(within(dialog).getByLabelText(/email/i)).toHaveValue("alice@example.com");

    const last = within(dialog).getByLabelText(/^last name$/i);
    await user.clear(last);
    await user.type(last, "  Smythe ");
    await user.clear(within(dialog).getByLabelText(/email/i));
    await user.click(within(dialog).getByRole("button", { name: /^save changes$/i }));

    await waitFor(() => {
      expect(apiPatch).toHaveBeenCalledWith("/v1/partners/p1", {
        first_name: "Alice",
        last_name: "Smythe",
        partner_role: "follower",
        email: null,
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Partner updated");
    expect(await screen.findByText(/Alice Smythe/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^edit partner$/i })).not.toBeInTheDocument();
  });

  it("keeps the dialog open and reports a failed save", async () => {
    mockGets();
    apiPatch.mockRejectedValue(new Error("Name already used"));
    const user = userEvent.setup();
    renderSection();

    const card = (await screen.findByText(/Bob Jones/)).closest("div.rounded-lg") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: /^edit$/i }));
    await user.click(within(dialogTitled(/^edit partner$/i)).getByRole("button", { name: /^save changes$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Name already used");
    });
    expect(screen.getByRole("heading", { name: /^edit partner$/i })).toBeInTheDocument();
  });
});

describe("PartnersSection — create partner details", () => {
  it("sends the chosen role and a trimmed email", async () => {
    apiGet.mockResolvedValue([]);
    apiPost.mockResolvedValue(fx.partner({ id: "p3", first_name: "Dee", last_name: "Ray", partner_role: "leader" }));
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: /^add partner$/i }));
    const dialog = dialogTitled(/^add partner$/i);
    await user.type(within(dialog).getByLabelText(/^first name$/i), "Dee");
    await user.type(within(dialog).getByLabelText(/^last name$/i), "Ray");
    await user.click(within(dialog).getByRole("radio", { name: "Leader" }));
    await user.type(within(dialog).getByLabelText(/email/i), " dee@example.com ");
    await user.click(within(dialog).getByRole("button", { name: /^add partner$/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/v1/partners", {
        first_name: "Dee",
        last_name: "Ray",
        partner_role: "leader",
        email: "dee@example.com",
      });
    });
  });

  it("refuses an invalid email without calling the API", async () => {
    apiGet.mockResolvedValue([]);
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: /^add partner$/i }));
    const dialog = dialogTitled(/^add partner$/i);
    await user.type(within(dialog).getByLabelText(/^first name$/i), "Dee");
    await user.type(within(dialog).getByLabelText(/^last name$/i), "Ray");
    await user.type(within(dialog).getByLabelText(/email/i), "not-an-email");
    fireEvent.submit(within(dialog).getByRole("button", { name: /^add partner$/i }).closest("form") as HTMLFormElement);

    expect(await within(dialog).findByText("Invalid email")).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe("PartnersSection — delete warnings", () => {
  it("blocks deleting a partner with an active check-in", async () => {
    mockGets({ song_count: 2, has_active_checkin: true, has_checkin_history: true });
    const user = userEvent.setup();
    renderSection();

    const dialog = await openDeleteFor(user, /Alice Smith/);
    expect(await within(dialog).findByText(/has an active check-in and cannot be deleted/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^delete$/i })).toBeDisabled();
  });

  it("says check-in history is kept", async () => {
    mockGets({ song_count: 1, has_active_checkin: false, has_checkin_history: true });
    const user = userEvent.setup();
    renderSection();

    const dialog = await openDeleteFor(user, /Alice Smith/);
    expect(await within(dialog).findByText(/historical data will be preserved/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^delete$/i })).toBeEnabled();
  });

  it.each([
    [1, "1 song."],
    [3, "3 songs."],
  ])("says how many songs (%i) lose the partner", async (count, text) => {
    mockGets({ song_count: count, has_active_checkin: false, has_checkin_history: false });
    const user = userEvent.setup();
    renderSection();

    const dialog = await openDeleteFor(user, /Alice Smith/);
    expect(await within(dialog).findByText(/is linked to/i)).toHaveTextContent(text);
  });

  it("falls back to the plain warning when associations can't be checked", async () => {
    mockGets(new Error("boom"));
    const user = userEvent.setup();
    renderSection();

    const dialog = await openDeleteFor(user, /Alice Smith/);
    expect(await within(dialog).findByText(/this action cannot be undone/i)).toBeInTheDocument();
  });

  it("keeps the partner and reports a failed delete", async () => {
    mockGets();
    apiDel.mockRejectedValue(new Error("Still in use"));
    const user = userEvent.setup();
    renderSection();

    const dialog = await openDeleteFor(user, /Alice Smith/);
    await within(dialog).findByText(/this action cannot be undone/i);
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Still in use");
    });
    expect(screen.queryByRole("heading", { name: /remove partner/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
  });

  it("cancel closes the dialog without deleting", async () => {
    mockGets();
    const user = userEvent.setup();
    renderSection();

    const dialog = await openDeleteFor(user, /Alice Smith/);
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    expect(screen.queryByRole("heading", { name: /remove partner/i })).not.toBeInTheDocument();
    expect(apiDel).not.toHaveBeenCalled();
  });
});
