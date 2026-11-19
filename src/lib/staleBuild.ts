import { reloadPage } from "@/lib/pageNavigation";

/**
 * A tab left open across a deploy still runs the old build. The first time it
 * opens a page it has not loaded yet, it asks for that page's chunk by the old
 * build's file name, which the new deploy no longer serves, and the import
 * fails. Loading the page again picks up the new build.
 */

/** When this tab last reloaded for a new build, epoch ms (per tab). */
const RELOADED_AT_KEY = "deejaytools:new-build-reload";

/**
 * A second failure this soon after reloading means the file really is
 * missing, not that the build moved on: show the error rather than loop.
 */
export const RELOAD_GUARD_MS = 30_000;

// The message each browser gives for a dynamic import (or its CSS) it could not load.
const STALE_BUILD_MESSAGES = [
  /failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // Vite's CSS preload
];

/** Whether `error` is a page chunk that failed to load, as after a deploy. */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return STALE_BUILD_MESSAGES.some((pattern) => pattern.test(message));
}

/**
 * Reloads the page to pick up the new build, at most once per
 * RELOAD_GUARD_MS in this tab. Returns whether it reloaded.
 */
export function reloadForNewBuild(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOADED_AT_KEY, String(now));
  } catch {
    // No sessionStorage (blocked or private mode): no guard, so never reload
    // on our own; the error screen's Reload button still works.
    return false;
  }
  reloadPage();
  return true;
}

/**
 * Vite fires `vite:preloadError` on window when a dynamic import fails.
 * Reloading then (and keeping Vite from throwing) means the user lands on the
 * page they asked for, in the new build, instead of the error screen.
 */
export function listenForNewBuild(target: Window = window): void {
  target.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
