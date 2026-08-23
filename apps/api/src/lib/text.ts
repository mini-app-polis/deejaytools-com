/** Trim, collapse internal whitespace, and capitalize the first letter of each
 *  word (preserving the rest — e.g. "jtSwing  team jv" → "JtSwing Team Jv"). */
export function titleCaseWords(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Trim + collapse whitespace, and capitalize the first letter of a word ONLY
 *  if it has no uppercase letters yet — words that already contain a capital
 *  keep their exact casing (e.g. "jtSwing", "JV", "McX" are preserved). */
export function titleCaseIfNoCaps(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/[A-Z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
