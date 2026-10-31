// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// Drive useAuthMe via mutable values per test.
let mockState = {
  me: null as { id: string; role: string } | null,
  loading: true,
  isAdmin: false,
};
let mockError: string | null = null;
const reload = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({
    ...mockState,
    error: mockError,
    reload,
  }),
}));

import AdminGuard from "./AdminGuard";

function renderAt(path = "/admin") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <p>admin content</p>
            </AdminGuard>
          }
        />
        <Route path="/" element={<p>landing page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AdminGuard", () => {
  it("shows a failed account load with a retry instead of redirecting", async () => {
    mockState = { me: null, loading: false, isAdmin: false };
    mockError = "server down";
    reload.mockClear();
    renderAt();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your account: server down");
    expect(screen.queryByText("landing page")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledOnce();
    mockError = null;
  });

  it("shows a skeleton while useAuthMe is still loading", () => {
    mockState = { me: null, loading: true, isAdmin: false };
    const { container } = renderAt();
    // No content yet; the placeholder Skeletons render in their own div.
    expect(screen.queryByText("admin content")).toBeNull();
    expect(screen.queryByText("landing page")).toBeNull();
    // Two skeleton divs are rendered with .animate-pulse classes.
    const pulses = container.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBeGreaterThanOrEqual(2);
  });

  it("redirects to '/' when the user is not an admin", () => {
    mockState = {
      me: { id: "u1", role: "user" },
      loading: false,
      isAdmin: false,
    };
    renderAt();
    expect(screen.queryByText("admin content")).toBeNull();
    expect(screen.getByText("landing page")).toBeInTheDocument();
  });

  it("redirects to '/' when there is no `me` row even if loading is false", () => {
    mockState = { me: null, loading: false, isAdmin: false };
    renderAt();
    expect(screen.queryByText("admin content")).toBeNull();
    expect(screen.getByText("landing page")).toBeInTheDocument();
  });

  it("redirects event staff: a coordinator, DJ or event manager is not an admin", () => {
    for (const role of ["coordinator", "dj", "event-manager"]) {
      mockState = {
        me: { id: "u1", role: "user" },
        loading: false,
        isAdmin: false,
        eventRoles: [{ event_id: "ev-1", role }],
      } as typeof mockState;
      const { unmount } = renderAt();
      expect(screen.queryByText("admin content")).toBeNull();
      expect(screen.getByText("landing page")).toBeInTheDocument();
      unmount();
    }
  });

  it("renders the wrapped children when the user is an admin", () => {
    mockState = {
      me: { id: "admin-1", role: "admin" },
      loading: false,
      isAdmin: true,
    };
    renderAt();
    expect(screen.getByText("admin content")).toBeInTheDocument();
  });
});
