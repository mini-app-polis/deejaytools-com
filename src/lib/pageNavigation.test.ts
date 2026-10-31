// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { goHome, reloadPage } from "./pageNavigation";

describe("pageNavigation", () => {
  const original = window.location;

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  function stubLocation() {
    const location = { reload: vi.fn(), assign: vi.fn() };
    Object.defineProperty(window, "location", { configurable: true, value: location });
    return location;
  }

  it("reloadPage reloads the current document", () => {
    const location = stubLocation();
    reloadPage();
    expect(location.reload).toHaveBeenCalledOnce();
  });

  it("goHome loads the home page", () => {
    const location = stubLocation();
    goHome();
    expect(location.assign).toHaveBeenCalledWith("/");
  });
});
