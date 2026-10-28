// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx } from "@/test/fixtures";

type Role = "coordinator" | "dj" | "event-manager";

const { apiGet, apiClient } = vi.hoisted(() => {
  const get = vi.fn();
  return {
    apiGet: get,
    apiClient: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() },
  };
});
vi.mock("@/api/client", () => ({ useApiClient: () => apiClient }));

let eventRoles: { event_id: string; role: Role }[] = [];
vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({ me: { id: "u1", role: "user" }, loading: false, eventRoles }),
}));

import MyEventsPage from "./MyEventsPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <MyEventsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockResolvedValue([
    fx.event({ id: "ev-1", name: "Spring Swing" }),
    fx.event({ id: "ev-2", name: "Fall Fling" }),
    fx.event({ id: "ev-3", name: "Winter Ball" }),
    fx.event({ id: "ev-4", name: "Not Mine" }),
  ]);
});

describe("MyEventsPage", () => {
  it("lists only the caller's events, each linking to the richest role's portal", async () => {
    eventRoles = [
      { event_id: "ev-1", role: "coordinator" },
      { event_id: "ev-2", role: "coordinator" },
      { event_id: "ev-2", role: "dj" },
      { event_id: "ev-3", role: "dj" },
      { event_id: "ev-3", role: "event-manager" },
    ];
    renderPage();
    expect((await screen.findByText("Spring Swing")).closest("a")).toHaveAttribute("href", "/events/ev-1/coordinator");
    expect(screen.getByText("Fall Fling").closest("a")).toHaveAttribute("href", "/events/ev-2/dj");
    expect(screen.getByText("Winter Ball").closest("a")).toHaveAttribute("href", "/events/ev-3/manage");
    expect(screen.getByText("Event manager portal →")).toBeInTheDocument();
    expect(screen.queryByText("Not Mine")).toBeNull();
    expect(apiGet).toHaveBeenCalledWith("/v1/events");
  });

  it("drops an event the events list no longer has", async () => {
    eventRoles = [
      { event_id: "ev-1", role: "dj" },
      { event_id: "gone", role: "dj" },
    ];
    renderPage();
    expect(await screen.findByText("Spring Swing")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("explains when the caller is on no event's staff, without fetching", async () => {
    eventRoles = [];
    renderPage();
    expect(await screen.findByText(/aren.t on the staff of any event/)).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
