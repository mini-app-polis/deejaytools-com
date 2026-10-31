// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Outlet, useParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Every page is a stub that prints its name, and every guard renders a
// marker around its children, so these tests pin the route table: which
// page each path renders, behind which guard, and the redirects.
vi.mock("./LandingPage", () => ({ default: () => <p>LandingPage</p> }));
vi.mock("./FloorTrialsPage", () => ({ default: () => <p>FloorTrialsPage</p> }));
vi.mock("./EventDetailPage", () => ({ default: () => <p>EventDetailPage</p> }));
vi.mock("./EventsPage", () => ({ default: () => <p>EventsPage</p> }));
vi.mock("./HowItWorksPage", () => ({ default: () => <p>HowItWorksPage</p> }));
vi.mock("./help/HelpCheckingInPage", () => ({ default: () => <p>HelpCheckingInPage</p> }));
vi.mock("./help/HelpFloorTrialsPage", () => ({ default: () => <p>HelpFloorTrialsPage</p> }));
vi.mock("./help/HelpOnTheFloorPage", () => ({ default: () => <p>HelpOnTheFloorPage</p> }));
vi.mock("./help/HelpPartnersPage", () => ({ default: () => <p>HelpPartnersPage</p> }));
vi.mock("./help/HelpSubmittingMusicPage", () => ({ default: () => <p>HelpSubmittingMusicPage</p> }));
vi.mock("./help/HelpTheQueuePage", () => ({ default: () => <p>HelpTheQueuePage</p> }));
vi.mock("./help/TroubleshootingPage", () => ({ default: () => <p>TroubleshootingPage</p> }));
vi.mock("./MyContentPage", () => ({ default: () => <p>MyContentPage</p> }));
vi.mock("./MyProfilePage", () => ({ default: () => <p>MyProfilePage</p> }));
vi.mock("./SessionDetailPage", () => ({ default: () => <p>SessionDetailPage</p> }));
vi.mock("./SessionsPage", () => ({ default: () => <p>SessionsPage</p> }));
vi.mock("./AddSongPage", () => ({ default: () => <p>AddSongPage</p> }));
vi.mock("./SongsPage", () => ({ default: () => <p>SongsPage</p> }));
vi.mock("./FeedbackPage", () => ({ default: () => <p>FeedbackPage</p> }));
vi.mock("./MyEventsPage", () => ({ default: () => <p>MyEventsPage</p> }));
vi.mock("./AdminPage", () => ({ default: () => <p>AdminPage</p> }));
vi.mock("./ManagerPage", () => ({ default: () => <p>ManagerPage</p> }));
vi.mock("./CoordinatorPortalPage", () => ({ default: () => <p>CoordinatorPortalPage</p> }));
vi.mock("./DjPortalPage", () => ({ default: () => <p>DjPortalPage</p> }));
vi.mock("./EventManagerPortalPage", () => ({ default: () => <p>EventManagerPortalPage</p> }));
vi.mock("./EventSubmissionsPage", () => ({ default: () => <p>EventSubmissionsPage</p>, OpenSubmissionsRedirect: () => <p>OpenSubmissionsRedirect</p> }));

vi.mock("@/components/Layout", () => ({
  default: () => (
    <div data-testid="layout">
      <Outlet />
    </div>
  ),
}));
vi.mock("@/components/RequireAuth", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="require-auth">{children}</div>,
}));
vi.mock("@/components/AdminGuard", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="admin-guard">{children}</div>,
}));
vi.mock("@/components/ManagerGuard", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="manager-guard">{children}</div>,
}));
vi.mock("@/components/EventRoleGuard", () => ({
  default: function EventRoleGuard({ role, children }: { role: string; children: ReactNode }) {
    const { eventId } = useParams();
    return (
      <div data-testid="event-role-guard" data-role={role} data-event={eventId}>
        {children}
      </div>
    );
  },
}));
vi.mock("sonner", () => ({ Toaster: () => null }));

import App from "./App";

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("App routes", () => {
  it("renders the landing page at / outside the shared layout", () => {
    renderAt("/");
    expect(screen.getByText("LandingPage")).toBeInTheDocument();
    expect(screen.queryByTestId("layout")).toBeNull();
  });

  it.each([
    ["/floor-trials", "FloorTrialsPage"],
    ["/check-in", "FloorTrialsPage"],
    ["/how-it-works", "HowItWorksPage"],
    ["/how-it-works/floor-trials", "HelpFloorTrialsPage"],
    ["/how-it-works/submitting-music", "HelpSubmittingMusicPage"],
    ["/how-it-works/checking-in", "HelpCheckingInPage"],
    ["/how-it-works/the-queue", "HelpTheQueuePage"],
    ["/how-it-works/partners", "HelpPartnersPage"],
    ["/how-it-works/on-the-floor", "HelpOnTheFloorPage"],
    ["/how-it-works/troubleshooting", "TroubleshootingPage"],
    ["/feedback", "FeedbackPage"],
    ["/sessions/s1", "SessionDetailPage"],
    ["/events", "EventsPage"],
    ["/events/e1", "EventDetailPage"],
  ])("renders %s publicly inside the layout", (path, page) => {
    renderAt(path);
    expect(screen.getByTestId("layout")).toHaveTextContent(page);
    expect(screen.queryByTestId("require-auth")).toBeNull();
  });

  it.each([
    ["/my-content", "MyContentPage"],
    ["/my-profile", "MyProfilePage"],
    ["/songs", "SongsPage"],
    ["/songs/add", "AddSongPage"],
    ["/event-submissions", "EventSubmissionsPage"],
    ["/event-submissions/e1", "EventSubmissionsPage"],
    ["/open-submissions", "OpenSubmissionsRedirect"],
    ["/sessions", "SessionsPage"],
    ["/my-events", "MyEventsPage"],
  ])("renders %s behind RequireAuth", (path, page) => {
    renderAt(path);
    expect(screen.getByTestId("require-auth")).toHaveTextContent(page);
  });

  it.each([
    ["/events/e1/coordinator", "coordinator", "CoordinatorPortalPage"],
    ["/events/e1/dj", "dj", "DjPortalPage"],
    ["/events/e1/dj/queue", "dj", "DjPortalPage"],
    ["/events/e1/manage", "event-manager", "EventManagerPortalPage"],
    ["/events/e1/manage/staff", "event-manager", "EventManagerPortalPage"],
  ])("loads %s lazily behind the %s event-role guard", async (path, role, page) => {
    renderAt(path);
    const guard = screen.getByTestId("event-role-guard");
    expect(guard).toHaveAttribute("data-role", role);
    expect(guard).toHaveAttribute("data-event", "e1");
    expect(await screen.findByText(page)).toBeInTheDocument();
  });

  it("shows the route fallback while a lazy page loads", async () => {
    renderAt("/admin/events");
    expect(screen.getByRole("status", { name: /loading page/i })).toBeInTheDocument();
    expect(await screen.findByText("AdminPage")).toBeInTheDocument();
    expect(screen.getByTestId("admin-guard")).toHaveTextContent("AdminPage");
  });

  it("redirects bare /admin to its default section", async () => {
    renderAt("/admin");
    expect(await screen.findByText("AdminPage")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin/events");
  });

  it("redirects bare /manager to its default section behind ManagerGuard", async () => {
    renderAt("/manager");
    expect(await screen.findByText("ManagerPage")).toBeInTheDocument();
    expect(screen.getByTestId("manager-guard")).toHaveTextContent("ManagerPage");
    expect(window.location.pathname).toBe("/manager/active-sessions");
  });
});
