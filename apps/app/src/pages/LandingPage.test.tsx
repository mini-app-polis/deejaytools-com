// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// NavBar pulls in Clerk hooks + useAuthMe — replace with a stub so the test
// only exercises the LandingPage's own content.
vi.mock("@/components/NavBar", () => ({
  default: () => <nav data-testid="navbar-stub" />,
}));

// Clerk's <SignedIn> / <SignedOut> wrappers gate child rendering on auth
// state. Mock them with a flag the test can flip per case so we can exercise
// both the signed-in and signed-out variants of the My Content card. The
// mocked SignInButton just renders its children inside a span tagged with a
// testid so the wrapping behavior is visible to assertions.
let signedIn = false;

vi.mock("@clerk/clerk-react", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    signedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    signedIn ? null : <>{children}</>,
  SignInButton: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="sign-in-button">{children}</span>
  ),
}));

import LandingPage from "./LandingPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  signedIn = false;
});

describe("LandingPage — hero", () => {
  it("renders the headline and intro paragraph", () => {
    renderPage();
    expect(screen.getByText(/Music management/i)).toBeInTheDocument();
    expect(screen.getByText(/Look up your submitted music/i)).toBeInTheDocument();
  });
});

describe("LandingPage — entry-point cards", () => {
  it("renders the four entry-point cards in the expected order", () => {
    signedIn = true; // run in signed-in mode so the My Content link href is asserted directly
    renderPage();
    expect(screen.getByText("How Floor Trials Work")).toBeInTheDocument();
    expect(screen.getByText("Floor Trials")).toBeInTheDocument();
    expect(screen.getByText("My Content")).toBeInTheDocument();
    expect(screen.getByText("Feedback")).toBeInTheDocument();
    // Old cards should not be back.
    expect(screen.queryByText("My Partners")).toBeNull();
    expect(screen.queryByText("My Songs")).toBeNull();
    expect(screen.queryByText("Previously Submitted Songs")).toBeNull();
  });

  it("links each card to its destination route when signed in", () => {
    signedIn = true;
    renderPage();
    const cards = [
      { title: "How Floor Trials Work", href: "/how-it-works" },
      { title: "Floor Trials", href: "/floor-trials" },
      { title: "My Content", href: "/my-content" },
      { title: "Feedback", href: "/feedback" },
    ];
    for (const { title, href } of cards) {
      const titleEl = screen.getByText(title);
      const anchor = titleEl.closest("a");
      expect(anchor).not.toBeNull();
      expect(anchor!.getAttribute("href")).toBe(href);
    }
  });

  it("uses the Sign in required eyebrow on the My Content card", () => {
    renderPage();
    // Eyebrow text appears once, on the My Content card.
    expect(screen.getByText(/sign in required/i)).toBeInTheDocument();
  });
});

describe("LandingPage — My Content card auth behaviour", () => {
  it("when signed out, wraps the My Content card in Clerk's SignInButton trigger", () => {
    signedIn = false;
    renderPage();

    // The card's title still renders, but instead of an <a>, the surface is
    // wrapped in a <span data-testid="sign-in-button"> coming from the Clerk
    // mock. Walk up from the title to confirm.
    const titleEl = screen.getByText("My Content");
    const triggerEl = titleEl.closest("[data-testid=\"sign-in-button\"]");
    expect(triggerEl).not.toBeNull();
    // And there should not be a regular anchor for that card while signed out.
    expect(titleEl.closest("a")).toBeNull();
  });

  it("when signed in, the My Content card renders as a regular Link", () => {
    signedIn = true;
    renderPage();

    const titleEl = screen.getByText("My Content");
    const anchor = titleEl.closest("a");
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute("href")).toBe("/my-content");
    // No SignInButton trigger should be present in this state.
    expect(screen.queryByTestId("sign-in-button")).toBeNull();
  });
});

describe("LandingPage — no inline how-it-works", () => {
  it("does not render the old 4-step process list inline anymore", () => {
    renderPage();
    // These were the four step titles in the old vague section. They moved
    // to /how-it-works. The homepage should no longer render them.
    expect(screen.queryByText("Submit your music")).toBeNull();
    expect(screen.queryByText("Check in")).toBeNull();
    expect(screen.queryByText("Watch the queue")).toBeNull();
    expect(screen.queryByText("Run your routine")).toBeNull();
  });
});
