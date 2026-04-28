// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// NavBar pulls in Clerk hooks + useAuthMe — replace with a stub so the test
// only exercises the LandingPage's own content.
vi.mock("@/components/NavBar", () => ({
  default: () => <nav data-testid="navbar-stub" />,
}));

import LandingPage from "./LandingPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe("LandingPage — hero", () => {
  it("renders the headline and intro paragraph", () => {
    renderPage();
    expect(screen.getByText(/Music management/i)).toBeInTheDocument();
    expect(screen.getByText(/Look up your submitted music/i)).toBeInTheDocument();
  });
});

describe("LandingPage — entry-point cards", () => {
  it("renders cards for Floor Trials, Music history, My Songs, and My Partners", () => {
    renderPage();
    // Each card title appears exactly once on the page.
    expect(screen.getByText("Floor Trials")).toBeInTheDocument();
    expect(screen.getByText("Music history")).toBeInTheDocument();
    expect(screen.getByText("My Songs")).toBeInTheDocument();
    expect(screen.getByText("My Partners")).toBeInTheDocument();
  });

  it("links each card to its destination route", () => {
    renderPage();
    // Cards are <a> elements (rendered by react-router's Link). We use
    // exact-string matches on the card titles (not regex) because the hero
    // copy contains the substring "Floor Trials" — a loose match would
    // collide. Walk up from the title element to the wrapping anchor.
    const cards = [
      { title: "Floor Trials", href: "/floor-trials" },
      { title: "Music history", href: "/music-history" },
      { title: "My Songs", href: "/songs" },
      { title: "My Partners", href: "/partners" },
    ];
    for (const { title, href } of cards) {
      const titleEl = screen.getByText(title);
      const anchor = titleEl.closest("a");
      expect(anchor).not.toBeNull();
      expect(anchor!.getAttribute("href")).toBe(href);
    }
  });
});

describe("LandingPage — how it works", () => {
  it("renders all four numbered steps", () => {
    renderPage();
    expect(screen.getByText("Submit your music")).toBeInTheDocument();
    expect(screen.getByText("Check in")).toBeInTheDocument();
    expect(screen.getByText("Watch the queue")).toBeInTheDocument();
    expect(screen.getByText("Run your routine")).toBeInTheDocument();
  });
});
