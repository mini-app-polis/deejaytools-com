import { Link } from "react-router-dom";
import HelpLayout from "@/components/help/HelpLayout";
import { HelpSection, HelpSubheading } from "@/components/help/HelpSection";

const PARTNER = {
  id: "partners-roster",
  eyebrow: "05a",
  title: "Partner",
};

const TEAM = {
  id: "teams",
  eyebrow: "05b",
  title: "Team",
};

const MANAGED = {
  id: "managed-partnerships",
  eyebrow: "05c",
  title: "Managed partnership",
};

const SOLO = {
  id: "solo",
  eyebrow: "05d",
  title: "Solo",
};

export default function HelpPartnersPage() {
  return (
    <HelpLayout topicId="partners">
      <div className="space-y-12">
        <p className="text-sm text-foreground/75 leading-relaxed">
          DeejayTools uses four different ways to describe who is dancing. They all live on{" "}
          <Link to="/my-profile" className="text-primary hover:underline">My Profile</Link> except
          solo, which is simply a song with no partner linked.
        </p>

        <HelpSection section={PARTNER}>
          <p>
            A <strong className="text-foreground">partner</strong> is a person on your roster — first
            name, last name, their role as <strong className="text-foreground">leader</strong> or{" "}
            <strong className="text-foreground">follower</strong>, and an optional email. When you upload
            a song, you link it to one partner. On My Profile, the add-partner form says{" "}
            <strong className="text-foreground">Your role will be the opposite</strong> of the role you
            set for them: if they are a follower, you are treated as the leader for that song, and vice
            versa.
          </p>
          <p>
            Partners do not need their own DeejayTools account for you to upload on their behalf.
            Each dancer checks in with their own uploaded song — if both partners need to check in,
            each must upload their own copy.
          </p>
          <HelpSubheading>Removing a partner</HelpSubheading>
          <p>On My Profile, deleting a partner may show:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              &ldquo;This partner has an active check-in and cannot be deleted. Complete or withdraw the
              check-in first.&rdquo;
            </li>
            <li>
              &ldquo;This partner has check-in history. Their historical data will be preserved after
              deletion.&rdquo;
            </li>
            <li>
              &ldquo;This partner is linked to N song(s). Deleting will remove the partner from those
              songs.&rdquo;
            </li>
          </ul>
        </HelpSection>

        <HelpSection section={TEAM}>
          <p>
            A <strong className="text-foreground">team</strong> is a named group you create on My
            Profile. Teams are used when you upload through{" "}
            <Link to="/songs/add" className="text-primary hover:underline">Add a song → Teams, Cabaret, Other</Link>{" "}
            for the <strong className="text-foreground">Teams</strong> division only. Cabaret and Other
            use a free-text group name instead of a team picker.
          </p>
        </HelpSection>

        <HelpSection section={MANAGED}>
          <p>
            A <strong className="text-foreground">managed partnership</strong> is a leader and follower
            pair you upload on behalf of, where <strong className="text-foreground">you are neither
            dancer</strong>. Only you can see and manage these entries on My Profile. Use{" "}
            <strong className="text-foreground">Upload for a managed partnership</strong> on Add a song.
          </p>
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
            <strong className="text-foreground">Check-in:</strong> you can check in managed-partnership
            songs through the normal floor-trial form. The check-in is recorded against the managed
            partnership (leader &amp; follower names on the confirmation card and in the queue), not as
            a solo routine. Withdraw from My Content if you need to leave the queue.
          </p>
        </HelpSection>

        <HelpSection section={SOLO}>
          <p>
            <strong className="text-foreground">Solo</strong> means a song with no partner linked —
            you are dancing alone. On the check-in confirmation card, Partner shows as italic{" "}
            <strong className="text-foreground">Solo</strong>.
          </p>
        </HelpSection>

        <HelpSubheading>Pairs (support conversations only)</HelpSubheading>
        <p>
          The word <strong className="text-foreground">pair</strong> never appears in the app UI, but
          support docs and the deejay may use it. A pair is created automatically the first time you
          check in with a given partner — it ties your two accounts together for queue purposes. You
          do not create or edit pairs yourself.
        </p>
      </div>
    </HelpLayout>
  );
}
