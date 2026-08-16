export type HelpTopicId =
  | "floor-trials"
  | "submitting-music"
  | "checking-in"
  | "the-queue"
  | "partners"
  | "on-the-floor"
  | "troubleshooting";

export type HelpTopic = {
  id: HelpTopicId;
  path: `/how-it-works/${HelpTopicId}`;
  eyebrow: string;
  title: string;
  description: string;
};

/** Reading order for prev/next navigation and the hub grid. */
export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "floor-trials",
    path: "/how-it-works/floor-trials",
    eyebrow: "01",
    title: "Floor trials",
    description: "What a floor trial is and how a block runs on event day.",
  },
  {
    id: "submitting-music",
    path: "/how-it-works/submitting-music",
    eyebrow: "02",
    title: "Submitting your music",
    description: "File requirements, uploading, and confirming the deejay has your routine.",
  },
  {
    id: "checking-in",
    path: "/how-it-works/checking-in",
    eyebrow: "03",
    title: "Checking in",
    description: "The check-in window and what the form needs from you.",
  },
  {
    id: "the-queue",
    path: "/how-it-works/the-queue",
    eyebrow: "04",
    title: "Watching the queue",
    description: "Active, priority, and standard queues — runs, caps, and what to expect.",
  },
  {
    id: "partners",
    path: "/how-it-works/partners",
    eyebrow: "05",
    title: "Partners & teams",
    description: "Partners, teams, managed partnerships, and solo routines.",
  },
  {
    id: "on-the-floor",
    path: "/how-it-works/on-the-floor",
    eyebrow: "06",
    title: "On the floor",
    description: "Preparing to run, your turn, going again, and etiquette.",
  },
  {
    id: "troubleshooting",
    path: "/how-it-works/troubleshooting",
    eyebrow: "07",
    title: "Troubleshooting",
    description: "Why can't I check in, upload, or see my song?",
  },
];

/** Old single-page anchor ids → new route (hash preserved for scroll targets). */
export const LEGACY_HASH_REDIRECTS: Record<string, HelpTopic["path"]> = {
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

export function helpTopicById(id: HelpTopicId): HelpTopic {
  const topic = HELP_TOPICS.find((t) => t.id === id);
  if (!topic) throw new Error(`Unknown help topic: ${id}`);
  return topic;
}

export function helpTopicNeighbors(id: HelpTopicId): {
  prev: HelpTopic | null;
  next: HelpTopic | null;
} {
  const idx = HELP_TOPICS.findIndex((t) => t.id === id);
  return {
    prev: idx > 0 ? HELP_TOPICS[idx - 1]! : null,
    next: idx >= 0 && idx < HELP_TOPICS.length - 1 ? HELP_TOPICS[idx + 1]! : null,
  };
}
