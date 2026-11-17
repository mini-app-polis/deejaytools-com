// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import GuidePage from "./GuidePage";

describe("GuidePage", () => {
  it("renders the operations guide for event staff, with links into the tools", () => {
    render(
      <MemoryRouter>
        <GuidePage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Guide" })).toBeInTheDocument();
    expect(screen.getByText("Floor trial operations guide")).toBeInTheDocument();
    expect(screen.getByText(/for event staff/i)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).not.toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "Run History" })[0]).toHaveAttribute("href", "/admin/runs");
    expect(screen.getAllByRole("link", { name: "Active Sessions" })[0]).toHaveAttribute(
      "href",
      "/manager/active-sessions"
    );
  });
});
