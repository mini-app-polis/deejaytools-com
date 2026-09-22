export function isProdHost(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.location.hostname === "deejaytools.com" ||
      window.location.hostname === "www.deejaytools.com")
  );
}
