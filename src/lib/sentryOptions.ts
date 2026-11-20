/**
 * The parts of the Sentry init that depend on how the site was built, kept
 * apart from instrument.ts (which runs Sentry.init on import) so they can be
 * tested.
 */

import type { ErrorEvent, EventHint } from "@sentry/react";

/** The Sentry environment names the API uses too, so the two line up. */
export type SentryEnvironment = "production" | "development" | "local";

/**
 * The environment a build reports as. vite.config.ts decides it from the
 * branch Cloudflare Pages built; anything unrecognised is "local", so a
 * stray build can never pass itself off as production.
 */
export function sentryEnvironment(value: string | undefined): SentryEnvironment {
  return value === "production" || value === "development" ? value : "local";
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Which requests carry Sentry's trace headers (sentry-trace, baggage), so an
 * API error can be found from the page that caused it. Only the site's own
 * API: other hosts would refuse the extra headers in their CORS preflight.
 *
 * An empty API URL means the API is same-origin (local development through
 * the dev-server proxy), which Sentry's default already covers.
 */
export function tracePropagationTargets(apiUrl: string | undefined): (string | RegExp)[] | undefined {
  if (!apiUrl) return undefined;
  let origin: string;
  try {
    origin = new URL(apiUrl).origin;
  } catch {
    return undefined;
  }
  // The origin and a path after it, not a longer host that starts the same.
  return [new RegExp(`^${escapeRegExp(origin)}(?:/|$)`)];
}

const CLERK_LOAD_CODES = ["failed_to_load_clerk_js", "failed_to_load_clerk_js_timeout"];

function clerkLoadFailure(event: ErrorEvent, hint?: EventHint): boolean {
  const code = (hint?.originalException as { code?: unknown } | null | undefined)?.code;
  if (typeof code === "string") return CLERK_LOAD_CODES.includes(code);
  // Without the original exception, fall back to the code in the message.
  const messages = (event.exception?.values ?? []).map((v) => v.value ?? "");
  return messages.some((m) => CLERK_LOAD_CODES.some((c) => m.includes(c)));
}

/** True when the API fetches in the breadcrumbs got no response at all. */
function apiFetchesFailed(event: ErrorEvent, apiUrl: string | undefined): boolean {
  const fetches = (event.breadcrumbs ?? []).filter((b) => {
    const url = b.data?.url;
    return b.category === "fetch" && typeof url === "string" && (!apiUrl || url.startsWith(apiUrl));
  });
  return fetches.length > 0 && fetches.every((b) => !b.data?.status_code);
}

/**
 * Sentry's beforeSend: drops a Clerk script-load failure from a device that is
 * offline (or whose API calls just failed too), since that is the device's
 * network, not a Clerk or proxy outage. Everything else is sent unchanged.
 */
export function dropOfflineClerkLoadFailure(
  event: ErrorEvent,
  hint?: EventHint,
  apiUrl?: string,
): ErrorEvent | null {
  if (!clerkLoadFailure(event, hint)) return event;
  if (!navigator.onLine || apiFetchesFailed(event, apiUrl)) return null;
  return event;
}
