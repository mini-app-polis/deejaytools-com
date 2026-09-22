// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HelpLayout from "@/components/help/HelpLayout";
import HowItWorksPage from "@/pages/HowItWorksPage";

describe("HelpLayout hash scrolling", () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    scrollTo = vi.fn();
    // Both DOM methods are overloaded, which no mock type can satisfy
    // structurally; the cast is the standard way to stand one in.
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    Element.prototype.scrollIntoView =
      scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    window.matchMedia = vi.fn().mockReturnValue({ matches: false } as MediaQueryList);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrolls to top when there is no hash", async () => {
    render(
      <MemoryRouter initialEntries={["/how-it-works/on-the-floor"]}>
        <Routes>
          <Route
            path="/how-it-works/on-the-floor"
            element={
              <HelpLayout topicId="on-the-floor">
                <section id="etiquette">Etiquette</section>
              </HelpLayout>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls to the hash target on direct load", async () => {
    render(
      <MemoryRouter initialEntries={["/how-it-works/on-the-floor#etiquette"]}>
        <Routes>
          <Route
            path="/how-it-works/on-the-floor"
            element={
              <HelpLayout topicId="on-the-floor">
                <section id="preparing-to-run">Preparing</section>
                <section id="etiquette">Etiquette</section>
              </HelpLayout>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("uses auto scroll when prefers-reduced-motion is set", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true } as MediaQueryList);

    render(
      <MemoryRouter initialEntries={["/how-it-works/submitting-music#event-submission-required"]}>
        <Routes>
          <Route
            path="/how-it-works/submitting-music"
            element={
              <HelpLayout topicId="submitting-music">
                <h3 id="event-submission-required">Event submission</h3>
              </HelpLayout>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    });
  });

  it("scrolls after legacy hub redirect preserves the hash", async () => {
    render(
      <MemoryRouter initialEntries={["/how-it-works#etiquette"]}>
        <Routes>
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route
            path="/how-it-works/on-the-floor"
            element={
              <HelpLayout topicId="on-the-floor">
                <section id="preparing-to-run">Preparing</section>
                <section id="etiquette">Etiquette</section>
              </HelpLayout>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
  });

  it.each([
    ["/how-it-works#what-is-a-floor-trial", "/how-it-works/floor-trials", "what-is-a-floor-trial"],
    ["/how-it-works#submitting-music", "/how-it-works/submitting-music", "submitting-music"],
    ["/how-it-works#confirming-music-on-file", "/how-it-works/submitting-music", "confirming-music-on-file"],
    ["/how-it-works#checking-in", "/how-it-works/checking-in", "checking-in"],
    ["/how-it-works#the-queue", "/how-it-works/the-queue", "the-queue"],
    ["/how-it-works#preparing-to-run", "/how-it-works/on-the-floor", "preparing-to-run"],
    ["/how-it-works#during-your-run", "/how-it-works/on-the-floor", "during-your-run"],
    ["/how-it-works#going-again", "/how-it-works/on-the-floor", "going-again"],
    ["/how-it-works#etiquette", "/how-it-works/on-the-floor", "etiquette"],
  ])("legacy %s scrolls to #%s after redirect", async (entry, path, anchorId) => {
    scrollIntoView.mockClear();

    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route
            path={path}
            element={
              <HelpLayout topicId="on-the-floor">
                <section id={anchorId}>Target</section>
              </HelpLayout>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.getElementById(anchorId)).toBeTruthy();
      expect(scrollIntoView).toHaveBeenCalled();
    });
  });

  it("direct /how-it-works/submitting-music#event-submission-required scrolls to the subheading", async () => {
    scrollIntoView.mockClear();

    render(
      <MemoryRouter initialEntries={["/how-it-works/submitting-music#event-submission-required"]}>
        <Routes>
          <Route
            path="/how-it-works/submitting-music"
            element={
              <HelpLayout topicId="submitting-music">
                <section id="submitting-music">Submitting</section>
                <h3 id="event-submission-required">Event submission required</h3>
              </HelpLayout>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
    expect(document.getElementById("event-submission-required")).toBeTruthy();
  });

  it("scrolls to top when navigating between help pages without a hash", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/how-it-works/on-the-floor"]}>
        <Routes>
          <Route
            path="/how-it-works/on-the-floor"
            element={
              <HelpLayout topicId="on-the-floor">
                <Link to="/how-it-works/checking-in">Go to checking in</Link>
                <section id="etiquette">Etiquette</section>
              </HelpLayout>
            }
          />
          <Route
            path="/how-it-works/checking-in"
            element={
              <HelpLayout topicId="checking-in">
                <section id="checking-in">Checking in</section>
              </HelpLayout>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    });
    scrollTo.mockClear();

    await user.click(screen.getByRole("link", { name: "Go to checking in" }));

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    });
  });
});
