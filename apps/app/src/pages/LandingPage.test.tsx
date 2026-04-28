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
  it("renders the four entry-point cards in the expected order", () => {
    renderPage();
    // Each card title appears exactly once on the page.
    expect(screen.getByText("How Floor Trials Work")).toBeInTheDocument();
    expect(screen.getByText("Active Floor Trials")).toBeInTheDocument();
    expect(screen.getByText("My Partners")).toBeInTheDocument();
    expect(screen.getByText("My Songs")).toBeInTheDocument();
    // The historical catalog used to be its own card linking to
    // /music-history. That page + card were removed because the same
    // search lives inside AddSongPage's "Claim from history" dialog and a
    // separate top-level entry was redundant.
    expect(screen.queryByText("Previously Submitted Songs")).toBeNull();
  });

  it("links each card to its destination route", () => {
    renderPage();
    // Cards are <a> elements (rendered by react-router's Link). Walk up from
    // the title element to the wrapping anchor and assert href.
    const cards = [
      { title: "How Floor Trials Work", href: "/how-it-works" },
      { title: "Active Floor Trials", href: "/floor-trials" },
      { title: "My Partners", href: "/partners" },
      { title: "My Songs", href: "/songs" },
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
