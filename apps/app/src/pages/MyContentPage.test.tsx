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
      if (path === "/v1/checkins/mine") return Promise.resolve([]);
      if (path === "/v1/songs") return Promise.resolve([]);
      if (path === "/v1/events") return Promise.resolve([EVENT]);
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
      return Promise.resolve([]);
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
      if (path === "/v1/checkins/mine") return Promise.resolve([]);
      if (path === "/v1/songs") return Promise.resolve([]);
      if (path === "/v1/events") return Promise.resolve([EVENT]);
      if (path === "/v1/event-song-submissions") {
        return Promise.reject(new Error("not found"));
      }
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^check-ins$/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /^songs$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^events$/i })).toBeInTheDocument();
    expect(await screen.findByText("Spring Classic")).toBeInTheDocument();
    expect(screen.getByText(/no songs added yet/i)).toBeInTheDocument();
  });
});
