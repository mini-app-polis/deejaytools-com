import { useEffect, useState } from "react";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiEvent } from "@/schemas";

const SHARED_WITH_ME_URL = "https://drive.google.com/drive/shared-with-me";

const LINK_CLASS = "inline-block font-medium text-primary hover:underline";

/**
 * Where the event's music is. The API shares the event's Drive folder with
 * each of its DJs and event managers, and GET /v1/events/:id/drive-folder
 * says which folder it is, so the link opens it directly. Until a share has
 * recorded the folder, or when the call is refused or fails, the link falls
 * back to Drive's "Shared with me", where the folder appears.
 */
export default function DriveFolderSection({ event }: { event: ApiEvent }) {
  const api = useApiClient();
  const [folderUrl, setFolderUrl] = useState<string | null>(null);

  useEffect(() => {
    call(api, endpoints.events.driveFolder, { params: { id: event.id } })
      .then((folder) => setFolderUrl(folder.url))
      .catch(() => setFolderUrl(null));
  }, [api, event.id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event music in Google Drive</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {folderUrl ? (
          <>
            <p>
              The event&apos;s Drive folder, <span className="font-medium">{event.name}</span> (season{" "}
              {event.season_year}), is shared with your email address as a reader. Open it in Google Drive,
              signed in with the email you use here.
            </p>
            <a href={folderUrl} target="_blank" rel="noreferrer" className={LINK_CLASS}>
              Open the event&apos;s folder →
            </a>
          </>
        ) : (
          <>
            <p>
              The event&apos;s Drive folder, <span className="font-medium">{event.name}</span> (season{" "}
              {event.season_year}), is shared with your email address as a reader. Open it from{" "}
              <span className="font-medium">Shared with me</span> in Google Drive, signed in with the email you use
              here.
            </p>
            <p className="text-muted-foreground">
              Sharing runs in the background, so a folder can take a few minutes to appear after you are added.
            </p>
            <a href={SHARED_WITH_ME_URL} target="_blank" rel="noreferrer" className={LINK_CLASS}>
              Open Shared with me →
            </a>
          </>
        )}
      </CardContent>
    </Card>
  );
}
