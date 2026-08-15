// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiDel = vi.fn();
const apiClient = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  del: apiDel,
  postForm: vi.fn(),
};

vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({
    me: { id: "admin_1", email: "admin@example.com", role: "admin" },
    loading: false,
    isAdmin: true,
    isManager: false,
  }),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: () => Promise.resolve("fake-token") }),
}));

import ManagerPage from "./ManagerPage";

function renderPage(path: string = "/manager/active-sessions") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/manager/:section" element={<ManagerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ManagerPage — Event Songs section", () => {
  const EVENT = {
    id: "ev1",
    name: "Spring Classic",
    start_date: "2026-04-01",
    end_date: "2026-04-03",
    timezone: "America/Los_Angeles",
    status: "upcoming",
    created_by: "u1",
    created_at: 1,
    updated_at: 1,
  };

  function mockManagerGets(opts?: {
    events?: unknown[];
    submissions?: unknown[] | (() => Promise<unknown>);
  }) {
    const events = opts?.events ?? [EVENT];
    const submissions = opts?.submissions ?? [];
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") return Promise.resolve(events);
      if (path.startsWith("/v1/admin/event-song-submissions")) {
        return typeof submissions === "function"
          ? submissions()
          : Promise.resolve(submissions);
      }
      return Promise.resolve([]);
    });
  }

  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiPatch.mockReset();
    apiDel.mockReset();
  });

  it("renders the event picker on /manager/event-songs", async () => {
    mockManagerGets();
    renderPage("/manager/event-songs");

    await waitFor(() => {
      expect(screen.getByText(/spring classic/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/select an event to view submitted songs/i)).toBeInTheDocument();
  });

  it("loads submissions when an event is selected and groups by division", async () => {
    mockManagerGets({
      submissions: [
        {
          id: "sub1",
          event_id: "ev1",
          event_name: "Spring Classic",
          division: "Classic",
          song_id: "s1",
          song_label: "Sky High",
          partnership_label: "Alice & Bob",
          submitter_email: "alice@example.com",
          created_at: 1,
        },
        {
          id: "sub2",
          event_id: "ev1",
          event_name: "Spring Classic",
          division: "Strictly",
          song_id: "s2",
          song_label: "Midnight",
          partnership_label: "Carol & Dan",
          submitter_email: "carol@example.com",
          created_at: 2,
        },
        {
          id: "sub3",
          event_id: "ev1",
          event_name: "Spring Classic",
          division: null,
          song_id: "s3",
          song_label: "Untitled",
          partnership_label: "Eve Solo",
          submitter_email: "eve@example.com",
          created_at: 3,
        },
      ],
    });

    const user = userEvent.setup();
    renderPage("/manager/event-songs");

    await waitFor(() => {
      expect(screen.getByText(/spring classic/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /spring classic/i }));

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/admin\/event-song-submissions\?event_id=ev1/)
      );
    });

    expect(await screen.findByRole("button", { name: /classic\s+1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /strictly\s+1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unspecified\s+1/i })).toBeInTheDocument();
    expect(screen.getByText(/alice & bob/i)).toBeInTheDocument();
    expect(screen.getByText(/sky high/i)).toBeInTheDocument();
    expect(screen.getByText(/carol & dan/i)).toBeInTheDocument();
    expect(screen.getByText(/eve solo/i)).toBeInTheDocument();
  });

  it("still renders the section when admin submissions reject", async () => {
    mockManagerGets({
      submissions: () => Promise.reject(new Error("not found")),
    });

    const user = userEvent.setup();
    renderPage("/manager/event-songs");

    await waitFor(() => {
      expect(screen.getByText(/spring classic/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /spring classic/i }));

    expect(
      await screen.findByText(/no songs submitted to this event yet/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^manager$/i })).toBeInTheDocument();
  });
});
