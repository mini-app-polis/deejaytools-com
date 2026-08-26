// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import HowItWorksPage from "./HowItWorksPage";

function LocationProbe({ label }: { label: string }) {
  const { pathname, hash } = useLocation();
  return (
    <div data-testid={label}>
      {pathname}
      {hash}
    </div>
  );
}

const LEGACY_REDIRECT_CASES = [
  ["what-is-a-floor-trial", "/how-it-works/floor-trials", "floor-trials"],
  ["submitting-music", "/how-it-works/submitting-music", "submitting-music"],
  ["confirming-music-on-file", "/how-it-works/submitting-music", "submitting-music"],
  ["checking-in", "/how-it-works/checking-in", "checking-in"],
  ["the-queue", "/how-it-works/the-queue", "the-queue"],
  ["preparing-to-run", "/how-it-works/on-the-floor", "on-the-floor"],
  ["during-your-run", "/how-it-works/on-the-floor", "on-the-floor"],
  ["going-again", "/how-it-works/on-the-floor", "on-the-floor"],
  ["etiquette", "/how-it-works/on-the-floor", "on-the-floor"],
] as const;

describe("HowItWorksPage", () => {
  it("renders the hub when there is no hash", () => {
    render(
      <MemoryRouter initialEntries={["/how-it-works"]}>
        <Routes>
          <Route path="/how-it-works" element={<HowItWorksPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1, name: /how floor trials work/i })).toBeInTheDocument();
    expect(screen.getByText("Submitting your music")).toBeInTheDocument();
  });

  it("links to the event-submission prerequisite from the hub callout", () => {
    render(
      <MemoryRouter initialEntries={["/how-it-works"]}>
        <Routes>
          <Route path="/how-it-works" element={<HowItWorksPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("link", { name: /uploading vs event submission/i })
    ).toHaveAttribute("href", "/how-it-works/submitting-music#event-submission-required");
  });

  it.each(LEGACY_REDIRECT_CASES)(
    "redirects /how-it-works#%s to %s with hash preserved",
    async (anchor, expectedPath, probeId) => {
      render(
        <MemoryRouter initialEntries={[`/how-it-works#${anchor}`]}>
          <Routes>
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route
              path="/how-it-works/floor-trials"
              element={<LocationProbe label="floor-trials" />}
            />
            <Route
              path="/how-it-works/submitting-music"
              element={<LocationProbe label="submitting-music" />}
            />
            <Route
              path="/how-it-works/checking-in"
              element={<LocationProbe label="checking-in" />}
            />
            <Route path="/how-it-works/the-queue" element={<LocationProbe label="the-queue" />} />
            <Route
              path="/how-it-works/on-the-floor"
              element={<LocationProbe label="on-the-floor" />}
            />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId(probeId)).toHaveTextContent(`${expectedPath}#${anchor}`);
      });
    }
  );
});
