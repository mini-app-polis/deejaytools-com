import { Link } from "react-router-dom";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1">
        {children}
      </div>
    </section>
  );
}

export default function ManagerGuideSection() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <p className="text-foreground font-medium">Floor trial operations guide</p>
        <p className="text-muted-foreground mt-1">
          For the person running the booth. These tools require admin access — there is no separate
          manager login today; grant admin on the{" "}
          <Link to="/admin/users">Users</Link> screen if someone else needs in.
        </p>
      </div>

      <Section title="Before the event">
        <div>
          <p className="font-medium text-foreground">Create an event</p>
          <p className="mt-1">
            Admin → <Link to="/admin/events">Events</Link> → New event. Set name, start date, end
            date, and timezone.
          </p>
          <p className="mt-2">
            <strong>Timezone matters.</strong> Every time shown in the product — session start,
            check-in window, queue timestamps — is displayed in the <strong>event&apos;s</strong>{" "}
            timezone, not the viewer&apos;s browser timezone. Pick the venue&apos;s zone before
            creating sessions.
          </p>
        </div>

        <div>
          <p className="font-medium text-foreground">Create a session</p>
          <p className="mt-1">
            Admin → <Link to="/admin/sessions">Sessions</Link> → New session. Fields in the dialog:
          </p>
          <ul className="mt-2">
            <li>
              <strong>Event</strong> — which event this trial belongs to.
            </li>
            <li>
              <strong>Date</strong> — calendar date of the floor trial.
            </li>
            <li>
              <strong>Start time</strong> — interpreted in the event&apos;s timezone (label shows
              the zone abbreviation).
            </li>
            <li>
              <strong>Check-in opens</strong> — how long before start check-in unlocks. Options from
              same as start through 2 hours before; default is 30 minutes.
            </li>
            <li>
              <strong>Floor trial duration</strong> — 1 to 5 hours in half-hour steps; default 2
              hours. Check-in stays open until the trial ends.
            </li>
            <li>
              <strong>Active cap (priority)</strong> — default 6. Max dancers on deck when filling
              from the Priority queue.
            </li>
            <li>
              <strong>Active cap (non-priority)</strong> — default 4. Max dancers on deck when
              filling from Standard. Must be ≤ priority cap.
            </li>
            <li>
              <strong>Priority run limit</strong> — default 1. How many completed runs in a priority
              division still qualify for Priority queue admission this session.
            </li>
            <li>
              <strong>Divisions</strong> — checkbox grid for every division name.
            </li>
          </ul>
        </div>

        <div>
          <p className="font-medium text-foreground">Two settings people get wrong</p>
          <p className="mt-2">
            <strong>Divisions.</strong> All divisions are always included in every session.
            Checking a box does <em>not</em> add that division — it marks it as a{" "}
            <strong>priority division</strong>. Unchecked divisions are Standard-only.
          </p>
          <p className="mt-2 text-xs italic">
            All divisions are always included. Check the ones that grant priority status.
          </p>
          <p className="mt-3">
            <strong>Active caps.</strong> Non-priority cap must be ≤ priority cap. Caps limit how
            many dancers can be on deck at once:
          </p>
          <ul className="mt-2">
            <li>
              Priority entries promote while total Active count is below the priority cap.
            </li>
            <li>
              Standard entries promote only when the Priority waiting queue is{" "}
              <strong>empty</strong>, and only while Active count is below the non-priority cap.
            </li>
          </ul>
          <p className="mt-2">
            Example: caps 6 / 4 means up to six on deck while Priority has waiters; once Priority
            clears, Standard can fill up to four on deck.
          </p>
        </div>

        <div>
          <p className="font-medium text-foreground">Deleting a session</p>
          <p className="mt-1">
            The delete confirmation warns:{" "}
            <em>
              This will cascade-delete every check-in, queue entry, run, and division row attached
              to it. This cannot be undone.
            </em>
          </p>
          <p className="mt-2">Use only to remove a session created in error — not mid-trial.</p>
        </div>
      </Section>

      <Section title="Running the trial — Active Sessions">
        <p>
          Open <Link to="/manager/active-sessions">Active Sessions</Link> when the floor trial is
          underway.
        </p>

        <div>
          <p className="font-medium text-foreground">Session picker</p>
          <p className="mt-1">
            Lists only sessions whose floor trial <strong>starts today</strong> (today&apos;s
            calendar date in your browser). If nothing appears, either no session is scheduled for
            today or you need to create one under Admin → Sessions.
          </p>
        </div>

        <div>
          <p className="font-medium text-foreground">Refresh</p>
          <p className="mt-1">
            The page polls every 8 seconds. The status line shows{" "}
            <strong>Updated 12s ago</strong>, <strong>Refreshing…</strong>, or the amber{" "}
            <strong>Couldn&apos;t refresh — tap to retry</strong>. Tap it to force a refresh.
          </p>
        </div>

        <div>
          <p className="font-medium text-foreground">Three cards</p>
          <ul className="mt-2">
            <li>
              <strong>Active</strong> — dancers on deck right now. #1 has a ▶ marker (up next).
              Slot count in the header. Fills automatically — you never promote by hand.
            </li>
            <li>
              <strong>Priority</strong> — waiting for a priority slot. Count = how many are queued.
            </li>
            <li>
              <strong>Standard</strong> — waiting for a standard slot. Promotes only when Priority
              waiting is empty.
            </li>
          </ul>
        </div>

        <div>
          <p className="font-medium text-foreground">Actions — get these right</p>
          <p className="mt-1">Available on Active entries (and Move down / Withdraw on waiting queues):</p>
          <ul className="mt-2">
            <li>
              <strong>Run complete</strong> — Removes the entry from Active, compacts positions,
              <strong> records a run</strong>, and auto-refills Active from waiting queues.
              Recording the run consumes the dancer&apos;s priority allowance for that division.
              This is the <strong>only</strong> action that counts as a run.
            </li>
            <li>
              <strong>Run incomplete</strong> — Rotates the entry to the <strong>bottom of Active</strong>.
              No run recorded. No priority consumed. Auto-refills if a slot opened.
            </li>
            <li>
              <strong>Move down</strong> — Swaps with the next position <strong>within the same
              queue only</strong> (Active, Priority, or Standard). Hidden on the last row. Errors if
              already at the bottom.
            </li>
            <li>
              <strong>Withdraw</strong> — Removes the entry from whichever queue it is in. Does{" "}
              <strong>not</strong> record a run.
            </li>
          </ul>
        </div>

        <div>
          <p className="font-medium text-foreground">Which button?</p>
          <ol className="mt-2">
            <li>
              <strong>They danced the routine.</strong> Run complete.
            </li>
            <li>
              <strong>False start / need to go again later this session.</strong> Run incomplete
              (sends them to the back of Active).
            </li>
            <li>
              <strong>Not here yet but still coming.</strong> Move down within Active, or leave them
              in place.
            </li>
            <li>
              <strong>Left for the day / don&apos;t want the slot.</strong> Withdraw.
            </li>
          </ol>
        </div>
      </Section>

      <Section title="Helping a dancer">
        <ul>
          <li>
            <Link to="/manager/upload-for">Upload For</Link> — Search a user, upload on their
            behalf. The song is created exactly as if they uploaded it themselves.
          </li>
          <li>
            <Link to="/manager/checkin-for">CheckIn For</Link> — Search a user, pick
            session/song/division. Recorded exactly as if they checked in themselves. The song list
            comes from that user&apos;s event submissions — if it is empty, they have not submitted
            songs to that event yet. Use Event Songs or send them to My Content → event submissions.
          </li>
          <li>
            <Link to="/manager/event-songs">Event Songs</Link> — Every submission for an event,
            grouped by division. Use to verify who submitted what before check-in.
          </li>
        </ul>
      </Section>

      <Section title="Admin screens">
        <ul>
          <li>
            <Link to="/admin/runs">Run History</Link> — Every completed run: partnership, division,
            song, session, timestamp. <strong>by &lt;name&gt;</strong> is whoever pressed Run
            complete, not necessarily the dancer.
          </li>
          <li>
            <Link to="/admin/songs">Songs</Link> — Search plus year/division filters.{" "}
            <strong>Legacy</strong> badge = imported from the old catalog, no audio file (cannot
            check in with it). <strong>deleted</strong> badge = soft-deleted; toggle Show deleted to
            find it.
          </li>
          <li>
            <Link to="/admin/users">Users</Link> — Grant or revoke admin. You cannot change your own
            role (your row shows “you”).
          </li>
          <li>
            <Link to="/admin/test-checkin">Test Checkin</Link> —{" "}
            <span className="text-amber-600 dark:text-amber-400">
              Creates throwaway user/partner/pair rows and uses a placeholder song. Skips the
              check-in time window. Each submission adds one entry to the selected session&apos;s
              queue.
            </span>{" "}
            Do <strong>not</strong> use on a live production session during a real event. Use{" "}
            <strong>Delete all</strong> to clean up test rows when finished experimenting.
          </li>
        </ul>
      </Section>

      <Section title="Known limitations">
        <ul>
          <li>
            <strong>Managed partnerships</strong> cannot be checked in yet. Use a regular
            partnership or solo entry for now.
          </li>
          <li>
            <strong>Event-level priority run limit</strong> (<code>event_division_run_limits</code>)
            is enforced by the server but has no UI to set or view. If a dancer is unexpectedly in
            Standard and the session-level priority run limit is not the cause, an event-level cap
            set directly in the database may be why.
          </li>
          <li>
            <strong>No rollback for Run complete.</strong> Withdrawing afterwards does not remove
            the recorded run or restore priority allowance.
          </li>
        </ul>
        <p className="mt-2">
          Dancer-facing explanations:{" "}
          <Link to="/how-it-works/troubleshooting">Help → Troubleshooting</Link>.
        </p>
      </Section>
    </div>
  );
}
