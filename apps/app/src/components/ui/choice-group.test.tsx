// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChoiceGroup } from "./choice-group";

describe("ChoiceGroup", () => {
  const flatOptions = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ] as const;

  it("flat mode renders all options in one row", () => {
    render(
      <ChoiceGroup
        ariaLabel="Flat"
        options={[...flatOptions]}
        value=""
        onChange={() => {}}
      />
    );

    const group = screen.getByRole("radiogroup", { name: "Flat" });
    expect(group).toHaveClass("flex", "flex-wrap", "gap-2");
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Gamma" })).toBeInTheDocument();
  });

  it("grouped mode renders one row per non-empty group with every option present", () => {
    render(
      <ChoiceGroup
        ariaLabel="Grouped"
        groups={[
          [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }],
          [{ value: "c", label: "Gamma" }],
        ]}
        value=""
        onChange={() => {}}
      />
    );

    const group = screen.getByRole("radiogroup", { name: "Grouped" });
    expect(group).toHaveClass("space-y-2");
    expect(group.querySelectorAll(".flex.flex-wrap.gap-2")).toHaveLength(2);
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3);
  });

  it("skips empty groups", () => {
    render(
      <ChoiceGroup
        ariaLabel="Grouped"
        groups={[
          [{ value: "a", label: "Alpha" }],
          [],
          [{ value: "b", label: "Beta" }],
        ]}
        value=""
        onChange={() => {}}
      />
    );

    const group = screen.getByRole("radiogroup", { name: "Grouped" });
    expect(group.querySelectorAll(".flex.flex-wrap.gap-2")).toHaveLength(2);
  });

  it("renders exactly one radiogroup in either mode", () => {
    const { rerender } = render(
      <ChoiceGroup ariaLabel="Flat" options={[...flatOptions]} value="" onChange={() => {}} />
    );
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);

    rerender(
      <ChoiceGroup
        ariaLabel="Grouped"
        groups={[[{ value: "a", label: "Alpha" }], [{ value: "b", label: "Beta" }]]}
        value=""
        onChange={() => {}}
      />
    );
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Beta" })).toBeInTheDocument();
  });

  it("marks grouped rows as presentation so radios stay in one radiogroup", () => {
    const { container } = render(
      <ChoiceGroup
        ariaLabel="Grouped"
        groups={[
          [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ],
          [{ value: "c", label: "Gamma" }],
        ]}
        value=""
        onChange={() => {}}
      />
    );

    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(container.querySelectorAll('[role="presentation"]')).toHaveLength(2);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("fires onChange when a pill in any row is selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ChoiceGroup
        ariaLabel="Grouped"
        groups={[
          [{ value: "a", label: "Alpha" }],
          [{ value: "b", label: "Beta" }],
        ]}
        value=""
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("radio", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
