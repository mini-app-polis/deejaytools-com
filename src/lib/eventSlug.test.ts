import { describe, expect, it } from "vitest";
import {
  baseEventSlug,
  eventPagePath,
  eventSlugs,
  looksLikeEventId,
  resolveEventSegment,
  slugify,
} from "./eventSlug";

const ID = "d4b20af5-045b-47b2-a9c3-34214dbaeca2";

describe("eventSlug", () => {
  it("slugifies names: lower-case, accents dropped, punctuation and spaces as one hyphen", () => {
    expect(slugify("The Open")).toBe("the-open");
    expect(slugify("  Café   Swing!! Fest ")).toBe("cafe-swing-fest");
    expect(slugify("DCSX: Dallas")).toBe("dcsx-dallas");
  });

  it("adds the start year unless the name already ends with it", () => {
    expect(baseEventSlug({ name: "The Open", start_date: "2026-11-26" })).toBe("the-open-2026");
    expect(baseEventSlug({ name: "Swing Fling 2026", start_date: "2026-05-01" })).toBe("swing-fling-2026");
    expect(baseEventSlug({ name: "2026", start_date: "2026-05-01" })).toBe("2026");
    expect(baseEventSlug({ name: "!!!", start_date: "2026-05-01" })).toBe("event-2026");
  });

  it("numbers a shared slug by creation order, so the older event keeps it", () => {
    const slugs = eventSlugs([
      { id: "b", name: "Fling", start_date: "2026-06-01", created_at: 20 },
      { id: "a", name: "Fling", start_date: "2026-01-01", created_at: 10 },
      { id: "c", name: "Fling 2026", start_date: "2026-09-01", created_at: 30 },
      { id: "d", name: "Fling", start_date: "2025-06-01", created_at: 5 },
    ]);
    expect(slugs.get("a")).toBe("fling-2026");
    expect(slugs.get("b")).toBe("fling-2026-2");
    expect(slugs.get("c")).toBe("fling-2026-3");
    expect(slugs.get("d")).toBe("fling-2025");
  });

  it("resolves a slug or an id to the event id", () => {
    const slugs = new Map([[ID, "the-open-2026"]]);
    expect(resolveEventSegment("the-open-2026", slugs)).toBe(ID);
    expect(resolveEventSegment(ID, slugs)).toBe(ID);
    expect(resolveEventSegment("nope-2026", slugs)).toBeNull();
    // An id not in the list still opens: the event page asks the API.
    const other = "11111111-2222-4333-8444-555555555555";
    expect(resolveEventSegment(other, slugs)).toBe(other);
    expect(looksLikeEventId(ID)).toBe(true);
    expect(looksLikeEventId("the-open-2026")).toBe(false);
  });

  it("builds an event page path by slug when known, else by id", () => {
    const slugs = new Map([[ID, "the-open-2026"]]);
    expect(eventPagePath(ID, slugs)).toBe("/events/the-open-2026");
    expect(eventPagePath("evt-x", slugs)).toBe("/events/evt-x");
    expect(eventPagePath("evt-x")).toBe("/events/evt-x");
  });
});
