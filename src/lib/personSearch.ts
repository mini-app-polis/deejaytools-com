import type { ApiEventPerson } from "@/schemas";

/** The API refuses a people search shorter than this, once trimmed. */
export const PERSON_SEARCH_MIN_CHARS = 2;

/** How long typing must pause before the people search is sent. */
export const PERSON_SEARCH_DEBOUNCE_MS = 300;

/** The query to send for what was typed, or null when it is too short to search. */
export function personSearchQuery(raw: string): string | null {
  const q = raw.trim();
  return q.length >= PERSON_SEARCH_MIN_CHARS ? q : null;
}

/** "Ada Lovelace · a•••@example.com", or just the name when there is no email. */
export function formatPersonLabel(p: Pick<ApiEventPerson, "display_name" | "email_masked">): string {
  return p.email_masked ? `${p.display_name} · ${p.email_masked}` : p.display_name;
}
