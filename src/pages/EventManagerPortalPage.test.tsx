// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

import EventManagerPortalPage from "./EventManagerPortalPage";
import { renderWithQueryClient } from "@/test/render";

const event = fx.event({ id: "ev-1", name: "Winter Ball", season_year: "2026" });
const staff = [
  fx.eventStaff({ user_id: "user_m", role: "event-manager", email: "m@example.com", first_name: "Mia", last_name: "Lane" }),
  fx.eventStaff({ user_id: "user_d", role: "dj", email: "d@example.com", first_name: "Dee", last_name: "Jay" }),
  fx.eventStaff({ user_id: "user_c", role: "coordinator", email: "c@example.com" }),
];

function renderAt(section: string) {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={[`/events/ev-1/manage/${section}`]}>
      <Routes>
        <Route path="/events/:eventId/manage/:section" element={<EventManagerPortalPage />} />
        <Route path="/my-events" element={<p>my events page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function allPaths(): string[] {
  return [apiGet, apiPost, apiPatch, apiPut, apiDel].flatMap((fn) => fn.mock.calls.map(([p]) => String(p)));
}

beforeEach(() => {
  for (const fn of [apiGet, apiPost, apiPatch, apiPut, apiDel]) fn.mockReset();
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/events/ev-1") return Promise.resolve(event);
    if (path === "/v1/events/ev-1/staff") return Promise.resolve(staff);
    if (path.startsWith("/v1/events/ev-1/people?q=")) {
      return Promise.resolve([fx.eventPerson({ user_id: "user_new", display_name: "Nia New", email_masked: null })]);
    }
    return Promise.resolve([]);
  });
});

describe("EventManagerPortalPage", () => {
  it("has every DJ section plus Event and Staff, and no event creation", async () => {
    renderAt("event");
    expect(await screen.findByText("Winter Ball", { selector: "h1" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Event manager sections" });
    for (const label of [
      "Live queue", "Sessions", "Run history", "Check in for", "Upload for", "Submissions", "Drive folder", "Event", "Staff",
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /new event|create event/i })).toBeNull();
  });

  it("edits the event through PATCH /v1/events/:id", async () => {
    apiPatch.mockResolvedValue({ ...event, name: "Winter Ball 2026" });
    renderAt("event");
    const name = await screen.findByLabelText("Name");
    fireEvent.change(name, { target: { value: "Winter Ball 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/v1/events/ev-1", {
        name: "Winter Ball 2026",
        start_date: event.start_date,
        end_date: event.end_date,
        timezone: event.timezone,
      })
    );
    // The portal header follows the saved event.
    expect(await screen.findByText("Winter Ball 2026", { selector: "h1" })).toBeInTheDocument();
  });

  it("deletes the event through DELETE /v1/events/:id after confirming, then leaves for My events", async () => {
    apiDel.mockResolvedValue({ deleted: true });
    renderAt("event");
    fireEvent.click(await screen.findByRole("button", { name: "Delete event" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/events/ev-1"));
    expect(await screen.findByText("my events page")).toBeInTheDocument();
  });

  it("lists the staff and offers revoke for coordinator and DJ only", async () => {
    renderAt("staff");
    expect(await screen.findByText("Mia Lane")).toBeInTheDocument();
    expect(screen.getByText("Dee Jay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Dee Jay as DJ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove c@example.com as Coordinator" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove Mia Lane/ })).toBeNull();
  });

  it("never offers granting event manager", async () => {
    renderAt("staff");
    const roles = await screen.findByRole("radiogroup", { name: "Role" });
    const options = within(roles).getAllByRole("radio").map((r) => r.textContent);
    expect(options).toEqual(["Coordinator", "DJ"]);
  });

  it("grants a role through PUT /v1/events/:id/staff/:userId/:role", async () => {
    apiPut.mockResolvedValue(fx.eventStaff({ user_id: "user_new", role: "dj", email: "n@example.com" }));
    renderAt("staff");
    fireEvent.change(await screen.findByRole("combobox", { name: "Person" }), { target: { value: "nia" } });
    fireEvent.click(await screen.findByRole("option", { name: "Nia New" }));
    expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/people?q=nia");
    fireEvent.click(screen.getByRole("radio", { name: "DJ" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to staff" }));
    await waitFor(() => expect(apiPut).toHaveBeenCalledWith("/v1/events/ev-1/staff/user_new/dj", undefined));
    // The picker is cleared for the next grant.
    expect(await screen.findByRole("combobox", { name: "Person" })).toHaveValue("");
    expect(allPaths().some((p) => p.startsWith("/v1/admin"))).toBe(false);
  });

  it("checks in the picked song's owner, with no dancer picker", async () => {
    renderAt("checkin-for");
    expect(await screen.findByText("Check in for a dancer")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Dancer" })).toBeNull();
    expect(allPaths().some((p) => p.startsWith("/v1/admin"))).toBe(false);
  });

  it("picks the dancer before showing the upload form", async () => {
    renderAt("upload-for");
    fireEvent.change(await screen.findByRole("combobox", { name: "Dancer" }), { target: { value: "nia" } });
    fireEvent.click(await screen.findByRole("option", { name: "Nia New" }));
    expect(await screen.findByText("Upload for: Nia New")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/people?q=nia");
    expect(allPaths().some((p) => p.startsWith("/v1/admin"))).toBe(false);
  });

  it("revokes a role through DELETE /v1/events/:id/staff/:userId/:role", async () => {
    const fallback = apiGet.getMockImplementation()!;
    let revoked = false;
    apiGet.mockImplementation((path: string) =>
      path === "/v1/events/ev-1/staff" && revoked
        ? Promise.resolve(staff.filter((s) => s.user_id !== "user_d"))
        : fallback(path)
    );
    apiDel.mockImplementation(async () => {
      revoked = true;
      return { deleted: true };
    });
    renderAt("staff");
    fireEvent.click(await screen.findByRole("button", { name: "Remove Dee Jay as DJ" }));
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/events/ev-1/staff/user_d/dj"));
    await waitFor(() => expect(screen.queryByText("Dee Jay")).toBeNull());
    expect(allPaths().some((p) => p.startsWith("/v1/admin"))).toBe(false);
  });

  it("links the Drive folder section straight to the event's folder", async () => {
    const url = "https://drive.google.com/drive/folders/folder_em";
    const fallback = apiGet.getMockImplementation()!;
    apiGet.mockImplementation((path: string) =>
      path === "/v1/events/ev-1/drive-folder" ? Promise.resolve({ folder_id: "folder_em", url }) : fallback(path)
    );
    renderAt("drive");
    expect(await screen.findByRole("link", { name: /Open the event's folder/ })).toHaveAttribute("href", url);
  });
});
