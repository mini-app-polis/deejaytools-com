import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import HelpLayout from "@/components/help/HelpLayout";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type EntryGroup =
  | "Checking in"
  | "Uploading"
  | "Partners"
  | "Signing in and accounts"
  | "Things that look broken but aren't";

type TroubleEntry = {
  id: string;
  group: EntryGroup;
  /** Shown as the entry heading — must match visible UI/API text (or a FAQ question where noted). */
  heading: string;
  meaning: ReactNode;
  steps: ReactNode;
  /** Lowercase blob for search matching. */
  keywords: string;
};

const ENTRIES: TroubleEntry[] = [
  // ── Checking in ──────────────────────────────────────────────────────────
  {
    id: "checkin-not-open",
    group: "Checking in",
    heading: "Check-in has not opened yet",
    meaning: (
      <>
        You tried to check in before the session&apos;s check-in time. The window has not started.
      </>
    ),
    steps: (
      <>
        Note the check-in time on the session card on{" "}
        <Link to="/floor-trials" className="text-primary hover:underline">
          Floor Trials
        </Link>
        . Come back when that time arrives — there is no penalty for trying early.
      </>
    ),
    keywords: "check-in has not opened yet before time early",
  },
  {
    id: "checkin-closed",
    group: "Checking in",
    heading: "Check-in is closed for this session",
    meaning: (
      <>
        The floor trial block has ended. Check-in stays open until the session ends, not until
        dancing starts — but once the block is over, new check-ins are rejected.
      </>
    ),
    steps: (
      <>
        You cannot check in to this session anymore. If you still need a run, ask at the deejay booth
        or watch for another session on{" "}
        <Link to="/floor-trials" className="text-primary hover:underline">
          Floor Trials
        </Link>
        .
      </>
    ),
    keywords: "check-in is closed for this session ended after",
  },
  {
    id: "already-in-queue-toast",
    group: "Checking in",
    heading: "You're already in the queue for this session.",
    meaning: (
      <>
        This partnership (or solo entry) already has a live queue spot in this session. The server
        message is &ldquo;This entity already has a live queue entry in this session&rdquo; — the app
        shows this shorter version in a toast after you submit.
      </>
    ),
    steps: (
      <>
        <Link to="/my-content#checkins" className="text-primary hover:underline">
          My Content → Check-ins
        </Link>{" "}
        → <strong>Withdraw from queue</strong>, then check in again if you still need a run. Or use a
        different partnership (solo vs couple, or a different partner). See{" "}
        <Link to="/how-it-works/checking-in" className="text-primary hover:underline">
          Checking in
        </Link>
        .
      </>
    ),
    keywords: "already in the queue for this session entity live entry",
  },
  {
    id: "partnership-in-queue-form",
    group: "Checking in",
    heading:
      "This partnership is already in the queue. Pick a different song or withdraw your current entry first.",
    meaning: (
      <>
        The check-in form detected that the partnership for the song you selected is already waiting
        or on deck. This appears on the confirmation card before you submit.
      </>
    ),
    steps: (
      <>
        Pick a different song (different partnership), or withdraw your current entry on{" "}
        <Link to="/my-content#checkins" className="text-primary hover:underline">
          My Content → Check-ins
        </Link>{" "}
        first (visible once you have a live queue entry).
      </>
    ),
    keywords: "partnership already in the queue pick different song withdraw",
  },
  {
    id: "song-not-submitted-event",
    group: "Checking in",
    heading:
      "This song hasn't been submitted to this event. Add it to the event on My Content before checking in.",
    meaning: (
      <>
        The song exists in your library but is not linked to this event. Uploading a file and
        submitting it to an event are separate steps.
      </>
    ),
    steps: (
      <>
        For most events, go to{" "}
        <Link to="/event-submissions" className="text-primary hover:underline">
          Event submissions
        </Link>
        . For <strong>The Open</strong>, use{" "}
        <Link to="/open-submissions" className="text-primary hover:underline">
          The Open submissions
        </Link>{" "}
        instead — The Open does not appear on the generic Event submissions page. Add the song to the
        correct event, then return to the session page and check in. See{" "}
        <Link to="/how-it-works/submitting-music#event-submission-required" className="text-primary hover:underline">
          Uploading vs event submission
        </Link>
        .
      </>
    ),
    keywords: "song hasn't been submitted to this event my content check in",
  },
  {
    id: "division-not-offered",
    group: "Checking in",
    heading:
      "Your song's division (…) isn't offered in this session. Please pick the closest match above.",
    meaning: (
      <>
        Your song&apos;s division is not one of the divisions configured for this floor trial. The
        parentheses show your song&apos;s division name. This is a warning on the check-in form, not
        a hard block — you must pick a division that <em>is</em> offered.
      </>
    ),
    steps: (
      <>
        Choose the closest division from the list on the form. If none fit, confirm you are on the
        right session or ask at the booth.
      </>
    ),
    keywords: "division isn't offered in this session closest match above",
  },
  {
    id: "division-not-configured",
    group: "Checking in",
    heading: "Division not configured for this session",
    meaning: (
      <>
        The division you submitted is not set up for this session on the server. This usually means
        the division name does not match any row in the session&apos;s division list.
      </>
    ),
    steps: (
      <>
        On the check-in form, pick a division that appears in the session&apos;s division list. If
        the list looks wrong, ask an admin or the deejay booth to verify session setup.
      </>
    ),
    keywords: "division not configured for this session admission",
  },

  // ── Uploading ────────────────────────────────────────────────────────────
  {
    id: "file-100mb-client",
    group: "Uploading",
    heading: "That file is too large. Please choose an audio file under 100 MB.",
    meaning: (
      <>
        The browser blocks the upload before any chunks are sent when the file is over{" "}
        <strong className="text-foreground">100 MB</strong>. This is separate from the server-side
        assembled-file cap below.
      </>
    ),
    steps: (
      <>
        Export or compress your audio to under 100 MB (MP3, WAV, FLAC, or M4A), then upload again at{" "}
        <Link to="/songs/add" className="text-primary hover:underline">
          Add Song
        </Link>
        .
      </>
    ),
    keywords: "that file is too large please choose an audio file under 100 mb browser",
  },
  {
    id: "file-100mb-server",
    group: "Uploading",
    heading: "File exceeds 100 MB limit",
    meaning: (
      <>
        After all chunks arrive, the server assembles the file and rejects it if the assembled size
        exceeds <strong className="text-foreground">110 MB</strong>. The error message still reads{" "}
        &ldquo;File exceeds 100 MB limit.&rdquo; This can happen even when the original file was
        under the browser&apos;s 100 MB gate.
      </>
    ),
    steps: (
      <>
        Export or compress your audio further, then upload again at{" "}
        <Link to="/songs/add" className="text-primary hover:underline">
          Add Song
        </Link>
        .
      </>
    ),
    keywords: "file exceeds 100 mb limit assembled server",
  },
  {
    id: "unsupported-format",
    group: "Uploading",
    heading:
      "That file doesn't look like a supported audio format. Please upload an MP3, WAV, FLAC, or M4A.",
    meaning: (
      <>
        The server checked the file contents (magic bytes), not the filename. Renaming a non-audio
        file will not help.
      </>
    ),
    steps: (
      <>
        Re-export from your DAW or converter as MP3, WAV, FLAC, or M4A. See{" "}
        <Link to="/how-it-works/submitting-music" className="text-primary hover:underline">
          Submitting your music
        </Link>
        .
      </>
    ),
    keywords: "doesn't look like a supported audio format mp3 wav flac m4a magic bytes",
  },
  {
    id: "session-expired-upload",
    group: "Uploading",
    heading: "Your session expired. Please sign in again and retry the upload.",
    meaning: (
      <>
        Your sign-in token expired while chunks were uploading. The upload cannot resume mid-file.
      </>
    ),
    steps: (
      <>
        Sign in again, then start the upload from the beginning on{" "}
        <Link to="/songs/add" className="text-primary hover:underline">
          Add Song
        </Link>
        .
      </>
    ),
    keywords: "session expired sign in again retry upload",
  },
  {
    id: "network-error-upload",
    group: "Uploading",
    heading: "Network error (…) — check your connection and try again.",
    meaning: (
      <>
        A chunk failed to reach the server (connection drop, timeout, or offline). The parentheses
        contain technical detail from the browser. Each chunk is tried up to three times before
        showing this.
      </>
    ),
    steps: (
      <>
        Check Wi‑Fi or cellular signal and try the upload again. If it keeps failing on hotel or
        venue networks, try a different connection or ask at the booth.
      </>
    ),
    keywords: "network error check your connection try again upload chunk",
  },
  {
    id: "name-required-upload",
    group: "Uploading",
    heading:
      "Set your first and last name on the My Profile page so we can label your uploads correctly.",
    meaning: (
      <>
        The upload form needs your name to build the processed filename the deejay sees in Drive.
      </>
    ),
    steps: (
      <>
        Open{" "}
        <Link to="/my-profile" className="text-primary hover:underline">
          My Profile
        </Link>
        , fill in first and last name, save, then return to{" "}
        <Link to="/songs/add" className="text-primary hover:underline">
          Add Song
        </Link>
        .
      </>
    ),
    keywords: "set your first and last name my profile label uploads",
  },
  {
    id: "partner-required-upload",
    group: "Uploading",
    heading: "You need a partner to upload. Add one on the My Profile page.",
    meaning: (
      <>
        &ldquo;Upload for myself&rdquo; requires at least one partner on your roster because couple
        routines are uploaded as a partnership.
      </>
    ),
    steps: (
      <>
        Add a partner on{" "}
        <Link to="/my-profile" className="text-primary hover:underline">
          My Profile
        </Link>
        , or use{" "}
        <Link to="/songs/add" className="text-primary hover:underline">
          Teams, Cabaret, Other
        </Link>{" "}
        if you are uploading for a special division.
      </>
    ),
    keywords: "you need a partner to upload my profile",
  },
  {
    id: "team-required-upload",
    group: "Uploading",
    heading: "You need a team to upload. Add one on the My Profile page.",
    meaning: (
      <>
        On the Teams, Cabaret, Other upload tab, the Teams division requires a team record.
      </>
    ),
    steps: (
      <>
        Create a team on{" "}
        <Link to="/my-profile" className="text-primary hover:underline">
          My Profile
        </Link>
        , then return to Add Song → Teams, Cabaret, Other.
      </>
    ),
    keywords: "you need a team to upload my profile teams",
  },

  // ── Partners ─────────────────────────────────────────────────────────────
  {
    id: "partner-active-checkin",
    group: "Partners",
    heading:
      "This partner has an active check-in and cannot be deleted. Complete or withdraw the check-in first.",
    meaning: (
      <>
        This partner is tied to a queue entry that is still live. The app blocks deletion until that
        entry is gone.
      </>
    ),
    steps: (
      <>
        <Link to="/my-content#checkins" className="text-primary hover:underline">
          My Content → Check-ins
        </Link>{" "}
        → withdraw the active entry, or wait until the run finishes. Then try removing the partner
        again on{" "}
        <Link to="/my-profile" className="text-primary hover:underline">
          My Profile
        </Link>
        .
      </>
    ),
    keywords: "partner active check-in cannot be deleted withdraw complete",
  },
  {
    id: "partner-history",
    group: "Partners",
    heading:
      "This partner has check-in history. Their historical data will be preserved after deletion.",
    meaning: (
      <>
        This is informational, not a block. Past check-ins and runs stay in the record after you
        remove the partner from your roster.
      </>
    ),
    steps: (
      <>
        If you still want them off your list, confirm delete on{" "}
        <Link to="/my-profile" className="text-primary hover:underline">
          My Profile
        </Link>
        .
      </>
    ),
    keywords: "partner check-in history preserved after deletion",
  },
  {
    id: "partner-linked-songs",
    group: "Partners",
    heading:
      "This partner is linked to N song(s). Deleting will remove the partner from those songs.",
    meaning: (
      <>
        The dialog shows the actual count instead of &ldquo;N&rdquo; — for example, &ldquo;This
        partner is linked to 2 songs. Deleting will remove the partner from those songs.&rdquo;
      </>
    ),
    steps: (
      <>
        If you delete, those songs remain but lose this partner link. Upload again with a different
        partner if needed. See{" "}
        <Link to="/how-it-works/partners" className="text-primary hover:underline">
          Partners &amp; teams
        </Link>
        .
      </>
    ),
    keywords: "partner linked to songs deleting will remove",
  },

  // ── Signing in ───────────────────────────────────────────────────────────
  {
    id: "user-not-synced",
    group: "Signing in and accounts",
    heading: "Call POST /v1/auth/sync first",
    meaning: (
      <>
        You are signed in with Clerk, but DeejayTools does not have your account row yet — the site
        has not finished setting up your profile. API calls return this message (code{" "}
        <code className="px-1 rounded bg-muted/30 text-foreground">USER_NOT_SYNCED</code>) and it
        often appears as a toast when a page tries to load your data.
      </>
    ),
    steps: (
      <>
        Open any page inside the main app (for example{" "}
        <Link to="/my-content" className="text-primary hover:underline">
          My Content
        </Link>
        ) — not the landing page alone — so account sync can run. Reload the page once. AuthSync runs
        once per browser session; a reload helps if{" "}
        <code className="px-1 rounded bg-muted/30 text-foreground">sessionStorage</code> was cleared.
        If it persists, sign out and sign back in.
      </>
    ),
    keywords: "call post auth sync first user_not_synced signed in account setup",
  },

  // ── Looks broken ─────────────────────────────────────────────────────────
  {
    id: "faq-not-in-checkin-list",
    group: "Things that look broken but aren't",
    heading: "My song is uploaded but doesn't appear in the check-in list",
    meaning: (
      <>
        The check-in form only lists songs you submitted to <em>this event</em>, not every song in
        your library.
      </>
    ),
    steps: (
      <>
        For most events, submit the song on{" "}
        <Link to="/event-submissions" className="text-primary hover:underline">
          Event submissions
        </Link>
        . For <strong>The Open</strong>, use{" "}
        <Link to="/open-submissions" className="text-primary hover:underline">
          The Open submissions
        </Link>
        , then reopen the session check-in form.
      </>
    ),
    keywords: "song uploaded doesn't appear check-in list event submission",
  },
  {
    id: "faq-queue-not-moving",
    group: "Things that look broken but aren't",
    heading: "The queue hasn't moved",
    meaning: (
      <>
        The session page refreshes about once a minute — it is not live video. Also, Standard queue
        entries only promote when the Priority queue is completely empty.
      </>
    ),
    steps: (
      <>
        Wait for the next refresh, or reload the page. Read{" "}
        <Link to="/how-it-works/the-queue" className="text-primary hover:underline">
          Watching the queue
        </Link>{" "}
        for caps and the Standard-waits-for-Priority rule.
      </>
    ),
    keywords: "queue hasn't moved refresh standard priority empty stall",
  },
  {
    id: "faq-no-completed-floor-trials",
    group: "Things that look broken but aren't",
    heading: "I don't see a completed session on the Floor Trials page",
    meaning: (
      <>
        Floor Trials lists only active and upcoming sessions. Completed and cancelled sessions are
        hidden there.
      </>
    ),
    steps: (
      <>
        Open the full session list at{" "}
        <Link to="/sessions" className="text-primary hover:underline">
          Sessions
        </Link>{" "}
        (requires sign-in).
      </>
    ),
    keywords: "completed session floor trials page upcoming active only sessions list",
  },
  {
    id: "faq-legacy-no-play",
    group: "Things that look broken but aren't",
    heading: "My legacy song has no play button",
    meaning: (
      <>
        Legacy catalog rows were imported without an audio file. The button shows{" "}
        <strong>Legacy Song</strong> with tooltip &ldquo;This song was imported from the legacy
        catalog and has no uploaded audio file.&rdquo;
      </>
    ),
    steps: (
      <>
        Upload the routine again at{" "}
        <Link to="/songs/add" className="text-primary hover:underline">
          Add Song
        </Link>
        , submit it to the event, then check in.
      </>
    ),
    keywords: "legacy song no play button imported catalog audio",
  },
  {
    id: "faq-priority-to-standard",
    group: "Things that look broken but aren't",
    heading: "I was in the priority queue last time and now I'm in standard",
    meaning: (
      <>
        Priority placement depends on how many completed runs you already have in this division
        during this session (and any event-wide cap). After you use your priority run allowance,
        further check-ins go to Standard automatically.
      </>
    ),
    steps: (
      <>
        This is expected, not a bug. Details in{" "}
        <Link to="/how-it-works/the-queue" className="text-primary hover:underline">
          Watching the queue
        </Link>
        .
      </>
    ),
    keywords: "priority queue last time now standard run limit division",
  },
];

const GROUP_ORDER: EntryGroup[] = [
  "Checking in",
  "Uploading",
  "Partners",
  "Signing in and accounts",
  "Things that look broken but aren't",
];

function TroubleEntryBlock({ entry }: { entry: TroubleEntry }) {
  return (
    <article id={entry.id} className="scroll-mt-24 space-y-2">
      <h3 className="text-base font-medium text-foreground leading-snug">{entry.heading}</h3>
      <div className="text-sm text-foreground/75 leading-relaxed space-y-3">
        <p>
          <span className="text-muted-foreground">What it means: </span>
          {entry.meaning}
        </p>
        <p>
          <span className="text-muted-foreground">What to do: </span>
          {entry.steps}
        </p>
      </div>
    </article>
  );
}

export default function TroubleshootingPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ENTRIES;
    return ENTRIES.filter(
      (e) =>
        e.heading.toLowerCase().includes(q) ||
        e.keywords.includes(q) ||
        e.group.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<EntryGroup, TroubleEntry[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const e of filtered) {
      map.get(e.group)?.push(e);
    }
    return GROUP_ORDER.map((g) => ({ group: g, items: map.get(g) ?? [] })).filter(
      (s) => s.items.length > 0
    );
  }, [filtered]);

  return (
    <HelpLayout
      topicId="troubleshooting"
      title="Troubleshooting"
      description="The app told you no — here's why, and what to do next. Search by the exact message you saw."
    >
      <div className="space-y-4 mb-8">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search messages… e.g. submitted to this event, 100 MB, queue"
          className="max-w-lg"
          aria-label="Filter troubleshooting entries"
        />
        {query.trim() && (
          <p className="text-xs text-muted-foreground">
            {filtered.length === 0
              ? "No matches — try a shorter phrase or browse all sections below."
              : `${filtered.length} match${filtered.length === 1 ? "" : "es"}`}
          </p>
        )}
      </div>

      <div className="space-y-10">
        {grouped.map(({ group, items }) => (
          <section key={group}>
            <h2 className="text-lg font-light tracking-tight text-foreground mb-5">{group}</h2>
            <div className="space-y-8">
              {items.map((entry, i) => (
                <div key={entry.id}>
                  {i > 0 && <Separator className="mb-8 bg-white/[0.07]" />}
                  <TroubleEntryBlock entry={entry} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </HelpLayout>
  );
}
