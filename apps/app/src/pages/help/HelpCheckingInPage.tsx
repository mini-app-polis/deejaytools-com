import { Link } from "react-router-dom";
import HelpLayout from "@/components/help/HelpLayout";
import { HelpSection, HelpSubheading } from "@/components/help/HelpSection";

const SECTION = {
  id: "checking-in",
  eyebrow: "04",
  title: "Checking in",
};

export default function HelpCheckingInPage() {
  return (
    <HelpLayout topicId="checking-in">
      <HelpSection section={SECTION}>
        <HelpSubheading>When check-in opens and closes</HelpSubheading>
        <p>
          Check-in opens at the <strong className="text-foreground">check-in time</strong> shown on each
          session card and stays open until the floor trial <strong className="text-foreground">ends</strong>{" "}
          — not until dancing starts. You can check in during the whole block, including while couples
          are already running. Submissions before open or after the end are rejected; trying early just
          tells you to come back.
        </p>

        <HelpSubheading>Prerequisites (in order)</HelpSubheading>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong className="text-foreground">Signed in</strong> — the check-in button only appears
            when you have a DeejayTools account session.
          </li>
          <li>
            <strong className="text-foreground">Name set</strong> on My Profile (same rule as upload).
          </li>
          <li>
            <strong className="text-foreground">Partner added</strong> for couple routines (solo songs
            skip this).
          </li>
          <li>
            <strong className="text-foreground">Song uploaded</strong> with a playable file on My Content.
          </li>
          <li>
            <strong className="text-foreground">Song submitted to the event</strong> — see{" "}
            <Link to="/how-it-works/submitting-music#event-submission-required" className="text-primary hover:underline">
              uploading vs event submission
            </Link>
            .
          </li>
          <li>
            <strong className="text-foreground">Check-in window open</strong> for that session.
          </li>
        </ol>

        <HelpSubheading>The check-in form</HelpSubheading>
        <p>
          Check-in is the action that puts you in the queue. Each session page on{" "}
          <Link to="/floor-trials" className="text-primary hover:underline">
            Floor Trials
          </Link>{" "}
          has its own check-in form — tap <strong className="text-foreground">Check in</strong> at the
          top or bottom of the session page.
        </p>
        <p>The form is <strong className="text-foreground">song-first</strong>:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Pick a <strong className="text-foreground">song</strong> from songs you submitted to this
            event. If none appear: &ldquo;You haven&apos;t added any songs to this event yet.&rdquo;
          </li>
          <li>
            A confirmation card shows <strong className="text-foreground">You</strong>,{" "}
            <strong className="text-foreground">Partner</strong> (or italic{" "}
            <strong className="text-foreground">Solo</strong>), and <strong className="text-foreground">Song</strong>.
          </li>
          <li>
            <strong className="text-foreground">Division</strong> auto-fills from the song when that
            division is offered in this session. If the song&apos;s division isn&apos;t on the session,
            the field clears and you must pick the closest match — you will see: &ldquo;Your song&apos;s
            division (…) isn&apos;t offered in this session. Please pick the closest match above.&rdquo;
          </li>
          <li>
            <strong className="text-foreground">Notes (optional)</strong> — anything non-default for
            the deejay (start at a cue, run with no music, etc.). Placeholder: &ldquo;Any special
            instructions for the deejay&rdquo;.
          </li>
        </ul>

        <HelpSubheading>Priority vs standard — you don&apos;t choose</HelpSubheading>
        <p>
          The system assigns priority or standard from your division, how many priority runs you have
          already used in this session, and any event-wide limits. You cannot pick a queue. See{" "}
          <Link to="/how-it-works/the-queue" className="text-primary hover:underline">
            Watching the queue
          </Link>{" "}
          for how that works.
        </p>

        <HelpSubheading>One queue spot per partnership (with an exception)</HelpSubheading>
        <p>
          For a given couple (the same partnership), you can only have{" "}
          <strong className="text-foreground">one live queue entry</strong> in a session at a time. If
          you try again, the form warns: &ldquo;This partnership is already in the queue. Pick a
          different song or withdraw your current entry first.&rdquo; After submit, you may also see:{" "}
          &ldquo;You&apos;re already in the queue for this session.&rdquo;
        </p>
        <p>
          You <em>can</em> be in the queue more than once in the same session if the entries are
          different partnerships — for example a solo routine and a couple routine, or two different
          partners — because each counts as a separate entity.
        </p>

        <HelpSubheading>Withdrawing</HelpSubheading>
        <p>
          To leave the queue, go to{" "}
          <Link to="/my-content#checkins" className="text-primary hover:underline">
            My Content → Check-ins
          </Link>{" "}
          (that section appears once you&apos;re checked in somewhere) and use{" "}
          <strong className="text-foreground">Withdraw from queue</strong>. There is{" "}
          <strong className="text-foreground">no withdraw button on the session page</strong> — people
          look there first, but withdrawal only lives on My Content.
        </p>

        <HelpSubheading>When something goes wrong</HelpSubheading>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-foreground">Issues at the booth:</strong> if the file isn&apos;t
            where you expected, the queue won&apos;t accept your entry, or you hit a technical problem
            — come to the booth. International competitors especially: please ask if anything&apos;s
            unclear.
          </li>
          <li>
            <strong className="text-foreground">Linking partners on upload:</strong> if your partner
            also has a DeejayTools account, linking them to the song during upload means either of you
            can check in with it.
          </li>
        </ul>
      </HelpSection>
    </HelpLayout>
  );
}
