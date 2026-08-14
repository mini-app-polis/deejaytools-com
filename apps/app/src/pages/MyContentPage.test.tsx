// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
const apiClient = {
  get: apiGet,
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  postForm: vi.fn(),
};
vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import MyContentPage from "./MyContentPage";

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

const ACTIVE_SESSION = {
  id: "sess-active-1",
  event_id: "ev1",
  event_timezone: "America/Los_Angeles",
  date: "2026-04-01",
  floor_trial_starts_at: 1700000000000,
  floor_trial_ends_at: 1700007200000,
  checkin_opens_at: 1699998200000,
  status: "checkin_open" as const,
  active_priority_max: 6,
  active_non_priority_max: 4,
  created_at: 1,
  updated_at: 1,
  divisions: [],
};

function defaultApiGet(path: string) {
  if (path === "/v1/checkins/mine") return Promise.resolve([]);
  if (path === "/v1/songs") return Promise.resolve([]);
  if (path === "/v1/sessions") return Promise.resolve([]);
  if (path === "/v1/events") return Promise.resolve([EVENT]);
  if (path === "/v1/event-song-submissions") return Promise.resolve([]);
  return Promise.resolve([]);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyContentPage />
    </MemoryRouter>
  );
}

describe("MyContentPage — Events section", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("renders the Events section with upcoming events", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/event-song-submissions") {
        return Promise.resolve([
          {
            id: "sub1",
            event_id: "ev1",
            event_name: "Spring Classic",
            event_start_date: "2026-04-01",
            event_status: "upcoming",
            song_id: "song1",
            song_label: "2026_Classic_MyRoutine.mp3",
            division: "Classic",
            created_at: 1,
          },
        ]);
      }
      return defaultApiGet(path);
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /^events$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add songs to an event/i })).toHaveAttribute(
      "href",
      "/event-submissions"
    );
    expect(await screen.findByText("Spring Classic")).toBeInTheDocument();
    expect(screen.getByText(/2026_Classic_MyRoutine\.mp3/)).toBeInTheDocument();
  });

  it("still renders Check-ins and Songs when event-song-submissions rejects", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/event-song-submissions") {
        return Promise.reject(new Error("not found"));
      }
      return defaultApiGet(path);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^songs$/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /^check-ins$/i })).toBeNull();
    expect(screen.getByRole("heading", { name: /^events$/i })).toBeInTheDocument();
    expect(
      await screen.findByText(/you haven't added songs to any events yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Spring Classic")).toBeNull();
  });

  it("hides events with no song submissions", async () => {
    apiGet.mockImplementation(defaultApiGet);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^events$/i })).toBeInTheDocument();
    });
    expect(
      screen.getByText(/you haven't added songs to any events yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Spring Classic")).toBeNull();
  });
});

describe("MyContentPage — Active Floor Trials section", () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it("shows Active Floor Trials with a Go To Session link when a session is active", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          ACTIVE_SESSION,
          {
            ...ACTIVE_SESSION,
            id: "sess-scheduled",
            status: "scheduled",
          },
        ]);
      }
      return defaultApiGet(path);
    });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: /^active floor trials$/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Spring Classic").length).toBeGreaterThan(0);
    expect(screen.getByText(/check-in open/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^go to session$/i })).toHaveAttribute(
      "href",
      "/sessions/sess-active-1"
    );
  });

  it("hides Active Floor Trials when no sessions are checkin_open or in_progress", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/sessions") {
        return Promise.resolve([
          { ...ACTIVE_SESSION, id: "sess-done", status: "completed" },
          { ...ACTIVE_SESSION, id: "sess-later", status: "scheduled" },
        ]);
      }
      return defaultApiGet(path);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^songs$/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /^check-ins$/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /^active floor trials$/i })).toBeNull();
  });
});
