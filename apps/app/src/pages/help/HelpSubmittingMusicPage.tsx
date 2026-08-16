import { Link } from "react-router-dom";
import HelpLayout from "@/components/help/HelpLayout";
import { HelpActionLink, HelpSection, HelpSubheading } from "@/components/help/HelpSection";

const SUBMITTING = {
  id: "submitting-music",
  eyebrow: "02",
  title: "Submitting your music",
};

const CONFIRMING = {
  id: "confirming-music-on-file",
  eyebrow: "03",
  title: "Confirming your music is on file",
};

export default function HelpSubmittingMusicPage() {
  return (
    <HelpLayout topicId="submitting-music">
      <div className="space-y-12">
        <HelpSection section={SUBMITTING}>
          <HelpSubheading>Accepted file types and size</HelpSubheading>
          <p>
            Upload <strong className="text-foreground">MP3, WAV, FLAC, or M4A</strong> — maximum{" "}
            <strong className="text-foreground">100 MB</strong>. The upload form shows this under the
            file picker: &ldquo;MP3, WAV, FLAC, or M4A — max 100 MB&rdquo;.
          </p>
          <p>
            The server checks your file by its <strong className="text-foreground">actual contents</strong>{" "}
            (magic bytes), not the filename or what your browser reports. Renaming a non-audio file to{" "}
            <code className="px-1 rounded bg-muted/30 text-foreground">.mp3</code> will not work — you
            will see: &ldquo;That file doesn&apos;t look like a supported audio format. Please upload an
            MP3, WAV, FLAC, or M4A.&rdquo;
          </p>

          <HelpSubheading>Before you can upload</HelpSubheading>
          <p>Fix these on <Link to="/my-profile" className="text-primary hover:underline">My Profile</Link> or in the upload form before the Upload button will work:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Your name.</strong> If first or last name is missing,
              you will see: &ldquo;Set your first and last name on the My Profile page so we can label
              your uploads correctly.&rdquo;
            </li>
            <li>
              <strong className="text-foreground">A partner (Upload for myself only).</strong> If your
              partner list is empty: &ldquo;You need a partner to upload. Add one on the My Profile
              page.&rdquo;
            </li>
          </ul>

          <HelpSubheading>Three upload modes</HelpSubheading>
          <p>
            On <Link to="/songs/add" className="text-primary hover:underline">Add a song</Link> you pick
            one of three cards at the top:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Upload for myself</strong> — you are one of the
              dancers. Pick a partner from your roster and a standard division.
            </li>
            <li>
              <strong className="text-foreground">Upload for a managed partnership</strong> — you upload
              on behalf of a leader/follower pair you manage, where you are neither dancer.
            </li>
            <li>
              <strong className="text-foreground">Teams, Cabaret, Other</strong> — for Teams, Cabaret,
              Exhibition, and other special divisions. <strong className="text-foreground">Teams</strong>,{" "}
              <strong className="text-foreground">Cabaret</strong>, and{" "}
              <strong className="text-foreground">My Division Is Not Listed</strong> are absent from the
              standard division picker on &ldquo;Upload for myself&rdquo; (they live on this tab only).{" "}
              <strong className="text-foreground">Exhibition</strong> appears on both pickers.
            </li>
          </ul>

          <HelpSubheading>Personal descriptor</HelpSubheading>
          <p>
            Optional, but useful when you upload several versions of the same routine. The form
            placeholder shows examples:{" "}
            <code className="px-1 rounded bg-muted/30 text-foreground">98%, -2%, v3, 2026-02-01</code>.
            Use whatever helps <em>you</em> tell versions apart — tempo tweak, mix date, practice take
            number. It becomes part of the processed filename the deejay sees in Drive (see below).
            Non-alphanumeric characters are stripped from the descriptor in the filename —{" "}
            <code className="px-1 rounded bg-muted/30 text-foreground">98%</code> becomes{" "}
            <code className="px-1 rounded bg-muted/30 text-foreground">98</code>,{" "}
            <code className="px-1 rounded bg-muted/30 text-foreground">-2%</code> becomes{" "}
            <code className="px-1 rounded bg-muted/30 text-foreground">2</code>, and{" "}
            <code className="px-1 rounded bg-muted/30 text-foreground">2026-02-01</code> becomes{" "}
            <code className="px-1 rounded bg-muted/30 text-foreground">20260201</code>.
          </p>

          <p>
            Before the event, upload the audio file for your routine. The file should contain{" "}
            <strong className="text-foreground">only</strong> your routine — no introduction music, no
            bow music, no buffer at the front. The deejay starts playback at{" "}
            <code className="px-1 rounded bg-muted/30 text-foreground">0:00</code>. If your existing file
            has bow music attached, please re-submit a clean version.
          </p>
          <HelpActionLink to="/songs/add">Submit a song →</HelpActionLink>

          <HelpSubheading>What happens after you upload</HelpSubheading>
          <p>
            After all chunks arrive, the server processes your file in the background (you get a success
            message before Drive finishes). It:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Renames the file</strong> to a standard pattern:
              leader and follower names (PascalCase segments joined with underscores), then division,
              season year, routine name, descriptor, and version — for example{" "}
              <code className="px-1 rounded bg-muted/30 text-foreground break-all">
                KaianoLevine_LibbyWooton_Classic_2026_MyRoutine_98_v01.mp3
              </code>
              . Solo uploads use your name only. The{" "}
              <strong className="text-foreground">leader&apos;s name always comes first</strong>, even if
              the follower uploaded the file — the server decides from each partner&apos;s role.
            </li>
            <li>
              <strong className="text-foreground">Tags the audio</strong> — title becomes{" "}
              &ldquo;Leader &amp; Follower&rdquo; (or just the leader for solo), artist becomes{" "}
              &ldquo;Division - Year - Routine name&rdquo;.
            </li>
            <li>
              <strong className="text-foreground">Uploads to Google Drive</strong> under the event
              season folder, and shares read access with your account email and your partner&apos;s email
              (if you entered one on their partner record).
            </li>
          </ul>
          <p>
            On <Link to="/my-content#songs" className="text-primary hover:underline">My Content → Songs</Link>{" "}
            you see the <strong className="text-foreground">processed filename</strong> (what the deejay
            works from) and, below it,{" "}
            <strong className="text-foreground">Uploaded: &lt;your original filename&gt;</strong> so you
            can match the row to the file you picked on your phone or laptop. The{" "}
            <strong className="text-foreground">Open in Google Drive</strong> button lets you preview
            playback in your own Drive — useful to confirm levels and that the right cut uploaded.
          </p>

          <HelpSubheading>Upload progress and retries</HelpSubheading>
          <p>While uploading, the bar moves through three stages:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Uploading…</strong> — sending 5 MB chunks, with MB
              sent vs total shown.
            </li>
            <li>
              <strong className="text-foreground">Processing your file… this may take a moment</strong> —
              the last chunk is on the server being assembled and validated.
            </li>
            <li>
              <strong className="text-foreground">Saving…</strong> — finishing up before success.
            </li>
          </ul>
          <p>
            Each chunk is tried up to <strong className="text-foreground">3 times</strong> automatically
            (with a short wait between attempts) if the network hiccups. If your Clerk session expires
            mid-upload, you will see exactly: &ldquo;Your session expired. Please sign in again and retry
            the upload.&rdquo; Sign in and start the upload again from the beginning.
          </p>
        </HelpSection>

        <HelpSection section={CONFIRMING}>
          <p>
            After you&apos;ve submitted, confirm the deejay actually has your file by checking{" "}
            <Link to="/my-content#songs" className="text-primary hover:underline">
              My Content → Songs
            </Link>{" "}
            — it lists every song you&apos;ve uploaded through this site under your account. If your
            routine doesn&apos;t appear there with a playable file, the deejay does not have it and you
            should re-upload before the floor trial starts.
          </p>
          <p>
            Some older routines may appear in My Content as imported legacy catalog rows. They show a
            disabled <strong className="text-foreground">Legacy Song</strong> button with the tooltip
            &ldquo;This song was imported from the legacy catalog and has no uploaded audio file.&rdquo;
            These entries have no audio and cannot be used to check in.
          </p>
          <p>
            If a routine you submitted in a previous season isn&apos;t in My Content with a playable file,
            upload it again at{" "}
            <Link to="/songs/add" className="text-primary hover:underline">
              Add a song
            </Link>
            .
          </p>

          <HelpSubheading id="event-submission-required">
            Uploading is not the same as submitting to the event
          </HelpSubheading>
          <p>
            This is the step most people miss:{" "}
            <strong className="text-foreground">
              uploading a song does not enter it into the competition event
            </strong>
            . Before you can check in with a song at a floor trial, you must also add it to that event on{" "}
            <Link to="/event-submissions" className="text-primary hover:underline">
              Event submissions
            </Link>{" "}
            (or via the Events section on My Content).
          </p>
          <p>
            If you skip this, check-in fails with: &ldquo;This song hasn&apos;t been submitted to this
            event. Add it to the event on My Content before checking in.&rdquo; That message is the
            single most common support question — if you see it, go submit the song to the event first,
            then return to the session page.
          </p>
        </HelpSection>
      </div>
    </HelpLayout>
  );
}
