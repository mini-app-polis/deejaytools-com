import { Link } from "react-router-dom";
import HelpLayout from "@/components/help/HelpLayout";
import { HelpSection, HelpSubheading } from "@/components/help/HelpSection";

const SECTION = {
  id: "the-queue",
  eyebrow: "04",
  title: "Watching the queue",
};

export default function HelpTheQueuePage() {
  return (
    <HelpLayout topicId="the-queue">
      <HelpSection section={SECTION}>
        <p>
          Once you&apos;ve checked in, the session page shows three queues. All three are visible at
          the same time. Leave the page open — it refreshes about <strong className="text-foreground">once
          a minute</strong>; it is useful but not strictly real-time.
        </p>

        <HelpSubheading>The three queues</HelpSubheading>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-foreground">Active</strong> — couples on deck. Slot{" "}
            <strong className="text-foreground">#1</strong> with a ▶ mark is next; the deejay is cueing
            their music. Active fills <strong className="text-foreground">automatically</strong> from
            the waiting queues — nobody hand-picks you from the crowd.
          </li>
          <li>
            <strong className="text-foreground">Priority</strong> — waiting list for check-ins that
            qualified for priority (see below).
          </li>
          <li>
            <strong className="text-foreground">Standard</strong> — everyone else: non-priority
            divisions, or priority divisions after you have used your priority run allowance.
          </li>
        </ul>

        <HelpSubheading>How priority is decided (all three must be true)</HelpSubheading>
        <p>You land in Priority only when:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            Your division is flagged <strong className="text-foreground">priority for this session</strong>{" "}
            (see the session page for which divisions qualify).
          </li>
          <li>
            You are under this session&apos;s <strong className="text-foreground">priority run limit</strong>{" "}
            for that division — only your first N completed runs in that division this session count as
            priority.
          </li>
          <li>
            If the event sets an event-wide cap, you are also under the{" "}
            <strong className="text-foreground">event limit</strong> for that division across the whole
            weekend.
          </li>
        </ol>
        <p>
          If any condition fails, you go to Standard automatically. You cannot request priority or change
          queues yourself. Once you have used up your priority runs, additional check-ins join Standard
          even in a priority division.
        </p>

        <HelpSubheading>What counts as a run</HelpSubheading>
        <p>
          A <strong className="text-foreground">run</strong> is recorded only when the deejay marks your
          routine <strong className="text-foreground">Run complete</strong> after you finish on the
          floor. <strong className="text-foreground">Run incomplete</strong> sends you to the bottom of
          Active for another try <em>without</em> using up a priority run toward your limit.
        </p>

        <HelpSubheading>Active caps and why Standard can stall</HelpSubheading>
        <p>
          Each session has two caps that both limit the{" "}
          <strong className="text-foreground">total number of couples on deck</strong> at once — not
          separate buckets for priority- and standard-originated entries. Defaults are often 6 and 4,
          but admins can change them per session.
        </p>
        <p>
          While anyone is still waiting in Priority, the floor fills up to the{" "}
          <strong className="text-foreground">higher cap</strong> (6). Once Priority is completely
          empty, Standard entries promote only while the total on deck is below the{" "}
          <strong className="text-foreground">lower cap</strong> (4). Priority always promotes first
          when it has waiters and there is room under the higher cap.
        </p>
        <p>
          Net effect: the session runs a fuller deck when priority dancers are queued, and a leaner
          one when only standard dancers are left.
        </p>
        <p>
          <strong className="text-foreground">Worked example (caps 6 / 4):</strong> five couples are
          on deck, Priority just drained to empty, and three couples wait in Standard. You might expect
          up to four standard slots to open — but the lower cap applies to{" "}
          <em>everyone</em> already on deck, not just standard dancers. Because 5 is not below 4,{" "}
          <strong className="text-foreground">nobody</strong> moves from Standard until Active drops
          to three. Two couples have to finish (or leave Active) before the first standard waiter
          promotes. That is the &ldquo;why is Standard stalled?&rdquo; case.
        </p>

        <HelpSubheading>Reading the position numbers</HelpSubheading>
        <p>
          The <strong className="text-foreground">#</strong> on each row is your{" "}
          <strong className="text-foreground">overall line position</strong>, not &ldquo;3rd in
          Priority.&rdquo; Active rows are #1, #2, …; Priority continues numbering after Active (e.g. if
          2 are Active, Priority #1 shows as <strong className="text-foreground">#3</strong>); Standard
          continues after Priority. When you are checked in, the session page also shows your status as{" "}
          <strong className="text-foreground">#N in queue</strong> near the Check in button.
        </p>

        <HelpSubheading>Timing and performance order</HelpSubheading>
        <p>Three things to keep in mind about the queue display:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            The queue order does <strong className="text-foreground">not</strong> correlate to the
            actual performance order on competition day. The performance order is set separately and
            posted in the <strong className="text-foreground">SwingDancer app</strong>, not at the
            deejay booth.
          </li>
          <li>
            Times shown on session pages are estimates only. Floor trials don&apos;t run on a strict
            clock — they run at the pace of the floor.
          </li>
          <li>
            If something looks off, give it a moment and it&apos;ll catch up. If it still looks wrong,
            come to the booth.
          </li>
        </ul>
        <p>
          If you left a note on the check-in form (optional{" "}
          <strong className="text-foreground">Notes</strong> field — placeholder &ldquo;Any special
          instructions for the deejay&rdquo;), the deejay sees it in the queue as &ldquo;Note:
          …&rdquo;. Come to the booth before your turn comes up.
        </p>
        <p>
          For check-in prerequisites, see{" "}
          <Link to="/how-it-works/checking-in" className="text-primary hover:underline">
            Checking in
          </Link>
          .
        </p>
      </HelpSection>
    </HelpLayout>
  );
}
