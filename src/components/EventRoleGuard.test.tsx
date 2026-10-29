// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

type Role = "coordinator" | "dj" | "event-manager";

// Drive useAuthMe via mutable values per test.
let mockState = {
  me: null as { id: string; role: string } | null,
  loading: false,
  isAdmin: false,
  eventRoles: [] as { event_id: string; role: Role }[],
};
vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({ ...mockState, reload: vi.fn() }),
}));

import EventRoleGuard from "./EventRoleGuard";

function signedIn(eventRoles: { event_id: string; role: Role }[], role = "user") {
  mockState = { me: { id: "u1", role }, loading: false, isAdmin: role === "admin", eventRoles };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/events/:eventId/coordinator"
          element={
            <EventRoleGuard role="coordinator">
              <p>coordinator portal</p>
            </EventRoleGuard>
          }
        />
        <Route
          path="/events/:eventId/dj/:section"
          element={
            <EventRoleGuard role="dj">
              <p>dj portal</p>
            </EventRoleGuard>
          }
        />
        <Route
          path="/events/:eventId/manage/:section"
          element={
            <EventRoleGuard role="event-manager">
              <p>manager portal</p>
            </EventRoleGuard>
          }
        />
        <Route path="/" element={<p>landing page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("EventRoleGuard", () => {
  it("shows a skeleton while useAuthMe is loading", () => {
    mockState = { me: null, loading: true, isAdmin: false, eventRoles: [] };
    const { container } = renderAt("/events/ev-1/coordinator");
    expect(screen.queryByText("coordinator portal")).toBeNull();
    expect(screen.queryByText("landing page")).toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(2);
  });

  it("redirects a signed-out visitor", () => {
    mockState = { me: null, loading: false, isAdmin: false, eventRoles: [] };
    renderAt("/events/ev-1/coordinator");
    expect(screen.getByText("landing page")).toBeInTheDocument();
  });

  describe("coordinator portal", () => {
    it("allows the event's coordinator", () => {
      signedIn([{ event_id: "ev-1", role: "coordinator" }]);
      renderAt("/events/ev-1/coordinator");
      expect(screen.getByText("coordinator portal")).toBeInTheDocument();
    });

    it("allows a richer role on the event (DJ)", () => {
      signedIn([{ event_id: "ev-1", role: "dj" }]);
      renderAt("/events/ev-1/coordinator");
      expect(screen.getByText("coordinator portal")).toBeInTheDocument();
    });

    it("redirects a plain user", () => {
      signedIn([]);
      renderAt("/events/ev-1/coordinator");
      expect(screen.queryByText("coordinator portal")).toBeNull();
      expect(screen.getByText("landing page")).toBeInTheDocument();
    });

    it("redirects a coordinator of another event", () => {
      signedIn([{ event_id: "ev-2", role: "coordinator" }]);
      renderAt("/events/ev-1/coordinator");
      expect(screen.getByText("landing page")).toBeInTheDocument();
    });

    it("redirects an admin with no role on the event: admins have the admin pages", () => {
      signedIn([], "admin");
      renderAt("/events/ev-1/coordinator");
      expect(screen.getByText("landing page")).toBeInTheDocument();
    });
  });

  describe("DJ portal", () => {
    it("allows the event's DJ", () => {
      signedIn([{ event_id: "ev-1", role: "dj" }]);
      renderAt("/events/ev-1/dj/queue");
      expect(screen.getByText("dj portal")).toBeInTheDocument();
    });

    it("allows the event's event manager", () => {
      signedIn([{ event_id: "ev-1", role: "event-manager" }]);
      renderAt("/events/ev-1/dj/queue");
      expect(screen.getByText("dj portal")).toBeInTheDocument();
    });

    it("redirects a plain user", () => {
      signedIn([]);
      renderAt("/events/ev-1/dj/queue");
      expect(screen.getByText("landing page")).toBeInTheDocument();
    });

    it("redirects the event's coordinator, a lesser role", () => {
      signedIn([{ event_id: "ev-1", role: "coordinator" }]);
      renderAt("/events/ev-1/dj/queue");
      expect(screen.queryByText("dj portal")).toBeNull();
      expect(screen.getByText("landing page")).toBeInTheDocument();
    });

    it("redirects a DJ of another event", () => {
      signedIn([{ event_id: "ev-2", role: "dj" }]);
      renderAt("/events/ev-1/dj/queue");
      expect(screen.getByText("landing page")).toBeInTheDocument();
    });
  });

  describe("event-manager portal", () => {
    it("allows the event's event manager", () => {
      signedIn([{ event_id: "ev-1", role: "event-manager" }]);
      renderAt("/events/ev-1/manage/event");
      expect(screen.getByText("manager portal")).toBeInTheDocument();
    });

    it("allows a person holding both DJ and event manager on the event", () => {
      signedIn([
        { event_id: "ev-1", role: "dj" },
        { event_id: "ev-1", role: "event-manager" },
      ]);
      renderAt("/events/ev-1/manage/event");
      expect(screen.getByText("manager portal")).toBeInTheDocument();
    });

    it("redirects a plain user", () => {
      signedIn([]);
      renderAt("/events/ev-1/manage/event");
      expect(screen.getByText("landing page")).toBeInTheDocument();
    });

    it("redirects the event's DJ, a lesser role", () => {
      signedIn([{ event_id: "ev-1", role: "dj" }]);
      renderAt("/events/ev-1/manage/event");
      expect(screen.getByText("landing page")).toBeInTheDocument();
    });

    it("redirects an event manager of another event", () => {
      signedIn([{ event_id: "ev-2", role: "event-manager" }]);
      renderAt("/events/ev-1/manage/event");
      expect(screen.getByText("landing page")).toBeInTheDocument();
    });
  });
});
