// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Drive useAuthMe via mutable values per test.
let mockState = {
  me: null as { id: string; role: string } | null,
  loading: true,
  isAdmin: false,
  error: null as string | null,
};
const reload = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({ ...mockState, reload }),
}));

import ManagerGuard from "./ManagerGuard";

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/manager"]}>
      <Routes>
        <Route
          path="/manager"
          element={
            <ManagerGuard>
              <p>manager content</p>
            </ManagerGuard>
          }
        />
        <Route path="/" element={<p>landing page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  reload.mockClear();
});

describe("ManagerGuard", () => {
  it("shows a skeleton while useAuthMe is still loading", () => {
    mockState = { me: null, loading: true, isAdmin: false, error: null };
    const { container } = renderAt();
    expect(screen.queryByText("manager content")).toBeNull();
    expect(screen.queryByText("landing page")).toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a failed account load with a retry instead of redirecting", async () => {
    mockState = { me: null, loading: false, isAdmin: false, error: "server down" };
    renderAt();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your account: server down");
    expect(screen.queryByText("landing page")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("redirects a signed-in non-admin to '/' — there is no global manager role", () => {
    mockState = { me: { id: "u1", role: "user" }, loading: false, isAdmin: false, error: null };
    renderAt();
    expect(screen.queryByText("manager content")).toBeNull();
    expect(screen.getByText("landing page")).toBeInTheDocument();
  });

  it("redirects to '/' when there is no account record and no error", () => {
    mockState = { me: null, loading: false, isAdmin: false, error: null };
    renderAt();
    expect(screen.getByText("landing page")).toBeInTheDocument();
  });

  it("renders its children for an admin", () => {
    mockState = { me: { id: "u1", role: "admin" }, loading: false, isAdmin: true, error: null };
    renderAt();
    expect(screen.getByText("manager content")).toBeInTheDocument();
  });
});
