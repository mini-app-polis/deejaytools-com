// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { eventStatusBadge } from "./adminShared";

describe("eventStatusBadge", () => {
  it.each(["upcoming", "active", "completed", "cancelled", "postponed"])("labels a %s event", (status) => {
    render(eventStatusBadge(status));
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it("marks a cancelled event as destructive and an unknown status as outline", () => {
    const { container: cancelled } = render(eventStatusBadge("cancelled"));
    const { container: unknown } = render(eventStatusBadge("postponed"));
    expect(cancelled.firstElementChild!.className).toContain("destructive");
    expect(unknown.firstElementChild!.className).not.toBe(cancelled.firstElementChild!.className);
  });
});
