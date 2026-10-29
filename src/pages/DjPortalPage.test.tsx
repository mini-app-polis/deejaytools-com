// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx } from "@/test/fixtures";

const { apiGet, apiPost, apiPatch, apiPut, apiDel, apiClient } = vi.hoisted(() => {
  const get = vi.fn();
  const post = vi.fn();
  const patch = vi.fn();
  const put = vi.fn();
  const del = vi.fn();
  return {
    apiGet: get,
    apiPost: post,
    apiPatch: patch,
    apiPut: put,
    apiDel: del,
    apiClient: { get, post, patch, put, del, postForm: vi.fn() },
  };
});
vi.mock("@/api/client", () => ({ useApiClient: () => apiClient }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ getToken: vi.fn() }) }));

import DjPortalPage from "./DjPortalPage";

const NOW = Date.now();
const liveSession = fx.session({
  id: "s-1", event_id: "ev-1", status: "in_progress", event_timezone: "America/Chicago",
  checkin_opens_at: NOW - 3_600_000, floor_trial_starts_at: NOW - 60_000, floor_trial_ends_at: NOW + 3_600_000,
  divisions: [{ id: "d-1", division_name: "Classic", is_priority: true, sort_order: 0, priority_run_limit: 2 }],
});

function routeGet(path: string): Promise<unknown> {
  if (path === "/v1/events/ev-1") return Promise.resolve(fx.event({ id: "ev-1", name: "Fall Fling" }));
  if (path === "/v1/sessions?event_id=ev-1") return Promise.resolve([liveSession]);
  if (path === "/v1/queue/s-1/active") return Promise.resolve([fx.queueEntry({ queueEntryId: "qe-1", entityLabel: "Ada & Bob" })]);
  if (path === "/v1/queue/s-1/priority") return Promise.resolve([]);
  if (path === "/v1/queue/s-1/non-priority") return Promise.resolve([]);
  if (path.startsWith("/v1/runs?")) {
    return Promise.resolve([fx.run({ id: "r-1", entity_label: "Cy & Di", division_name: "Classic" })]);
  }
  if (path.startsWith("/v1/events/ev-1/people?q=")) {
    return Promise.resolve([fx.eventPerson({ user_id: "user_42", display_name: "Ada Lovelace", email_masked: "a•••@example.com" })]);
  }
  if (path === "/v1/events/ev-1/song-submissions") {
    return Promise.resolve([
      fx.adminEventSongSubmission({ id: "sub-1", song_id: "song-9", owner_user_id: "user_42", division: "Classic", partnership_label: "Ada & Bob" }),
    ]);
  }
  return Promise.reject(new Error(`unexpected GET ${path}`));
}

function renderAt(section: string) {
  return render(
    <MemoryRouter initialEntries={[`/events/ev-1/dj/${section}`]}>
      <Routes>
        <Route path="/events/:eventId/dj" element={<DjPortalPage />} />
        <Route path="/events/:eventId/dj/:section" element={<DjPortalPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Every path the portal called, on any method. */
function allPaths(): string[] {
  return [apiGet, apiPost, apiPatch, apiPut, apiDel].flatMap((fn) => fn.mock.calls.map(([p]) => String(p)));
}

beforeEach(() => {
  for (const fn of [apiGet, apiPost, apiPatch, apiPut, apiDel]) fn.mockReset();
  apiGet.mockImplementation(routeGet);
});

describe("DjPortalPage", () => {
  it("lands on the live queue from the bare portal URL and shows the DJ sections", async () => {
    render(
      <MemoryRouter initialEntries={["/events/ev-1/dj"]}>
        <Routes>
          <Route path="/events/:eventId/dj" element={<DjPortalPage />} />
          <Route path="/events/:eventId/dj/:section" element={<DjPortalPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("Fall Fling")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "DJ sections" });
    for (const label of ["Live queue", "Sessions", "Run history", "Check in for", "Upload for", "Submissions", "Drive folder"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    // The DJ portal has no event editing or staff list.
    expect(within(nav).queryByRole("link", { name: "Staff" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Event" })).toBeNull();
    expect(await screen.findByText("Ada & Bob")).toBeInTheDocument();
  });

  it("runs the live queue's actions through the queue routes", async () => {
    apiPost.mockResolvedValue({ completed: true });
    renderAt("queue");
    expect(await screen.findByText("Ada & Bob")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/v1/queue/s-1/priority");
    fireEvent.click(screen.getByRole("button", { name: "Run complete" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/queue/complete", { queueEntryId: "qe-1" }));
    apiPost.mockResolvedValue({ withdrawn: true });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/queue/withdraw", { queueEntryId: "qe-1" }));
    expect(allPaths().some((p) => p.startsWith("/v1/admin"))).toBe(false);
  });

  it("creates a session for this event", async () => {
    apiPost.mockResolvedValue(fx.session({ id: "s-2", event_id: "ev-1" }));
    renderAt("sessions");
    await screen.findByRole("button", { name: "New session" });
    fireEvent.click(screen.getByRole("button", { name: "New session" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create session" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [path, body] = apiPost.mock.calls[0]!;
    expect(path).toBe("/v1/sessions");
    expect(body).toMatchObject({ event_id: "ev-1", active_priority_max: 6, active_non_priority_max: 4 });
    expect((body as { divisions: unknown[] }).divisions.length).toBeGreaterThan(0);
  });

  it("sets a session's status and deletes a session", async () => {
    apiPatch.mockResolvedValue({ ...liveSession, status: "cancelled" });
    apiDel.mockResolvedValue({ deleted: true });
    renderAt("sessions");
    const status = await screen.findByRole("combobox", { name: /^Status of/ });
    fireEvent.change(status, { target: { value: "cancelled" } });
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/v1/sessions/s-1/status", { status: "cancelled" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/sessions/s-1"));
  });

  it("edits a session: patches its fields, then its divisions", async () => {
    apiPatch.mockResolvedValue(liveSession);
    apiPut.mockResolvedValue(liveSession);
    renderAt("sessions");
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(apiPut).toHaveBeenCalled());
    expect(apiPatch.mock.calls[0]![0]).toBe("/v1/sessions/s-1");
    expect(apiPatch.mock.calls[0]![1]).toMatchObject({ event_id: "ev-1" });
    const [putPath, putBody] = apiPut.mock.calls[0]!;
    expect(putPath).toBe("/v1/sessions/s-1/divisions");
    const classic = (putBody as { divisions: { division_name: string; is_priority: boolean; priority_run_limit: number }[] })
      .divisions.find((d) => d.division_name === "Classic");
    expect(classic).toMatchObject({ is_priority: true, priority_run_limit: 2 });
  });

  it("reads run history filtered to this event, never unfiltered", async () => {
    renderAt("runs");
    expect(await screen.findByText("Cy & Di")).toBeInTheDocument();
    const runCalls = apiGet.mock.calls.map(([p]) => String(p)).filter((p) => p.startsWith("/v1/runs"));
    expect(runCalls.length).toBeGreaterThan(0);
    for (const p of runCalls) expect(p).toMatch(/[?&](event_id=ev-1|session_id=)/);
  });

  it("checks a dancer in on their behalf", async () => {
    apiPost.mockResolvedValue(fx.checkinCreated({ sessionId: "s-1" }));
    renderAt("checkin-for");
    // The dancer is the picked song's owner: there is nobody to pick or type.
    expect(screen.queryByRole("combobox", { name: "Dancer" })).toBeNull();
    fireEvent.click(await screen.findByRole("radio", { name: /^Ada & Bob/ }));
    // Pick the one open session (its title is a date and time).
    const session = within(screen.getByRole("radiogroup", { name: "Session" })).getAllByRole("radio")[0]!;
    fireEvent.click(session);
    fireEvent.click(screen.getByRole("radio", { name: "Classic" }));
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/checkins", {
        sessionId: "s-1",
        songId: "song-9",
        divisionName: "Classic",
        on_behalf_of_user_id: "user_42",
      })
    );
    expect(allPaths().some((p) => p.startsWith("/v1/admin"))).toBe(false);
  });

  it("picks the dancer before showing the upload form", async () => {
    renderAt("upload-for");
    fireEvent.change(await screen.findByRole("combobox", { name: "Dancer" }), { target: { value: "ada" } });
    fireEvent.click(await screen.findByRole("option", { name: /^Ada Lovelace/ }));
    expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/people?q=ada");
    expect(await screen.findByText("Upload for: Ada Lovelace")).toBeInTheDocument();
    expect(await screen.findByText(/with no partner/)).toBeInTheDocument();
    expect(allPaths().some((p) => p.startsWith("/v1/admin"))).toBe(false);
  });

  it("links straight to the event's Drive folder once it is shared", async () => {
    const url = "https://drive.google.com/drive/folders/folder_1";
    apiGet.mockImplementation((path: string) =>
      path === "/v1/events/ev-1/drive-folder" ? Promise.resolve({ folder_id: "folder_1", url }) : routeGet(path)
    );
    renderAt("drive");
    expect(await screen.findByRole("link", { name: /Open the event's folder/ })).toHaveAttribute("href", url);
    expect(screen.queryByRole("link", { name: /Open Shared with me/ })).toBeNull();
    expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/drive-folder");
  });

  it("points to Shared with me while the folder is not shared yet", async () => {
    apiGet.mockImplementation((path: string) =>
      path === "/v1/events/ev-1/drive-folder" ? Promise.resolve({ folder_id: null, url: null }) : routeGet(path)
    );
    renderAt("drive");
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/drive-folder"));
    expect(await screen.findByRole("link", { name: /Open Shared with me/ })).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/shared-with-me"
    );
    expect(screen.getByText(/can take a few minutes to appear/)).toBeInTheDocument();
  });

  it("points to Shared with me when the folder cannot be read", async () => {
    renderAt("drive");
    // routeGet refuses the drive-folder path, as a denied or failed call would.
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/drive-folder"));
    expect(await screen.findByRole("link", { name: /Open Shared with me/ })).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/shared-with-me"
    );
    expect(screen.queryByRole("link", { name: /Open the event's folder/ })).toBeNull();
  });
});
