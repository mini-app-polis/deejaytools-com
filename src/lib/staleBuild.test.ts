// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reloadPage } from "@/lib/pageNavigation";
import { RELOAD_GUARD_MS, isStaleBuildError, listenForNewBuild, loadPageChunk, reloadForNewBuild } from "./staleBuild";

vi.mock("@/lib/pageNavigation", () => ({ reloadPage: vi.fn() }));

describe("staleBuild", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(reloadPage).mockClear();
  });

  it("recognises each browser's failed dynamic import, and nothing else", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: https://deejaytools.com/assets/AdminPage-DTJqsPyR.js",
      "error loading dynamically imported module: https://deejaytools.com/assets/AdminPage-x.js",
      "Importing a module script failed.",
      "Unable to preload CSS for /assets/AdminPage-x.css",
    ]) {
      expect(isStaleBuildError(new TypeError(message))).toBe(true);
    }
    expect(isStaleBuildError(new Error("render failed"))).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });

  it("reloads once, then not again within the guard, then again after it", () => {
    expect(reloadForNewBuild(1_000)).toBe(true);
    expect(reloadForNewBuild(1_000 + RELOAD_GUARD_MS - 1)).toBe(false);
    expect(reloadPage).toHaveBeenCalledOnce();
    expect(reloadForNewBuild(1_000 + RELOAD_GUARD_MS + 1)).toBe(true);
    expect(reloadPage).toHaveBeenCalledTimes(2);
  });

  it("does not reload on its own when sessionStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    expect(reloadForNewBuild(1_000)).toBe(false);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("reloads on vite:preloadError and keeps Vite from throwing; lets it through inside the guard", () => {
    const target = new EventTarget() as unknown as Window;
    listenForNewBuild(target);
    const first = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    expect(reloadPage).toHaveBeenCalledOnce();

    const again = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false);
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  describe("loadPageChunk", () => {
    const settled = <T,>(promise: Promise<T>) =>
      Promise.race([promise.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 20))]);

    it("resolves with the chunk's module", async () => {
      const module = { default: () => null };
      await expect(loadPageChunk(() => Promise.resolve(module))).resolves.toBe(module);
    });

    it("never settles when the reload swallowed the import, so React.lazy keeps its fallback", async () => {
      // What Vite resolves with after a prevented vite:preloadError.
      expect(await settled(loadPageChunk(() => Promise.resolve(undefined)))).toBe(false);
    });

    it("still rejects when the import fails outright", async () => {
      await expect(loadPageChunk(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    });
  });
});
