// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// Toggle Clerk auth state per test.
let signedIn = false;
vi.mock("@clerk/clerk-react", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    signedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    signedIn ? null : <>{children}</>,
}));

import RequireAuth from "./RequireAuth";

function renderRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/secret"
          element={
            <RequireAuth>
              <p>private content</p>
            </RequireAuth>
          }
        />
        <Route path="/" element={<p>landing page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireAuth", () => {
  it("renders the wrapped children when the user is signed in", () => {
    signedIn = true;
    renderRoute("/secret");
    expect(screen.getByText("private content")).toBeInTheDocument();
  });

  it("redirects to '/' when the user is signed out", () => {
    signedIn = false;
    renderRoute("/secret");
    expect(screen.queryByText("private content")).toBeNull();
    expect(screen.getByText("landing page")).toBeInTheDocument();
  });
});
