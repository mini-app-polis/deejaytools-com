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
    apiPost.mockResolvedValue({
      id: "p-new",
      first_name: "Carol",
      last_name: "Lee",
      partner_role: "leader",
      email: null,
    });

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
