import HelpLayout from "@/components/help/HelpLayout";
import { HelpActionLink, HelpSection } from "@/components/help/HelpSection";

const PREPARING = {
  id: "preparing-to-run",
  eyebrow: "06",
  title: "When you're next in line",
};

const DURING = {
  id: "during-your-run",
  eyebrow: "07",
  title: "When it's your turn",
};

const GOING_AGAIN = {
  id: "going-again",
  eyebrow: "08",
  title: "After your run",
};

const ETIQUETTE = {
  id: "etiquette",
  eyebrow: "09",
  title: "Etiquette and other notes",
};

export default function HelpOnTheFloorPage() {
  return (
    <HelpLayout topicId="on-the-floor">
      <div className="space-y-12">
        <HelpSection section={PREPARING}>
          <p>
            When you're a slot or two from the top of the active queue, walk over near the deejay
            booth and start planning how you'll spend your time on the floor.
          </p>
          <p>
            By default the expectation is: walk through your entrance and set, the deejay starts your
            music, you run your routine, do your bow, and walk off. That's a complete floor trial. If
            you want anything different from that — play the song without running, run with no music,
            start from a specific cue, etc. — this is the time to tell the deejay verbally, in
            addition to having noted it on the check-in form.
          </p>
          <p>
            If you're starting behind a curtain or somewhere the deejay might not see you, a quick
            verbal check-in is fine but not required. Same for reminding the deejay you sent a cue —
            fine but not required.
          </p>
          <p>
            One thing to be aware of: a lot is happening at the booth during a floor trial. You're
            not guaranteed the deejay's full attention during your start or run, especially if
            there's a technical issue elsewhere. Be patient.
          </p>
        </HelpSection>

        <HelpSection section={DURING}>
          <p>
            Your time slot is roughly{" "}
            <strong className="text-foreground">5 minutes for couples</strong> and{" "}
            <strong className="text-foreground">10 minutes for teams</strong>. That's a guideline,
            not a hard limit — the deejay won't fade you out unless something's clearly gone wrong.
          </p>
          <p>If something does go wrong and you don't want to complete the run:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Less than halfway through:</strong> you can ask for
              an immediate restart.
            </li>
            <li>
              <strong className="text-foreground">
                More than halfway through, or you'd rather skip the restart:
              </strong>{" "}
              you'll automatically be moved to the end of the upcoming queue. Stop by the deejay booth
              to confirm whether you want to actually go again or be removed.
            </li>
          </ul>
          <p>If your partner isn't ready when your turn comes up:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Some members missing:</strong> you're moved to the
              end of the upcoming queue.
            </li>
            <li>
              <strong className="text-foreground">All members missing:</strong> you're removed from
              the queue entirely. To get another run, check in again.
            </li>
          </ul>
        </HelpSection>

        <HelpSection section={GOING_AGAIN}>
          <p>
            Want another run? Check in again. There's no cooldown beyond "the queue has to actually
            progress." Your next check-in joins whichever queue your division qualifies for at that
            moment — priority if you're still within the session's priority run limit for your
            division, standard if you've exceeded it.
          </p>
          <p>
            A note on order of operations: don't submit the check-in form again until your previous
            run is complete. Submissions sent in while you're already on the queue (or actively
            running) are rejected automatically.
          </p>
          <HelpActionLink to="/floor-trials">Back to Floor Trials →</HelpActionLink>
        </HelpSection>

        <HelpSection section={ETIQUETTE}>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Sharing the floor:</strong> it's common for other
              competitors to be on the floor while someone else has "their turn." If it isn't your
              turn, stay to the side and out of the active couple's path.
            </li>
            <li>
              <strong className="text-foreground">Breaks:</strong> the deejay team may take a
              5-minute break once per hour, aligned to the top of the hour when possible.
            </li>
            <li>
              <strong className="text-foreground">Music start:</strong> your file plays from the very
              beginning unless you noted a cue on the check-in form.
            </li>
            <li>
              <strong className="text-foreground">No bow music:</strong> the file should not contain
              your bow playback music. If it does, please re-submit a clean version.
            </li>
            <li>
              <strong className="text-foreground">Performance order:</strong> the actual competition
              performance order is published in the SwingDancer app, not on this site or at the deejay
              booth.
            </li>
            <li>
              <strong className="text-foreground">Patience:</strong> a lot of things happen during a
              floor trial block. The check-in order is the order people checked in — it's not a
              guarantee of when you'll run. Routines from same-day divisions get priority.
            </li>
          </ul>
        </HelpSection>
      </div>
    </HelpLayout>
  );
}
