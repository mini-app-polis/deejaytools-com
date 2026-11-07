import {
  ROUND_SPLIT_DIVISION,
  type ApiAdminEventSongSubmission,
  type ApiEventRegistration,
} from "@/schemas";

/**
 * An event's registration list against its song submissions, for the admin
 * Registrations page: who is registered and has not submitted music yet.
 *
 * The list comes from the event's own registration export, pasted in, so its
 * division names and spellings are the registration's, not deejaytools'.
 * An entry is covered when a submission in its division names all its
 * dancers exactly (ignoring only case, accents, punctuation and spacing).
 * Names that are almost the same (a typo, a shortened first name), or an
 * exact match in another division, are shown as a possible match for the
 * admin to link by hand. One shared name is not a match at all.
 */

// ---------------------------------------------------------------------------
// Parsing a pasted registration export
// ---------------------------------------------------------------------------

export type ParsedRegistration = { division: string; dancer_1: string; dancer_2?: string };

export type ParseResult = {
  entries: ParsedRegistration[];
  /** Non-blank lines that were not entries: section headings, totals and the like. */
  skipped: number;
};

/** Where the columns are when the paste has no header row naming them. */
const DEFAULT_COLUMNS = { division: 1, dancer1: 2, dancer2: 5 };

function cellKey(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The column layout a header row names (Division, Dancer 1, Dancer 2), if this is one. */
function headerColumns(cells: string[]): typeof DEFAULT_COLUMNS | null {
  const keys = cells.map(cellKey);
  const division = keys.indexOf("division");
  const dancer1 = keys.findIndex((k) => k === "dancer 1" || k === "dancer1" || k === "leader");
  if (division === -1 || dancer1 === -1) return null;
  const dancer2 = keys.findIndex((k) => k === "dancer 2" || k === "dancer2" || k === "follower");
  return { division, dancer1, dancer2 };
}

/**
 * Entries from tab-separated text copied out of a spreadsheet. A header row
 * naming "Division", "Dancer 1" and "Dancer 2" sets the columns (else the
 * layout of The Open's export: #, Division, Dancer 1, …, Dancer 2 at index 5).
 * A line without both a division and a first dancer is skipped, so section
 * headings and "Countries" rows drop out. Other columns are ignored.
 */
export function parseRegistrationPaste(text: string): ParseResult {
  let columns = DEFAULT_COLUMNS;
  const entries: ParsedRegistration[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.split("\t");
    const header = headerColumns(cells);
    if (header) {
      columns = header;
      skipped++;
      continue;
    }
    const division = (cells[columns.division] ?? "").trim().replace(/\s+/g, " ");
    const dancer1 = (cells[columns.dancer1] ?? "").trim().replace(/\s+/g, " ");
    if (!division || !dancer1) {
      skipped++;
      continue;
    }
    const dancer2 =
      columns.dancer2 >= 0 ? (cells[columns.dancer2] ?? "").trim().replace(/\s+/g, " ") : "";
    entries.push(dancer2 ? { division, dancer_1: dancer1, dancer_2: dancer2 } : { division, dancer_1: dancer1 });
  }
  return { entries, skipped };
}

// ---------------------------------------------------------------------------
// Divisions
// ---------------------------------------------------------------------------

function plain(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Keyword rules, most specific first: the first that matches names the division. */
const DIVISION_RULES: readonly [RegExp, string][] = [
  [/\bpro ?am\b.*\bleader\b/, "ProAm LeaderAm"],
  [/\bpro ?am\b.*\bfollow/, "ProAm FollowerAm"],
  [/\b(rising star|rst)\b.*\bshowcase\b/, "Rising Star Showcase"],
  [/\b(rising star|rst)\b/, "Rising Star Classic"],
  [/\b(novint|novice|intermediate)\b/, "NovInt Routines"],
  [/\bsophisticated\b/, "Sophisticated"],
  [/\bmasters?\b/, "Masters"],
  [/\byoung adults?\b/, "Young Adult"],
  [/\bjuniors?\b/, "Juniors"],
  [/\bshag\b/, "Carolina Shag Divisions"],
  [/\bteams?\b/, "Teams"],
  [/\bcabaret\b/, "Cabaret"],
  [/\bexhibition\b/, "Exhibition"],
  [/\bsuperstar\b/, "Superstar"],
  [/\bshowcase\b/, "Showcase"],
  [/\bclassic\b/, "Classic"],
];

/**
 * The deejaytools division a registration's division name stands for, or
 * null when none is recognised (then a submission in any division may match).
 * Only names in `divisions` (GET /v1/divisions) are returned.
 */
export function divisionForRegistration(name: string, divisions: readonly string[]): string | null {
  const key = plain(name);
  const exact = divisions.find((d) => plain(d) === key);
  if (exact) return exact;
  for (const [pattern, division] of DIVISION_RULES) {
    if (pattern.test(key)) return divisions.includes(division) ? division : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Optimal string alignment distance: edits, counting a swap of neighbours as one. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Close enough to be the same word: a typo allowed in longer words. */
function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  if (longest < 4) return false;
  return editDistance(a, b) <= (longest >= 7 ? 2 : 1);
}

/** How two written names compare: "exact", "close", or "none". */
export type NameCloseness = "exact" | "close" | "none";

/**
 * How two written names compare: "exact" when they are the same apart from
 * case, accents, punctuation and spacing; "close" when they differ by a typo
 * or a shortened first name; "none" otherwise.
 */
export function nameCloseness(a: string, b: string): NameCloseness {
  const pa = plain(a);
  const pb = plain(b);
  if (!pa || !pb) return "none";
  if (pa === pb || pa.replace(/ /g, "") === pb.replace(/ /g, "")) return "exact";
  return almostSameName(pa, pb) ? "close" : "none";
}

/** Two plain names that differ by a typo or a shortened first name. */
function almostSameName(pa: string, pb: string): boolean {
  const ta = pa.split(" ");
  const tb = pb.split(" ");
  if (ta.length >= 2 && tb.length >= 2) {
    const lastA = ta.slice(1).join("");
    const lastB = tb.slice(1).join("");
    const firstA = ta[0];
    const firstB = tb[0];
    const firstOk =
      similar(firstA, firstB) ||
      (Math.min(firstA.length, firstB.length) >= 3 && (firstA.startsWith(firstB) || firstB.startsWith(firstA)));
    return firstOk && similar(lastA, lastB);
  }
  return similar(pa.replace(/ /g, ""), pb.replace(/ /g, ""));
}

/** The people a partnership label names: "A & B", or one name. */
export function labelNames(label: string): string[] {
  return label
    .split(/\s+&\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function entryNames(entry: Pick<ApiEventRegistration, "dancer_1" | "dancer_2">): string[] {
  return [entry.dancer_1, entry.dancer_2].filter((n): n is string => !!n && !!n.trim());
}

/**
 * Whether every one of `names` finds a distinct part: "exact" when each does
 * exactly, "close" when some only almost do, "none" when any finds nothing.
 */
function matchAll(names: readonly string[], parts: readonly string[]): NameCloseness {
  const free = [...parts];
  let close = false;
  for (const name of names) {
    let at = free.findIndex((p) => nameCloseness(name, p) === "exact");
    if (at === -1) {
      at = free.findIndex((p) => nameCloseness(name, p) === "close");
      close = true;
    }
    if (at === -1) return "none";
    free.splice(at, 1);
  }
  return close ? "close" : "exact";
}

/**
 * How an entry's names meet a submission's partnership label. A team
 * entry matches on any one name (its team name or its contact), or when the
 * label contains its team name.
 */
function nameMatch(
  entry: Pick<ApiEventRegistration, "dancer_1" | "dancer_2">,
  label: string,
  isTeam: boolean
): NameCloseness {
  const names = entryNames(entry);
  const parts = labelNames(label);
  if (isTeam) {
    const whole = plain(label);
    const each = names.flatMap((n) => parts.map((p) => nameCloseness(n, p)));
    if (each.includes("exact") || names.some((n) => plain(n).length >= 4 && whole.includes(plain(n)))) return "exact";
    return each.includes("close") ? "close" : "none";
  }
  return matchAll(names, parts);
}

// ---------------------------------------------------------------------------
// Reconciling
// ---------------------------------------------------------------------------

export type RegistrationStatus =
  /** A submission covers it. */
  | "submitted"
  /** Classic at The Open with a song for only one of prelims and finals. */
  | "missing-round"
  /** Not covered, but a submission almost names its dancers, or names them in another division. */
  | "possible"
  /** Nothing submitted. */
  | "missing"
  /** The admin marked it as needing no submission here. */
  | "handled"
  /** Signed up but no longer competing; any songs stay submitted, off the event page. */
  | "scratched";

export type ReconciledRegistration = {
  entry: ApiEventRegistration;
  /** The deejaytools division its registration division stands for, if recognised. */
  division: string | null;
  status: RegistrationStatus;
  /** The submissions that cover it (linked by hand, or matched by name). */
  matches: ApiAdminEventSongSubmission[];
  /** Submissions that look like it, for a "possible" entry. */
  candidates: ApiAdminEventSongSubmission[];
  /** For "missing-round": the round no song covers yet. */
  missingRound?: "prelims" | "finals";
};

export type Reconciliation = {
  rows: ReconciledRegistration[];
  /** Submissions no entry accounts for: not linked or matched by any entry. */
  unregistered: ApiAdminEventSongSubmission[];
};

/** Whether two partnership labels are the same, case, accents and punctuation aside. */
export function sameLabel(a: string, b: string): boolean {
  return plain(a) === plain(b);
}

function roundGap(subs: readonly ApiAdminEventSongSubmission[]): "prelims" | "finals" | undefined {
  let prelims = false;
  let finals = false;
  for (const s of subs) {
    if (s.round === "prelims_and_finals" || s.round === "prelims_only") prelims = true;
    if (s.round === "prelims_and_finals" || s.round === "finals_only") finals = true;
  }
  if (prelims && !finals) return "finals";
  if (finals && !prelims) return "prelims";
  return undefined;
}

/**
 * Each registration entry's status against the event's submissions, in list
 * order, and the submissions no entry accounts for.
 *
 * An entry linked by hand (`linked_label`) is covered by every submission
 * with that partnership label, in any division. Otherwise it is covered by
 * submissions in its division (any, when its division is not recognised)
 * whose label names all its dancers exactly. It looks like a submission whose
 * label almost names them (any division) or names them in another division. `roundsSplit` (The Open) checks a
 * Classic entry's songs cover both prelims and finals.
 */
export function reconcileRegistrations(
  entries: readonly ApiEventRegistration[],
  submissions: readonly ApiAdminEventSongSubmission[],
  divisions: readonly string[],
  roundsSplit: boolean
): Reconciliation {
  const accounted = new Set<string>();
  const rows = entries.map((entry): ReconciledRegistration => {
    const division = divisionForRegistration(entry.division, divisions);
    const isTeam = division === "Teams" || division === "Cabaret";
    const inDivision = (s: ApiAdminEventSongSubmission) => division === null || s.division?.trim() === division;

    let matches: ApiAdminEventSongSubmission[];
    let candidates: ApiAdminEventSongSubmission[] = [];
    if (entry.linked_label) {
      const linked = entry.linked_label;
      matches = submissions.filter((s) => sameLabel(s.partnership_label, linked));
    } else {
      matches = [];
      for (const s of submissions) {
        const how = nameMatch(entry, s.partnership_label, isTeam);
        if (how === "exact" && inDivision(s)) matches.push(s);
        else if (how !== "none") candidates.push(s);
      }
    }
    for (const s of matches) accounted.add(s.id);
    if (matches.length > 0) candidates = [];

    let status: RegistrationStatus;
    let missingRound: "prelims" | "finals" | undefined;
    if (entry.scratched) status = "scratched";
    else if (entry.handled) status = "handled";
    else if (matches.length > 0) {
      missingRound = roundsSplit && division === ROUND_SPLIT_DIVISION ? roundGap(matches) : undefined;
      status = missingRound ? "missing-round" : "submitted";
    } else status = candidates.length > 0 ? "possible" : "missing";

    return { entry, division, status, matches, candidates, ...(missingRound ? { missingRound } : {}) };
  });
  const unregistered = submissions.filter((s) => !accounted.has(s.id));
  return { rows, unregistered };
}

/** Statuses that still need the admin's attention. */
export const NEEDS_ATTENTION: readonly RegistrationStatus[] = ["missing", "possible", "missing-round"];

/** One line per entry, "Division: Dancer 1 & Dancer 2", for pasting into a message. */
export function registrationLines(rows: readonly ReconciledRegistration[]): string {
  return rows
    .map(({ entry }) => `${entry.division}: ${entryNames(entry).join(" & ")}`)
    .join("\n");
}

/** An entry's dancers as one name: "Dancer 1 & Dancer 2". */
export function registrationName(entry: Pick<ApiEventRegistration, "dancer_1" | "dancer_2">): string {
  return entryNames(entry).join(" & ");
}
