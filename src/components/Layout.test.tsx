// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

let signedIn = false;
vi.mock("@clerk/clerk-react", () => ({
  SignedIn: ({ children }: { children: ReactNode }) => (signedIn ? <>{children}</> : null),
}));
vi.mock("@/components/AuthSync", () => ({ default: () => <p>auth sync</p> }));
vi.mock("@/components/NavBar", () => ({ default: () => <nav>nav bar</nav> }));

import Layout from "./Layout";

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/page"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="page" element={<p>page content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("Layout", () => {
  it("renders the nav and the matched route inside main", () => {
    signedIn = false;
    renderLayout();
    expect(screen.getByText("nav bar")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("page content");
  });

  it("mounts AuthSync only when signed in", () => {
    signedIn = false;
    const { unmount } = renderLayout();
    expect(screen.queryByText("auth sync")).toBeNull();
    unmount();

    signedIn = true;
    renderLayout();
    expect(screen.getByText("auth sync")).toBeInTheDocument();
  });
});
