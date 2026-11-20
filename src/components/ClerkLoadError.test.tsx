// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Toggle Clerk's load status per test; ClerkFailed renders only on "error".
let status: "loading" | "ready" | "error" = "error";
vi.mock("@clerk/clerk-react", () => ({
  ClerkFailed: ({ children }: { children: React.ReactNode }) =>
    status === "error" ? <>{children}</> : null,
}));

import ClerkLoadError from "./ClerkLoadError";

describe("ClerkLoadError", () => {
  it("shows the message and a retry button when Clerk failed to load", () => {
    status = "error";
    render(<ClerkLoadError />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load sign-in, check your connection."
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders nothing while Clerk is loading or ready", () => {
    for (const s of ["loading", "ready"] as const) {
      status = s;
      const { container } = render(<ClerkLoadError />);
      expect(container).toBeEmptyDOMElement();
    }
  });
});
