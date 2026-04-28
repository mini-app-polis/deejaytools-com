import { Link } from "react-router-dom";

/**
 * Long-form public guide to the floor-trial process.
 *
 * Audience: someone landing on DeejayTools for the first time who may not
 * even know what a floor trial is. Reads top-to-bottom as a walkthrough,
 * but each section is also linkable from elsewhere on the site (e.g. an
 * empty-state on the Songs page can deep-link to #submitting-music).
 *
 * The shorter, vague version of this content used to live on the homepage.
 * It got collapsed here to keep the homepage focused on entry-point cards
 * and to give every step room to actually be useful — concrete rules, real
 * time windows, and direct links to the page where the user takes that
 * action.
 */

type SectionKey =
  | "what-is-a-floor-trial"
  | "what-this-site-does"
  | "submitting-music"
  | "checking-in"
  | "the-queue"
  | "running-your-routine"
  | "re-queueing";

type Section = {
  id: SectionKey;
  eyebrow: string;
  title: string;
};

// Stable list used for both the table-of-contents and the section anchors so
// they can never drift out of sync.
const SECTIONS: Section[] = [
  { id: "what-is-a-floor-trial", eyebrow: "01", title: "What is a floor trial?" },
  { id: "what-this-site-does",   eyebrow: "02", title: "What DeejayTools does" },
  { id: "submitting-music",      eyebrow: "03", title: "Submitting your music" },
  { id: "checking-in",           eyebrow: "04", title: "Checking in" },
  { id: "the-queue",             eyebrow: "05", title: "How the queue works" },
  { id: "running-your-routine",  eyebrow: "06", title: "When you take the floor" },
  { id: "re-queueing",           eyebrow: "07", title: "Going again" },
];

export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-10">
        <p
          className="text-[10px] font-medium tracking-[0.18em] uppercase text-primary mb-3"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          Guide
        </p>
        <h1 className="text-3xl sm:text-4xl font-light tracking-tight mb-2">
          How floor trials work
        </h1>
        <p className="text-sm text-muted-foreground font-light max-w-xl">
          Everything you need to know to submit music, check in, and run your
          routine — no prior experience required.
        </p>
      </header>

      {/* Table of contents */}
      <nav className="mb-12 rounded-xl border border-white/[0.07] bg-card/40 p-5">
        <p
          className="text-[10px] font-medium tracking-[0.18em] uppercase text-primary/60 mb-3"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          On this page
        </p>
        <ul className="space-y-1.5">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <span
                  className="inline-block w-7 text-primary/50 tabular-nums"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  {s.eyebrow}
                </span>
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12">
        <Section section={SECTIONS[0]!}>
          <p>
            A floor trial is a chance to perform your competition routine in
            the actual ballroom, on the actual floor, with the actual sound
            system, before the real competition. Most West Coast Swing
            conventions schedule one or two of these in the days leading up
            to the routine division finals — they're sometimes called
            "rehearsals," "practice runs," or "tech runs."
          </p>
          <p>
            The DJ plays your submitted music, you run your routine end-to-end,
            and you walk off the floor with a much better sense of where the
            tricky moments are, how loud the audience side feels, and whether
            your music levels need adjusting.
          </p>
        </Section>

        <Section section={SECTIONS[1]!}>
          <p>
            DeejayTools is the system the event DJ uses to manage the floor
            trial: which music files belong to which couples, who is checked
            in for which run, and what order to play them in. It also exposes
            the live queue to competitors so you don't have to keep walking
            up to the booth to ask "how many couples until us?"
          </p>
          <p>
            You'll use it to do four things: submit your music, register a
            partner, check in for a run, and watch the queue. Everything
            else happens automatically.
          </p>
        </Section>

        <Section section={SECTIONS[2]!}>
          <p>
            Before the event, upload the audio file for your routine. The file
            should contain <strong className="text-foreground">only</strong>{" "}
            your routine — no introduction music, no bow music, no buffer at
            the front. The DJ starts playback at <code className="px-1 rounded bg-muted/30 text-foreground">00:00</code>{" "}
            unless you note a specific cue when you check in.
          </p>
          <p>
            Supported formats: MP3, WAV, M4A. Aim for a target loudness of
            around -14 LUFS (the same as Spotify); if that's gibberish to
            you, just don't normalize the file louder than your phone's
            built-in music app. Levels can always be tweaked at the booth, but
            heavily clipped audio can't be un-clipped.
          </p>
          <p>
            Submit one file per routine, per partnership. If you compete with
            two different partners or in two divisions, that's two separate
            files. Re-uploading replaces the previous version and bumps the
            version tag — the DJ always plays the latest one.
          </p>
          <ActionLink to="/songs/add">Submit a song →</ActionLink>
        </Section>

        <Section section={SECTIONS[3]!}>
          <p>
            On the day of the floor trial, check in once you arrive at the
            ballroom. Check-in opens <strong className="text-foreground">30
            minutes before</strong> the listed start time and stays open for
            the duration of the trial. If you check in before that window
            opens, the system will tell you so — there's no penalty for
            trying.
          </p>
          <p>
            Each check-in places one entry in the queue. To run a routine,
            you need (a) a song on file and (b) a partner registered against
            that song. If your partner has a DeejayTools account, link them
            from the Partners page so they can see the same queue you do; if
            they don't, just enter their name when you check in.
          </p>
          <ActionLink to="/floor-trials">Open Floor Trials →</ActionLink>
        </Section>

        <Section section={SECTIONS[4]!}>
          <p>
            The session has three queues, all visible on the session page.
          </p>
          <p>
            The <strong className="text-foreground">Active queue</strong> is
            the next handful of couples actually about to take the floor —
            usually four to six slots. The couple at the top is up next; the
            DJ is already cueing their music.
          </p>
          <p>
            The <strong className="text-foreground">Priority queue</strong> is
            the waitlist for couples in priority divisions whose first one,
            two, or three runs of the day haven't happened yet. Most
            conventions designate divisions like Classic and Showcase as
            priority because the routines are scored. Each priority division
            also has a per-day cap on how many runs count as priority — once
            you've used your priority runs, additional check-ins drop into
            the standard queue.
          </p>
          <p>
            The <strong className="text-foreground">Standard queue</strong> is
            for everyone else: priority divisions past their cap, and any
            non-priority divisions running today. Couples in this queue are
            served between priority slots whenever there's room in the active
            queue.
          </p>
          <p>
            You can refresh the page or just leave it open — it auto-updates
            as couples move through.
          </p>
        </Section>

        <Section section={SECTIONS[5]!}>
          <p>
            When you reach the top of the active queue, the announcer (or the
            display screen) will call your names. Walk to the floor. The DJ
            starts your music; the run begins.
          </p>
          <p>
            Couples typically run five minutes; teams typically run ten.
            That's the soft target — the DJ doesn't fade you out unless
            something has gone clearly wrong.
          </p>
          <p>
            If something <em>does</em> go wrong — a fall, a dropped lift, the
            wrong music — and you're still in the first half of the routine,
            you can ask for a restart. Past the halfway point, restarts
            aren't usually granted; you'll have to re-queue for another run
            instead.
          </p>
        </Section>

        <Section section={SECTIONS[6]!}>
          <p>
            Want another run? Check in again. There's no cooldown beyond
            "the queue has to actually progress" — your second check-in
            joins whichever queue your division qualifies for at that
            moment.
          </p>
          <p>
            Note that priority caps are per-day, not per-check-in. If your
            division has a cap of three priority runs and you've already
            done three, your fourth check-in will drop into the standard
            queue automatically.
          </p>
          <ActionLink to="/floor-trials">Back to Floor Trials →</ActionLink>
        </Section>
      </div>
    </div>
  );
}

function Section({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  return (
    <section id={section.id} className="scroll-mt-24">
      <div className="flex items-baseline gap-3 mb-4">
        <span
          className="text-xs text-primary/60 tabular-nums"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          {section.eyebrow}
        </span>
        <h2 className="text-xl sm:text-2xl font-light tracking-tight">
          {section.title}
        </h2>
      </div>
      <div className="space-y-3 text-sm text-muted-foreground font-light leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function ActionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <p className="pt-1">
      <Link
        to={to}
        className="text-sm font-medium text-primary hover:underline"
      >
        {children}
      </Link>
    </p>
  );
}
