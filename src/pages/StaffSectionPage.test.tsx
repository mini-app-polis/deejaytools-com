// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx } from "@/test/fixtures";

const { apiGet, apiClient, auth } = vi.hoisted(() => {
  const get = vi.fn();
  return {
    apiGet: get,
    apiClient: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() },
    auth: {
      isAdmin: false,
      eventRoles: [] as { event_id: string; role: "coordinator" | "dj" | "event-manager" }[],
    },
  };
});
vi.mock("@/api/client", () => ({ useApiClient: () => apiClient }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({
    me: { id: "u1" },
    loading: false,
    error: null,
    reload: vi.fn(),
    isAdmin: auth.isAdmin,
    eventRoles: auth.eventRoles,
  }),
}));

import StaffSectionPage from "./StaffSectionPage";
import { renderWithQueryClient } from "@/test/render";

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function renderPage(path: string) {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route path="/staff/:section" element={<StaffSectionPage />} />
      </Routes>
      <Where />
    </MemoryRouter>
  );
}

beforeEach(() => {
  auth.isAdmin = false;
  auth.eventRoles = [
    { event_id: "ev-1", role: "coordinator" },
    { event_id: "ev-2", role: "dj" },
  ];
  apiGet.mockReset();
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/events") {
      return Promise.resolve([
        fx.event({ id: "ev-1", name: "Spring Swing", start_date: "2026-12-01", end_date: "2026-12-03" }),
        fx.event({ id: "ev-2", name: "Fall Fling", start_date: "2026-11-19", end_date: "2026-11-21" }),
        fx.event({ id: "ev-3", name: "Winter Ball", start_date: "2026-11-01", end_date: "2026-11-02" }),
      ]);
    }
    const m = /^\/v1\/events\/([^/]+)\/song-submissions$/.exec(path);
    if (m) {
      return Promise.resolve([
        fx.adminEventSongSubmission({ id: `sub-${m[1]}`, partnership_label: `Pair at ${m[1]}`, song_label: "x.mp3" }),
      ]);
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
});

describe("StaffSectionPage", () => {
  it("opens on the soonest of the caller's events, never one they have no role on", async () => {
    renderPage("/staff/submissions");
    expect(await screen.findByRole("heading", { name: "Submissions" })).toBeInTheDocument();
    expect(await screen.findByText("Pair at ev-2")).toBeInTheDocument();
    expect(screen.getByText("DJ")).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalledWith("/v1/events/ev-3/song-submissions");
  });

  it("opens the event in the URL when the caller may open this page on it", async () => {
    renderPage("/staff/submissions?event=ev-1");
    expect(await screen.findByText("Pair at ev-1")).toBeInTheDocument();
    expect(screen.getByText("Coordinator")).toBeInTheDocument();
  });

  it("ignores an event in the URL the caller has no role on", async () => {
    renderPage("/staff/submissions?event=ev-3");
    expect(await screen.findByText("Pair at ev-2")).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalledWith("/v1/events/ev-3/song-submissions");
  });

  it("offers a page only on events whose role has it", async () => {
    auth.eventRoles = [{ event_id: "ev-1", role: "coordinator" }];
    renderPage("/staff/queue");
    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("sends an unknown page home", async () => {
    renderPage("/staff/nope");
    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("lets an admin open the page on any event", async () => {
    auth.isAdmin = true;
    auth.eventRoles = [];
    renderPage("/staff/submissions?event=ev-3");
    expect(await screen.findByText("Pair at ev-3")).toBeInTheDocument();
  });
});
