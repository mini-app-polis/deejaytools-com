/**
 * Readable event URLs: `/events/the-open-2026` in place of the event's id.
 *
 * A slug is the event's name with its start year, lower-case, words joined
 * by hyphens ("The Open" starting in 2026 is `the-open-2026`). A name that
 * already ends in that year does not repeat it ("Swing Fling 2026" is
 * `swing-fling-2026`). Name and year keep slugs unique in practice; when two
 * events would still share one, the older keeps it and the newer gets `-2`,
 * `-3`, … in the order they were created, so a slug never changes when a
 * later event is added.
 *
 * The API knows events by id only: slugs are worked out here, from the
 * public event list, and resolved back to an id the same way. An id in the
 * URL still opens the event. Renaming an event (or moving its start year)
 * changes its slug, so old links by slug stop resolving.
 */

type SlugSource = { id: string; name: string; start_date: string; created_at?: number };

/** Lower-case words joined by hyphens: accents dropped, anything else a break. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** The slug an event would have on its own: name, then start year unless the name ends with it. */
export function baseEventSlug(event: Pick<SlugSource, "name" | "start_date">): string {
  const name = slugify(event.name);
  const year = event.start_date.slice(0, 4);
  if (!/^[0-9]{4}$/.test(year)) return name || "event";
  if (!name) return `event-${year}`;
  return name === year || name.endsWith(`-${year}`) ? name : `${name}-${year}`;
}

/**
 * Each event's slug by id, unique across `events`: where two would share
 * one, the earlier created keeps it and later ones are numbered from 2.
 */
export function eventSlugs(events: readonly SlugSource[]): Map<string, string> {
  const ordered = [...events].sort(
    (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0) || a.id.localeCompare(b.id)
  );
  const taken = new Set<string>();
  const slugs = new Map<string, string>();
  for (const event of ordered) {
    const base = baseEventSlug(event);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    slugs.set(event.id, slug);
  }
  return slugs;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when a URL segment is an event id rather than a slug. */
export function looksLikeEventId(segment: string): boolean {
  return UUID.test(segment);
}

/**
 * The event a URL segment names: an id as it is, a slug through `slugs`
 * (eventSlugs). Null when it is a slug no event has.
 */
export function resolveEventSegment(segment: string, slugs: ReadonlyMap<string, string>): string | null {
  for (const [id, slug] of slugs) {
    if (slug === segment || id === segment) return id;
  }
  return looksLikeEventId(segment) ? segment : null;
}

/** An event page's path: by slug when known, else by id. */
export function eventPagePath(eventId: string, slugs?: ReadonlyMap<string, string>): string {
  return `/events/${encodeURIComponent(slugs?.get(eventId) ?? eventId)}`;
}
