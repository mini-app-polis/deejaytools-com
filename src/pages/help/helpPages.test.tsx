// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HelpCheckingInPage from "./HelpCheckingInPage";
import HelpFloorTrialsPage from "./HelpFloorTrialsPage";
import HelpOnTheFloorPage from "./HelpOnTheFloorPage";
import HelpPartnersPage from "./HelpPartnersPage";
import HelpSubmittingMusicPage from "./HelpSubmittingMusicPage";
import HelpTheQueuePage from "./HelpTheQueuePage";
import TroubleshootingPage from "./TroubleshootingPage";

const HELP_PAGES = [
  {
    name: "floor-trials",
    path: "/how-it-works/floor-trials",
    Page: HelpFloorTrialsPage,
    title: "What is a floor trial?",
  },
  {
    name: "submitting-music",
    path: "/how-it-works/submitting-music",
    Page: HelpSubmittingMusicPage,
    title: "Submitting your music",
  },
  {
    name: "checking-in",
    path: "/how-it-works/checking-in",
    Page: HelpCheckingInPage,
    title: "Checking in",
  },
  {
    name: "the-queue",
    path: "/how-it-works/the-queue",
    Page: HelpTheQueuePage,
    title: "Watching the queue",
  },
  {
    name: "partners",
    path: "/how-it-works/partners",
    Page: HelpPartnersPage,
    title: "Partners & teams",
  },
  {
    name: "on-the-floor",
    path: "/how-it-works/on-the-floor",
    Page: HelpOnTheFloorPage,
    title: "On the floor",
  },
  {
    name: "troubleshooting",
    path: "/how-it-works/troubleshooting",
    Page: TroubleshootingPage,
    title: "Troubleshooting",
  },
] as const;

beforeEach(() => {
  window.scrollTo = vi.fn();
});

describe("help topic pages", () => {
  it.each(HELP_PAGES)("renders $name with its headline", ({ path, Page, title }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Page />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to help/i })).toHaveAttribute("href", "/how-it-works");
  });
});
