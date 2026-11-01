import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { toastFirstError } from "./formErrors";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("toastFirstError", () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it("toasts the first field's message only", () => {
    toastFirstError({
      name: { type: "too_small", message: "Name is required" },
      date: { type: "too_small", message: "Date is required" },
    });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Name is required");
  });

  it("skips errors without a message", () => {
    toastFirstError({ name: { type: "custom" }, date: { type: "too_small", message: "Date is required" } });
    expect(toast.error).toHaveBeenCalledWith("Date is required");
  });

  it("toasts nothing when no error has a message", () => {
    toastFirstError({ name: { type: "custom" } });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
