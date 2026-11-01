/**
 * Full-page navigations, outside the router. Used where the React tree may be
 * unusable (the error boundary's recovery screen), so a fresh document load is
 * the point: it discards every piece of in-memory state.
 */
export function reloadPage(): void {
  window.location.reload();
}

/** Navigates the browser to the home page with a full page load. */
export function goHome(): void {
  window.location.assign("/");
}
