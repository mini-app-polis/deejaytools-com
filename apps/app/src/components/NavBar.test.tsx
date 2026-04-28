// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Clerk's <SignedIn> / <SignedOut> wrappers render their children based on
// real Clerk state. For tests we wire each one to a global flag the test sets
// before rendering — this lets us toggle "signed in" vs. "signed out" without
// pulling in real Clerk state.
let signedIn = false;

vi.mock("@clerk/clerk-react", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    signedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    signedIn ? null : <>{children}</>,
  // Render children directly — wrapping in a real <button> would create the
  // invalid <button><button> nesting that React warns about, since the
  // SignInButton's child in real code is a shadcn Button (also a <button>).
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="sign-in-button">{children}</span>
  ),
  UserButton: () => <div data-testid="user-button" />,
}));

// Drive useAuthMe via another mutable flag.
let isAdmin = false;
vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({
    me: signedIn ? { id: "u1", role: isAdmin ? "admin" : "user" } : null,
    loading: false,
    reload: vi.fn(),
    isAdmin,
  }),
}));

import NavBar from "./NavBar";

function renderNav() {
  return render(
    <MemoryRouter>
      <NavBar />
    </MemoryRouter>
  );
}

describe("NavBar — signed out", () => {
  it("shows the Floor Trials link and the Sign in button, nothing else", () => {
    signedIn = false;
    isAdmin = false;
    renderNav();

    // Floor Trials is the only public nav item — it appears in the desktop nav
    // AND the mobile menu (when closed, mobile menu isn't rendered, so just one).
    expect(screen.getAllByRole("link", { name: /floor trials/i }).length).toBeGreaterThan(0);
    // Sign in CTA renders.
    expect(screen.getByTestId("sign-in-button")).toBeInTheDocument();
    // Authenticated-only items must not appear.
    expect(screen.queryByRole("link", { name: /^partners$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^songs$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^admin$/i })).toBeNull();
    expect(screen.queryByTestId("user-button")).toBeNull();
  });
});

describe("NavBar — signed in (regular user)", () => {
  it("shows Floor Trials, Partners, Songs and the UserButton; no Admin link", () => {
    signedIn = true;
    isAdmin = false;
    renderNav();

    expect(screen.getAllByRole("link", { name: /floor trials/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^partners$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^songs$/i }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("user-button")).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: /^admin$/i })).toBeNull();
    expect(screen.queryByTestId("sign-in-button")).toBeNull();
  });
});

describe("NavBar — signed in (admin)", () => {
  it("shows the Admin link in addition to the regular signed-in items", () => {
    signedIn = true;
    isAdmin = true;
    renderNav();

    expect(screen.getAllByRole("link", { name: /^admin$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /floor trials/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^partners$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^songs$/i }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("user-button")).toBeInTheDocument();
  });
});

describe("NavBar — wordmark", () => {
  it("renders the DeejayTools.com wordmark and version label", () => {
    signedIn = false;
    isAdmin = false;
    renderNav();
    expect(screen.getByAltText("DeejayTools.com")).toBeInTheDocument();
    expect(screen.getByText(/^v\d/)).toBeInTheDocument();
  });
});
