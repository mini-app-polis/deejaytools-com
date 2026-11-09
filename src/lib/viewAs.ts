import { useSyncExternalStore } from "react";
import type { EventStaffRole } from "@/schemas";

/**
 * An admin's "view as": the site shown as someone holding only `role` on
 * `eventId` would see it ("dancer": a signed-in user with no staff role).
 *
 * Only what the app shows changes (menus, bars, guards, pages; see
 * useAuthMe). The API still answers the caller as the admin they are.
 *
 * Kept for the browser tab (sessionStorage), so it lasts across pages and
 * reloads until the admin exits it, and never leaks into another tab. Storage
 * that fails (a private window, blocked site data) leaves it in memory only.
 */
export type ViewAsRole = EventStaffRole | "dancer";
export type ViewAs = { role: ViewAsRole; eventId: string };

export const VIEW_AS_ROLES: readonly ViewAsRole[] = ["coordinator", "dj", "event-manager", "dancer"];

const STORAGE_KEY = "deejaytools.viewAs";

function read(): ViewAs | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ViewAs>;
    if (typeof parsed.eventId === "string" && parsed.eventId && VIEW_AS_ROLES.includes(parsed.role as ViewAsRole)) {
      return { role: parsed.role as ViewAsRole, eventId: parsed.eventId };
    }
  } catch {
    // Unreadable storage: not viewing as anyone.
  }
  return null;
}

let current: ViewAs | null = read();
const listeners = new Set<() => void>();

/** Start viewing as `next`, or stop with null. */
export function setViewAs(next: ViewAs | null): void {
  current = next;
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Kept in memory for this page load only.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current view-as, or null. Applies only to admins (useAuthMe). */
export function useViewAs(): ViewAs | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
