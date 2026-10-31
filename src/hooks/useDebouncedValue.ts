import { useEffect, useState } from "react";

/**
 * `value`, once it has stopped changing for `delayMs`. A search box feeds
 * its text through this so a query runs for what was finally typed, not for
 * every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
