// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx } from "@/test/fixtures";

const { apiGet, apiClient } = vi.hoisted(() => {
  const get = vi.fn();
  return {
    apiGet: get,
    apiClient: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() },
  };
});
vi.mock("@/api/client", () => ({ useApiClient: () => apiClient }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import CoordinatorPortalPage from "./CoordinatorPortalPage";

function renderPortal() {
  return render(
    <MemoryRouter initialEntries={["/events/ev-1/coordinator"]}>
      <Routes>
        <Route path="/events/:eventId/coordinator" element={<CoordinatorPortalPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/events/ev-1") return Promise.resolve(fx.event({ id: "ev-1", name: "Spring Swing" }));
    if (path === "/v1/events/ev-1/song-submissions") {
      return Promise.resolve([
        fx.adminEventSongSubmission({
          id: "sub-1", division: "Classic", partnership_label: "Ada & Bob", song_label: "Ada_Bob_Classic.mp3",
        }),
        fx.adminEventSongSubmission({
          id: "sub-2", division: "Showcase", partnership_label: "Cy & Di", song_label: "Cy_Di_Showcase.mp3",
        }),
        fx.adminEventSongSubmission({
          id: "sub-3", division: null, partnership_label: "Eve", song_label: "Eve_Solo.mp3",
        }),
      ]);
    }
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
});

describe("CoordinatorPortalPage", () => {
  it("lists the event's submissions from the event-scoped route, with label and owner", async () => {
    renderPortal();
    expect(await screen.findByText("Spring Swing")).toBeInTheDocument();
    expect(await screen.findByText("Ada & Bob")).toBeInTheDocument();
    expect(screen.getByText("Ada_Bob_Classic.mp3")).toBeInTheDocument();
    expect(screen.getByText("Cy & Di")).toBeInTheDocument();
    expect(screen.getByText("Eve")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/song-submissions");
    expect(apiGet.mock.calls.some(([p]) => String(p).startsWith("/v1/admin"))).toBe(false);
  });

  it("filters by division", async () => {
    renderPortal();
    await screen.findByText("Ada & Bob");
    fireEvent.click(screen.getByRole("radio", { name: "Showcase (1)" }));
    expect(screen.getByText("Cy & Di")).toBeInTheDocument();
    expect(screen.queryByText("Ada & Bob")).toBeNull();
    expect(screen.queryByText("Eve")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Unspecified (1)" }));
    expect(screen.getByText("Eve")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "All (3)" }));
    expect(screen.getByText("Ada & Bob")).toBeInTheDocument();
  });

  it("is read-only: it offers no action buttons", async () => {
    renderPortal();
    await screen.findByText("Ada & Bob");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("says so when nothing has been submitted", async () => {
    apiGet.mockImplementation((path: string) =>
      path === "/v1/events/ev-1" ? Promise.resolve(fx.event({ id: "ev-1" })) : Promise.resolve([])
    );
    renderPortal();
    expect(await screen.findByText("No songs submitted to this event yet.")).toBeInTheDocument();
  });
});
