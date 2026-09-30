// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MaintenancePage from "./MaintenancePage";

describe("MaintenancePage", () => {
  it("tells the visitor the site is down for maintenance", () => {
    render(<MaintenancePage />);
    expect(
      screen.getByRole("heading", { name: /down for maintenance/i })
    ).toBeInTheDocument();
  });
});

