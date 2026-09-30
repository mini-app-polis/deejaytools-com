/**
 * Maintenance mode. When `VITE_MAINTENANCE` is exactly `"1"` at build time,
 * the app renders only the maintenance page: no Clerk, no API calls, so
 * nothing reaches an API that is down for a database move.
 *
 * Vite inlines env vars at build time, so turning it on or off means setting
 * the variable in Cloudflare Pages and redeploying. The literal-"1" rule
 * matches the API's DISABLE_SCHEDULER.
 */
export function isMaintenanceMode(): boolean {
  return import.meta.env.VITE_MAINTENANCE === "1";
}
