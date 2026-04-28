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
  it("renders cards for every entry point including How floor trials work", () => {
    renderPage();
    // Each card title appears exactly once on the page.
    expect(screen.getByText("Floor Trials")).toBeInTheDocument();
    expect(screen.getByText("Music history")).toBeInTheDocument();
    expect(screen.getByText("My Songs")).toBeInTheDocument();
    expect(screen.getByText("My Partners")).toBeInTheDocument();
    expect(screen.getByText("How floor trials work")).toBeInTheDocument();
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
      { title: "How floor trials work", href: "/how-it-works" },
    ];
    for (const { title, href } of cards) {
      const titleEl = screen.getByText(title);
      const anchor = titleEl.closest("a");
      expect(anchor).not.toBeNull();
      expect(anchor!.getAttribute("href")).toBe(href);
    }
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
