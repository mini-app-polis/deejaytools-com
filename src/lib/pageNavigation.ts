/**
 * Full-page navigations, outside the router. Used where the React tree may be
 * unusable (the error boundary's recovery screen), so a fresh document load is
 * the point: it discards every piece of in-memory state.
 */
export function reloadPage(): void {
  window.location.reload();
}

export function goHome(): void {
  window.location.assign("/");
}
