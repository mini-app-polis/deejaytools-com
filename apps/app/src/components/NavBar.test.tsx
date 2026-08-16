// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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

// Drive useAuthMe via mutable flags.
let isAdmin = false;
let isManager = false;
vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({
    me: signedIn
      ? { id: "u1", role: isAdmin ? "admin" : isManager ? "manager" : "user" }
      : null,
    loading: false,
    reload: vi.fn(),
    isAdmin,
    isManager,
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
  it("shows public nav links and the Sign in button", () => {
    signedIn = false;
    isAdmin = false;
    isManager = false;
    renderNav();

    expect(screen.getAllByRole("link", { name: /floor trials/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^help$/i }).length).toBeGreaterThan(0);
    // Sign in CTA renders.
    expect(screen.getByTestId("sign-in-button")).toBeInTheDocument();
    // Authenticated-only items must not appear.
    expect(screen.queryByRole("link", { name: /^my partners$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^my songs$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^admin$/i })).toBeNull();
    expect(screen.queryByTestId("user-button")).toBeNull();
  });
});

describe("NavBar — signed in (regular user)", () => {
  it("shows Floor Trials, Help, My Content, My Profile and the UserButton; no admin bars", () => {
    signedIn = true;
    isAdmin = false;
    isManager = false;
    renderNav();

    expect(screen.getAllByRole("link", { name: /floor trials/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^help$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^my content$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^my profile$/i }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("user-button")).toBeInTheDocument();

    expect(screen.queryByText("Superuser")).toBeNull();
    expect(screen.queryByText("Manager")).toBeNull();
    expect(screen.queryByTestId("sign-in-button")).toBeNull();
  });
});

describe("NavBar — signed in (admin)", () => {
  it("shows Superuser and Manager sub-bars with their section links", () => {
    signedIn = true;
    isAdmin = true;
    isManager = false;
    renderNav();

    expect(screen.getAllByRole("link", { name: /floor trials/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^my content$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^my profile$/i }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("user-button")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^admin$/i })).toBeNull();
    expect(screen.getByText("Superuser")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^events$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^test checkin$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^active sessions$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^checkin for$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^live queue$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^test inject$/i })).toBeNull();
  });
});

describe("NavBar — signed in (manager only)", () => {
  it("shows the Manager sub-bar but not Superuser", () => {
    signedIn = true;
    isAdmin = false;
    isManager = true;
    renderNav();

    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^active sessions$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^upload for$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^checkin for$/i })).toBeInTheDocument();
    expect(screen.queryByText("Superuser")).toBeNull();
    expect(screen.queryByRole("link", { name: /^events$/i })).toBeNull();
  });
});

describe("NavBar — mobile menu", () => {
  it("shows Help in the mobile nav for signed-out users", async () => {
    signedIn = false;
    isAdmin = false;
    isManager = false;
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: /toggle menu/i }));

    const helpLinks = screen.getAllByRole("link", { name: /^help$/i });
    expect(helpLinks.length).toBeGreaterThan(0);
    expect(helpLinks.some((link) => link.getAttribute("href") === "/how-it-works")).toBe(true);
  });

  it("shows Help in the mobile nav for signed-in users", async () => {
    signedIn = true;
    isAdmin = false;
    isManager = false;
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: /toggle menu/i }));

    const helpLinks = screen.getAllByRole("link", { name: /^help$/i });
    expect(helpLinks.length).toBeGreaterThan(0);
    expect(helpLinks.some((link) => link.getAttribute("href") === "/how-it-works")).toBe(true);
  });
});

describe("NavBar — wordmark", () => {
  it("renders the DJT icon, DeejayTools.com wordmark and version label", () => {
    signedIn = false;
    isAdmin = false;
    isManager = false;
    renderNav();
    // The new layout uses a square DJT icon (alt="DeejayTools") next to a
    // visible "DeejayTools.com" text wordmark, with a small version label.
    expect(screen.getByAltText("DeejayTools")).toBeInTheDocument();
    expect(screen.getByText("DeejayTools.com")).toBeInTheDocument();
    expect(screen.getByText(/^v\d/)).toBeInTheDocument();
  });
});

describe("NavBar — environment badge", () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  function setHostname(hostname: string) {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, hostname },
    });
  }

  it("shows a DEV badge on non-production hosts (e.g. localhost)", () => {
    signedIn = false;
    isAdmin = false;
    isManager = false;
    renderNav();
    expect(screen.getByText("DEV")).toBeInTheDocument();
  });

  it("hides the DEV badge on the production host", () => {
    signedIn = false;
    isAdmin = false;
    isManager = false;
    setHostname("deejaytools.com");
    renderNav();
    expect(screen.queryByText("DEV")).toBeNull();
  });
});
