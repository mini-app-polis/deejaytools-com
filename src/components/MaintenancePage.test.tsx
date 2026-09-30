// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMaintenanceMode } from "@/lib/maintenance";
import MaintenancePage from "./MaintenancePage";

describe("MaintenancePage", () => {
  it("tells the visitor the site is down for maintenance", () => {
    render(<MaintenancePage />);
    expect(
      screen.getByRole("heading", { name: /down for maintenance/i })
    ).toBeInTheDocument();
  });
});

describe("isMaintenanceMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is on only for the literal string \"1\"", () => {
    vi.stubEnv("VITE_MAINTENANCE", "1");
    expect(isMaintenanceMode()).toBe(true);
  });

  it.each(["", "0", "true", "yes"])("is off for %j", (value) => {
    vi.stubEnv("VITE_MAINTENANCE", value);
    expect(isMaintenanceMode()).toBe(false);
  });
});
