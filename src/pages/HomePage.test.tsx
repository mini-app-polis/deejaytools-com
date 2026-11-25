// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

let auth = { isLoaded: true, isSignedIn: false };

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => auth,
}));
vi.mock("./LandingPage", () => ({ default: () => <p>LandingPage</p> }));

import HomePage from "./HomePage";

function renderRoot() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/my-content" element={<p>MyContentPage</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  auth = { isLoaded: true, isSignedIn: false };
});

describe("HomePage", () => {
  it("sends a signed-in visitor to My Content", () => {
    auth = { isLoaded: true, isSignedIn: true };
    renderRoot();
    expect(screen.getByText("MyContentPage")).toBeInTheDocument();
    expect(screen.queryByText("LandingPage")).toBeNull();
  });

  it("shows the landing page to a signed-out visitor", () => {
    renderRoot();
    expect(screen.getByText("LandingPage")).toBeInTheDocument();
  });

  it("shows the landing page while Clerk is still loading", () => {
    auth = { isLoaded: false, isSignedIn: false };
    renderRoot();
    expect(screen.getByText("LandingPage")).toBeInTheDocument();
  });
});
