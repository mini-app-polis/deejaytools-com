import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiEvent } from "@/schemas";

const SHARED_WITH_ME_URL = "https://drive.google.com/drive/shared-with-me";

/**
 * Where the event's music is. The API shares the event's Drive folder with
 * each of its DJs and event managers but does not say where the folder is,
 * so this points to Drive's "Shared with me", where it appears.
 */
export default function DriveFolderSection({ event }: { event: ApiEvent }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Event music in Google Drive</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          The event&apos;s Drive folder, <span className="font-medium">{event.name}</span> (season{" "}
          {event.season_year}), is shared with your email address as a reader. Open it from{" "}
          <span className="font-medium">Shared with me</span> in Google Drive, signed in with the email you use
          here.
        </p>
        <p className="text-muted-foreground">
          Sharing runs in the background, so a folder can take a few minutes to appear after you are added.
        </p>
        <a
          href={SHARED_WITH_ME_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-block font-medium text-primary hover:underline"
        >
          Open Shared with me →
        </a>
      </CardContent>
    </Card>
  );
}
