import { waitFor } from "@testing-library/react";
import { expect } from "vitest";

/**
 * Waits for `message` to show as `control`'s field error: the control reads
 * as invalid and is described by the message.
 */
export async function expectFieldError(control: HTMLElement, message: string) {
  await waitFor(() => {
    expect(control).toHaveAttribute("aria-invalid", "true");
    const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(message);
  });
}
