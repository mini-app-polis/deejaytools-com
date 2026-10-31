// @vitest-environment jsdom
import * as Sentry from "@sentry/react";
import type { ErrorEvent } from "@sentry/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { goHome, reloadPage } from "@/lib/pageNavigation";
import AppErrorBoundary from "./AppErrorBoundary";

vi.mock("@/lib/pageNavigation", () => ({ reloadPage: vi.fn(), goHome: vi.fn() }));

// A real Sentry client whose beforeSend records each event and drops it, so
// the test sees what would be reported without sending anything.
const sent: ErrorEvent[] = [];

function BrokenPage(): never {
  throw new Error("render failed");
}

function renderAt(path: string) {
  return render(
    <AppErrorBoundary>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>Home</p>} />
          <Route path="/broken" element={<BrokenPage />} />
        </Routes>
      </MemoryRouter>
    </AppErrorBoundary>
  );
}

describe("AppErrorBoundary", () => {
  beforeAll(() => {
    Sentry.init({
      dsn: "https://public@o0.ingest.sentry.io/0",
      defaultIntegrations: false,
      beforeSend(event) {
        sent.push(event);
        return null;
      },
    });
  });

  afterAll(async () => {
    await Sentry.close();
  });

  beforeEach(() => {
    sent.length = 0;
    vi.mocked(reloadPage).mockClear();
    vi.mocked(goHome).mockClear();
    // React logs every error a boundary catches; keep the test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders its children when nothing throws", () => {
    renderAt("/");
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the recovery screen when a route throws, and reports to Sentry", async () => {
    renderAt("/broken");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].exception?.values?.[0]?.value).toBe("render failed");
  });

  it("reloads the page or goes home from the recovery screen", async () => {
    const user = userEvent.setup();
    renderAt("/broken");

    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(reloadPage).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Go home" }));
    expect(goHome).toHaveBeenCalledOnce();
  });
});
