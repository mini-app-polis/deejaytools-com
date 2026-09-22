import { describe, expect, it } from "vitest";
import {
  HELP_TOPICS,
  LEGACY_HASH_REDIRECTS,
  helpTopicNeighbors,
  type HelpTopicId,
} from "./helpTopics";

const LEGACY_ANCHORS = [
  "what-is-a-floor-trial",
  "submitting-music",
  "confirming-music-on-file",
  "checking-in",
  "the-queue",
  "preparing-to-run",
  "during-your-run",
  "going-again",
  "etiquette",
] as const;

const EXPECTED_REDIRECTS: Record<(typeof LEGACY_ANCHORS)[number], string> = {
  "what-is-a-floor-trial": "/how-it-works/floor-trials",
  "submitting-music": "/how-it-works/submitting-music",
  "confirming-music-on-file": "/how-it-works/submitting-music",
  "checking-in": "/how-it-works/checking-in",
  "the-queue": "/how-it-works/the-queue",
  "preparing-to-run": "/how-it-works/on-the-floor",
  "during-your-run": "/how-it-works/on-the-floor",
  "going-again": "/how-it-works/on-the-floor",
  etiquette: "/how-it-works/on-the-floor",
};

describe("LEGACY_HASH_REDIRECTS", () => {
  it("contains exactly the nine legacy anchors", () => {
    expect(Object.keys(LEGACY_HASH_REDIRECTS).sort()).toEqual([...LEGACY_ANCHORS].sort());
  });

  it.each(Object.entries(EXPECTED_REDIRECTS))(
    "maps #%s to %s",
    (anchor, path) => {
      expect(LEGACY_HASH_REDIRECTS[anchor]).toBe(path);
    }
  );

  it("only targets paths that exist in HELP_TOPICS", () => {
    const topicPaths = new Set(HELP_TOPICS.map((t) => t.path));
    for (const path of Object.values(LEGACY_HASH_REDIRECTS)) {
      expect(topicPaths.has(path)).toBe(true);
    }
  });
});

describe("HELP_TOPICS integrity", () => {
  it("gives every topic a unique id, title, and non-empty description", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const topic of HELP_TOPICS) {
      expect(topic.title.trim()).not.toBe("");
      expect(topic.description.trim()).not.toBe("");
      expect(topic.path).toBe(`/how-it-works/${topic.id}`);
    }
  });

  it("chains prev/next through every topic with no orphans", () => {
    const visitedForward = new Set<HelpTopicId>();
    let current = HELP_TOPICS[0]!.id;

    for (let i = 0; i < HELP_TOPICS.length; i++) {
      visitedForward.add(current);
      const { prev, next } = helpTopicNeighbors(current);

      if (i === 0) {
        expect(prev).toBeNull();
      } else {
        expect(prev?.id).toBe(HELP_TOPICS[i - 1]!.id);
      }

      if (i === HELP_TOPICS.length - 1) {
        expect(next).toBeNull();
      } else {
        expect(next?.id).toBe(HELP_TOPICS[i + 1]!.id);
        current = next!.id;
      }
    }

    expect(visitedForward.size).toBe(HELP_TOPICS.length);

    current = HELP_TOPICS[HELP_TOPICS.length - 1]!.id;
    for (let i = HELP_TOPICS.length - 1; i >= 0; i--) {
      const { prev } = helpTopicNeighbors(current);
      if (i === 0) {
        expect(prev).toBeNull();
      } else {
        expect(prev?.id).toBe(HELP_TOPICS[i - 1]!.id);
        current = prev!.id;
      }
    }
  });
});
