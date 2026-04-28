import { Link } from "react-router-dom";

/**
 * Long-form public guide to the floor-trial process.
 *
 * Audience: someone landing on DeejayTools for the first time who may not
 * even know what a floor trial is. Reads top-to-bottom as a walkthrough,
 * but each section is also linkable from elsewhere on the site (e.g. the
 * AddSongPage description deep-links to #submitting-music).
 *
 * Source material: the official competitor information document Kaiano +
 * Libby write for events (last updated for The Open 2025). The platform
 * has changed since the doc was written — Google Forms / Sheets gave way
 * to dedicated pages on this site — so the wording here points readers at
 * the actual pages they need rather than at the old Forms.
 */

type SectionKey =
  | "what-is-a-floor-trial"
  | "the-deejay-team"
  | "submitting-music"
  | "confirming-music-on-file"
  | "checking-in"
  | "the-queue"
  | "preparing-to-run"
  | "during-your-run"
  | "going-again"
  | "etiquette";

type Section = {
  id: SectionKey;
  eyebrow: string;
  title: string;
};

// Stable list used for both the table-of-contents and the section anchors so
// they can never drift out of sync.
const SECTIONS: Section[] = [
  { id: "what-is-a-floor-trial",     eyebrow: "01", title: "What is a floor trial?" },
  { id: "the-deejay-team",           eyebrow: "02", title: "The deejay team" },
  { id: "submitting-music",          eyebrow: "03", title: "Submitting your music" },
  { id: "confirming-music-on-file",  eyebrow: "04", title: "Confirming your music is on file" },
  { id: "checking-in",               eyebrow: "05", title: "Checking in" },
  { id: "the-queue",                 eyebrow: "06", title: "Watching the queue" },
  { id: "preparing-to-run",          eyebrow: "07", title: "When you're next in line" },
  { id: "during-your-run",           eyebrow: "08", title: "When it's your turn" },
  { id: "going-again",               eyebrow: "09", title: "After your run" },
  { id: "etiquette",                 eyebrow: "10", title: "Etiquette and other notes" },
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
          Everything you need to know to submit music, check in, watch the
          queue, and run your routine — adapted from the official competitor
          information document.
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
            system, before the real competition. The deejay plays your
            submitted music, you run your routine end-to-end, and you walk
            off with a much better sense of where the tricky moments are,
            how the audience side feels, and whether your levels need
            adjusting.
          </p>
          <p>
            Floor trials are scheduled in blocks throughout the event. Each
            block has its own check-in window, its own queue, and its own
            seat at the deejay booth.
          </p>
        </Section>

        <Section section={SECTIONS[1]!}>
          <p>
            Kaiano Levine and Libby Wooton are the deejay team for routine
            competitions. The deejay booth is the central point of contact
            for anything that needs to be sorted out — technical problems,
            unusual cues, requests to skip your turn, anything else.
          </p>
          <p>
            A few practical notes:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              You'll often see the deejays in the room before the listed
              start time. Please wait until the floor trial has officially
              started (per the event schedule) before approaching with
              questions — that pre-start time is reserved for setup and
              minimizing technical issues. Updates and the official start
              are announced over the microphone.
            </li>
            <li>
              English is the working language at the booth. Libby
              understands French but typically replies in English. You're
              welcome to bring a friend, peer, or mentor as a translator.
            </li>
            <li>
              For questions ahead of the event, email{" "}
              <a
                href="mailto:kaiano.levine@gmail.com"
                className="text-primary hover:underline"
              >
                kaiano.levine@gmail.com
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section section={SECTIONS[2]!}>
          <p>
            Before the event, upload the audio file for your routine. The
            file should contain <strong className="text-foreground">only</strong>{" "}
            your routine — no introduction music, no bow music, no buffer
            at the front. The deejay starts playback at{" "}
            <code className="px-1 rounded bg-muted/30 text-foreground">0:00</code>{" "}
            unless you note a specific cue when you check in. If your
            existing file has bow music attached, please re-submit a clean
            version.
          </p>
          <p>
            Submit one file per routine, per partnership. If you compete
            with two different partners or in two divisions, that's two
            separate files. Re-uploading replaces the previous version and
            bumps the version tag — the deejay always plays the latest one.
          </p>
          <ActionLink to="/songs/add">Submit a song →</ActionLink>
        </Section>

        <Section section={SECTIONS[3]!}>
          <p>
            After you've submitted, confirm the deejay actually has your
            file by checking{" "}
            <Link to="/songs" className="text-primary hover:underline">My Songs</Link>{" "}
            — it lists everything you've uploaded under your account. If
            your routine doesn't appear there, the deejay does not have it
            and you should re-upload before the floor trial starts.
          </p>
          <p>
            If a song was submitted under a previous account, by a former
            partner, or before this site existed, you can also claim it
            from the historical catalog: open{" "}
            <Link to="/songs/add" className="text-primary hover:underline">Add a song</Link>{" "}
            and use the <em>Claim from history</em> option to search past
            submissions and attach one to your account.
          </p>
        </Section>

        <Section section={SECTIONS[4]!}>
          <p>
            Check-in is the moment that puts you in the queue. Each session
            page on{" "}
            <Link to="/floor-trials" className="text-primary hover:underline">Active Floor Trials</Link>{" "}
            has its own check-in form.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Window:</strong> the form
              opens <strong className="text-foreground">30 minutes before</strong>{" "}
              the listed start of the floor trial block, and stays open for
              the duration. Submissions outside that window are rejected
              automatically — there's no penalty for trying early, the form
              will just tell you to come back.
            </li>
            <li>
              <strong className="text-foreground">Special instructions:</strong>{" "}
              if you want the deejay to start at a specific cue, run with no
              music, play the song without running, or anything else
              non-default — write it in the notes field on the check-in
              form. That's faster and more reliable than verbal instructions
              at the booth.
            </li>
            <li>
              <strong className="text-foreground">What you need:</strong>{" "}
              a song on file plus a partner registered against that song.
              If your partner has a DeejayTools account, link them from{" "}
              <Link to="/partners" className="text-primary hover:underline">My Partners</Link>{" "}
              so they can see the same queue you do.
            </li>
            <li>
              <strong className="text-foreground">Issues:</strong> if
              something goes wrong on check-in (the file isn't where you
              expected, the queue won't accept your entry, you ran into a
              technical problem) — come to the booth. International
              competitors especially: please ask if anything's unclear.
            </li>
          </ul>
        </Section>

        <Section section={SECTIONS[5]!}>
          <p>
            Once you've checked in, the session page splits into three
            queues. All three are visible at the same time and they all
            update automatically — leave the page open and watch.
          </p>
          <p>
            <strong className="text-foreground">Active queue.</strong> The
            next handful of couples actually about to take the floor —
            usually four to six slots. The couple at the top is up next;
            the deejay is already cueing their music.
          </p>
          <p>
            <strong className="text-foreground">Priority queue.</strong>{" "}
            Routines that run on the same day get priority over other
            divisions. Your first three runs of that day count as priority;
            from the fourth run onward you drop to the standard queue. Some
            divisions are designated priority by the event (Classic,
            Showcase, etc.) — see the session page for the list. Once
            you've used up your priority runs, additional check-ins join
            the standard queue automatically.
          </p>
          <p>
            <strong className="text-foreground">Standard queue.</strong>{" "}
            Everyone else: priority divisions past their cap, and any
            non-priority divisions running today. Couples in this queue are
            served between priority slots whenever there's room.
          </p>
          <p>Three things to keep in mind about the queue display:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              The queue order does <strong className="text-foreground">not</strong>{" "}
              correlate to the actual performance order on competition day.
              The performance order is set separately and posted in the{" "}
              <strong className="text-foreground">SwingDancer app</strong>,
              not at the deejay booth.
            </li>
            <li>
              Times shown on session pages are estimates only. Floor trials
              don't run on a strict clock — they run at the pace of the
              floor.
            </li>
            <li>
              The display is software-managed but not strictly real-time.
              If something looks off, give it a moment and it'll catch up.
              If it still looks wrong, come to the booth.
            </li>
          </ul>
          <p>
            If a check-in needs your attention (the deejay flags it), the
            session page will surface that. Come to the booth before your
            turn comes up.
          </p>
        </Section>

        <Section section={SECTIONS[6]!}>
          <p>
            When you're a slot or two from the top of the active queue,
            walk over near the deejay booth and start planning how you'll
            spend your time on the floor.
          </p>
          <p>
            By default the expectation is: walk through your entrance and
            set, the deejay starts your music, you run your routine, do
            your bow, and walk off. That's a complete floor trial. If you
            want anything different from that — play the song without
            running, run with no music, start from a specific cue, etc. —
            this is the time to tell the deejay verbally, in addition to
            having noted it on the check-in form.
          </p>
          <p>
            If you're starting behind a curtain or somewhere the deejay
            might not see you, a quick verbal check-in is fine but not
            required. Same for reminding the deejay you sent a cue — fine
            but not required.
          </p>
          <p>
            One thing to be aware of: a lot is happening at the booth
            during a floor trial. You're not guaranteed the deejay's full
            attention during your start or run, especially if there's a
            technical issue elsewhere. Be patient.
          </p>
        </Section>

        <Section section={SECTIONS[7]!}>
          <p>
            Your time slot is roughly{" "}
            <strong className="text-foreground">5 minutes for couples</strong>{" "}
            and <strong className="text-foreground">10 minutes for teams</strong>.
            That's a guideline, not a hard limit — the deejay won't fade
            you out unless something's clearly gone wrong.
          </p>
          <p>
            If something does go wrong and you don't want to complete the
            run:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Less than halfway through:</strong>{" "}
              you can ask for an immediate restart.
            </li>
            <li>
              <strong className="text-foreground">More than halfway through, or you'd rather skip the restart:</strong>{" "}
              you'll automatically be moved to the end of the upcoming
              queue. Stop by the deejay booth to confirm whether you want
              to actually go again or be removed.
            </li>
          </ul>
          <p>If your partner isn't ready when your turn comes up:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Some members missing:</strong>{" "}
              you're moved to the end of the upcoming queue.
            </li>
            <li>
              <strong className="text-foreground">All members missing:</strong>{" "}
              you're removed from the queue entirely. To get another run,
              check in again.
            </li>
          </ul>
        </Section>

        <Section section={SECTIONS[8]!}>
          <p>
            Want another run? Check in again. There's no cooldown beyond
            "the queue has to actually progress." Your second check-in
            joins whichever queue your division qualifies for at that
            moment — remember, runs 1–3 are priority and the 4th+ is
            standard.
          </p>
          <p>
            A note on order of operations: don't submit the check-in form
            again until your previous run is complete. Submissions sent in
            while you're already on the queue (or actively running) are
            rejected automatically.
          </p>
          <ActionLink to="/floor-trials">Back to Active Floor Trials →</ActionLink>
        </Section>

        <Section section={SECTIONS[9]!}>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Sharing the floor:</strong>{" "}
              it's common for other competitors to be on the floor while
              someone else has "their turn." If it isn't your turn, stay
              to the side and out of the active couple's path.
            </li>
            <li>
              <strong className="text-foreground">Breaks:</strong> the
              deejay team may take a 5-minute break once per hour, aligned
              to the top of the hour when possible.
            </li>
            <li>
              <strong className="text-foreground">Music start:</strong>{" "}
              your file plays from the very beginning unless you noted a
              cue on the check-in form.
            </li>
            <li>
              <strong className="text-foreground">No bow music:</strong>{" "}
              the file should not contain your bow playback music. If it
              does, please re-submit a clean version.
            </li>
            <li>
              <strong className="text-foreground">Performance order:</strong>{" "}
              the actual competition performance order is published in the{" "}
              SwingDancer app, not on this site or at the deejay booth.
            </li>
            <li>
              <strong className="text-foreground">Patience:</strong> a lot
              of things happen during a floor trial block. The check-in
              order is the order people checked in — it's not a guarantee
              of when you'll run. Routines from same-day divisions get
              priority.
            </li>
          </ul>
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
