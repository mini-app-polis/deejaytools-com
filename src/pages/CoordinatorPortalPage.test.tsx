// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx } from "@/test/fixtures";

const { apiGet, apiPost, apiPut, apiDel, apiClient, auth } = vi.hoisted(() => {
  const get = vi.fn();
  const post = vi.fn();
  const put = vi.fn();
  const del = vi.fn();
  return {
    apiGet: get,
    apiPost: post,
    apiPut: put,
    apiDel: del,
    apiClient: { get, post, patch: vi.fn(), put, del, postForm: vi.fn() },
    auth: { isAdmin: false },
  };
});
vi.mock("@/api/client", () => ({ useApiClient: () => apiClient }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({ isAdmin: auth.isAdmin, eventRoles: [{ event_id: "ev-1", role: "coordinator" }] }),
}));

import CoordinatorPortalPage from "./CoordinatorPortalPage";
import { renderWithQueryClient } from "@/test/render";

function renderPortal(path = "/events/ev-1/coordinator/submissions") {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events/:eventId/coordinator" element={<CoordinatorPortalPage />} />
        <Route path="/events/:eventId/coordinator/:section" element={<CoordinatorPortalPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const registration = (over: Record<string, unknown>) => ({
  id: "r1", event_id: "ev-1", position: 0, division: "Classic", dancer_1: "Ada", dancer_2: "Bob",
  linked_label: null, handled: false, note: null, scratched: false, hidden_submission_ids: [],
  created_at: 1, updated_at: 1,
  ...over,
});

beforeEach(() => {
  auth.isAdmin = false;
  apiPost.mockReset();
  apiPut.mockReset();
  apiDel.mockReset();
  apiGet.mockReset();
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/events/ev-1") return Promise.resolve(fx.event({ id: "ev-1", name: "Spring Swing" }));
    if (path === "/v1/events/ev-1/registrations") {
      return Promise.resolve([
        registration({ id: "r1", dancer_1: "Cy", dancer_2: "Di", division: "Showcase" }),
        registration({ id: "r2", position: 1, dancer_1: "Fay", dancer_2: "Gus", note: null }),
      ]);
    }
    if (path === "/v1/divisions") return Promise.resolve({ groups: [], divisions: [] });
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

  it("opens on the registration list: who is still missing music", async () => {
    renderPortal("/events/ev-1/coordinator");
    expect(await screen.findByText("Fay & Gus")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Registrations" })).toHaveAttribute(
      "href",
      "/events/ev-1/coordinator/registrations"
    );
    expect(screen.getByRole("link", { name: "Submissions" })).toBeInTheDocument();
    // Cy & Di submitted: only the entry still missing music needs attention.
    expect(screen.queryByText("Cy & Di")).toBeNull();
    expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/registrations");
    expect(apiGet.mock.calls.some(([p]) => String(p).startsWith("/v1/admin"))).toBe(false);
    // The admin's note stays the admin's.
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByLabelText("Note")).toBeNull();
  });

  it("adds pasted entries to the list without replacing it", async () => {
    apiPost.mockResolvedValue({ added: 1, skipped: 1 });
    renderPortal("/events/ev-1/coordinator/registrations");
    await screen.findByText("Fay & Gus");
    // There is no one-at-a-time form: entries come in from a paste.
    expect(screen.queryByRole("button", { name: "Add entry" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import entries" }));
    // With a list in place, adding is the default.
    expect(await screen.findByRole("radio", { name: "Add to list" })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByLabelText("Registration rows"), {
      target: { value: "Division\tDancer 1\t\t\t\tDancer 2\nMasters\tHal\t\t\t\tIvy\nClassic\tFay\t\t\t\tGus" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add 2" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/events/ev-1/registrations/append", {
        entries: [
          { division: "Masters", dancer_1: "Hal", dancer_2: "Ivy" },
          { division: "Classic", dancer_1: "Fay", dancer_2: "Gus" },
        ],
      })
    );
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("replaces the list only when Replace list is chosen", async () => {
    apiPut.mockResolvedValue([registration({ id: "r3", position: 0, dancer_1: "Hal", dancer_2: "Ivy" })]);
    renderPortal("/events/ev-1/coordinator/registrations");
    await screen.findByText("Fay & Gus");
    fireEvent.click(screen.getByRole("button", { name: "Import entries" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Replace list" }));
    fireEvent.change(screen.getByLabelText("Registration rows"), {
      target: { value: "Division\tDancer 1\t\t\t\tDancer 2\nMasters\tHal\t\t\t\tIvy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace with 1" }));
    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith("/v1/events/ev-1/registrations", {
        entries: [{ division: "Masters", dancer_1: "Hal", dancer_2: "Ivy" }],
      })
    );
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("removes an entry from the list, after a confirming click", async () => {
    apiDel.mockResolvedValue({ deleted: true });
    renderPortal("/events/ev-1/coordinator/registrations");
    await screen.findByText("Fay & Gus");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Remove…" }));
    expect(apiDel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove from the list" }));
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/events/ev-1/registrations/r2"));
  });

  it("keeps the view-as switcher out of the portal itself, for admins too", async () => {
    auth.isAdmin = true;
    renderPortal();
    await screen.findByText("Ada & Bob");
    expect(screen.queryByRole("navigation", { name: "View as" })).toBeNull();
  });

  it("shows no view-as switcher to the event's own staff", async () => {
    renderPortal();
    await screen.findByText("Ada & Bob");
    expect(screen.queryByRole("navigation", { name: "View as" })).toBeNull();
  });

  it("says so when nothing has been submitted", async () => {
    apiGet.mockImplementation((path: string) =>
      path === "/v1/events/ev-1" ? Promise.resolve(fx.event({ id: "ev-1" })) : Promise.resolve([])
    );
    renderPortal();
    expect(await screen.findByText("No songs submitted to this event yet.")).toBeInTheDocument();
  });
});
