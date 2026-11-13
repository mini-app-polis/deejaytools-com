/**
 * The parts of the Sentry init that depend on how the site was built, kept
 * apart from instrument.ts (which runs Sentry.init on import) so they can be
 * tested.
 */

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
