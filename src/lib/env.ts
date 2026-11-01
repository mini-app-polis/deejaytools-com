/** True when the page is served from the production deejaytools.com host. */
export function isProdHost(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.location.hostname === "deejaytools.com" ||
      window.location.hostname === "www.deejaytools.com")
  );
}
