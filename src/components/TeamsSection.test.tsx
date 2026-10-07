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
import TeamsSection from "./TeamsSection";
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
      <TeamsSection />
    </MemoryRouter>
  );
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

describe("TeamsSection — managing teams", () => {
  const ROCKETS = fx.team({ id: "t1", identifier: "Rockets" });
  const COMETS = fx.team({ id: "t2", identifier: "Comets" });

  function withTeams(teams: unknown) {
    apiGet.mockImplementation((path: string) =>
      path === "/v1/teams" ? Promise.resolve(teams) : Promise.resolve(undefined)
    );
  }

  function dialog() {
    return screen.getByRole("dialog");
  }

  it("lists teams with a link to the help page", async () => {
    withTeams([ROCKETS, COMETS]);
    renderSection();
    expect(await screen.findByText("Rockets")).toBeInTheDocument();
    expect(screen.getByText("Comets")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /learn more/i })).toHaveAttribute(
      "href",
      "/how-it-works/partners"
    );
  });

  it("reports a failure to load teams", async () => {
    apiGet.mockRejectedValue(new Error("teams down"));
    renderSection();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("teams down"));
  });

  it("adds a team and puts it at the top of the list", async () => {
    withTeams([ROCKETS]);
    apiPost.mockResolvedValue(fx.team({ id: "t9", identifier: "Swing Kids" }));
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Rockets");
    await user.click(screen.getByRole("button", { name: /^add team$/i }));
    await user.type(within(dialog()).getByLabelText(/^team name$/i), "Swing Kids");
    await user.click(within(dialog()).getByRole("button", { name: /^add team$/i }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/teams", { identifier: "Swing Kids" })
    );
    expect(toast.success).toHaveBeenCalledWith("Team added");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const names = screen.getAllByText(/^(Swing Kids|Rockets)$/).map((n) => n.textContent);
    expect(names).toEqual(["Swing Kids", "Rockets"]);
  });

  it.each([
    // The character check runs first, so an empty name gets the same message.
    ["", /letters, numbers, and spaces/i],
    ["Team #1!", /letters, numbers, and spaces/i],
  ])("does not submit an invalid team name %j", async (name, message) => {
    withTeams([]);
    const user = userEvent.setup();
    renderSection();

    await screen.findByText(/no teams yet/i);
    await user.click(screen.getByRole("button", { name: /^add team$/i }));
    if (name) await user.type(within(dialog()).getByLabelText(/^team name$/i), name);
    await user.click(within(dialog()).getByRole("button", { name: /^add team$/i }));

    expect(await within(dialog()).findByText(message)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("renames a team in place with a PATCH", async () => {
    withTeams([ROCKETS, COMETS]);
    apiPatch.mockResolvedValue({ ...ROCKETS, identifier: "Red Rockets" });
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Rockets");
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(within(dialog()).getByRole("heading", { name: "Edit team" })).toBeInTheDocument();
    const input = within(dialog()).getByLabelText(/^team name$/i);
    expect(input).toHaveValue("Rockets");
    await user.clear(input);
    await user.type(input, "Red Rockets");
    await user.click(within(dialog()).getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/v1/teams/t1", { identifier: "Red Rockets" })
    );
    expect(apiPost).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Team updated");
    expect(await screen.findByText("Red Rockets")).toBeInTheDocument();
    expect(screen.getByText("Comets")).toBeInTheDocument();
  });

  it("deletes a team after confirmation", async () => {
    withTeams([ROCKETS, COMETS]);
    apiDel.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection();

    await screen.findByText("Rockets");
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(dialog()).toHaveTextContent("Rockets will be removed from your list.");
    await user.click(within(dialog()).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/teams/t1"));
    expect(toast.success).toHaveBeenCalledWith("Team removed.");
    await waitFor(() => expect(screen.queryByText("Rockets")).not.toBeInTheDocument());
    expect(screen.getByText("Comets")).toBeInTheDocument();
  });

  it("keeps the team when cancelled or when deletion fails", async () => {
    withTeams([ROCKETS]);
    apiDel.mockRejectedValue(new Error("Team has songs"));
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(apiDel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(dialog()).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Team has songs"));
    expect(screen.getByText("Rockets")).toBeInTheDocument();
  });
});
