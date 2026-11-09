import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiEvent } from "@/schemas";

const SHARED_WITH_ME_URL = "https://drive.google.com/drive/shared-with-me";

const LINK_CLASS = "inline-block font-medium text-primary hover:underline";

/**
 * Where the event's music is. The API shares the event's Drive folder with
 * each of its DJs and event managers, and GET /v1/events/:id/drive-folder
 * says which folder it is, so the link opens it directly. Until a share has
 * recorded the folder, or when the call is refused or fails, the link falls
 * back to Drive's "Shared with me", where the folder appears.
 *
 * Once the folder is known, each division's folder is listed with its own
 * link (GET /v1/events/:id/drive-folder/divisions), so a DJ can open one
 * division and download it from Drive as a zip.
 */
export default function DriveFolderSection({ event }: { event: ApiEvent }) {
  // A failed call is not an error to show: the fallback link still gets there.
  const folderQuery = useEndpointQuery(endpoints.events.driveFolder, { params: { id: event.id } });
  const folderUrl = folderQuery.data?.url ?? null;
  const divisionsQuery = useEndpointQuery(endpoints.events.driveDivisions, {
    params: { id: event.id },
    enabled: folderUrl !== null,
  });
  const divisions = divisionsQuery.data ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event music in Google Drive</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {folderUrl ? (
          <>
            <p>
              The event&apos;s Drive folder, <span className="font-medium">{event.name}</span>, is shared with your
              email address as a reader. Open it in Google Drive,
              signed in with the email you use here.
            </p>
            <a href={folderUrl} target="_blank" rel="noreferrer" className={LINK_CLASS}>
              Open the event&apos;s folder →
            </a>
            <div className="space-y-2 pt-2">
              <p className="font-medium">By division</p>
              {divisionsQuery.error && divisions === null ? (
                <p className="text-muted-foreground">
                  Couldn&apos;t list the division folders just now; they are all in the event&apos;s folder above.{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => void divisionsQuery.refetch()}>
                    Try again
                  </button>
                </p>
              ) : divisions === null ? (
                <Skeleton className="h-16 w-full" />
              ) : divisions.length === 0 ? (
                <p className="text-muted-foreground">No division folders yet: one appears with the first song submitted in it.</p>
              ) : (
                <>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {divisions.map((d) => (
                      <li key={d.folder_id}>
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-4 py-3 hover:bg-white/[0.1]"
                        >
                          <span className="font-medium">{d.name}</span>
                          <span className="text-primary">Open →</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    To download a division&apos;s music, open its folder and choose Download from the folder&apos;s
                    menu: Drive zips it.
                  </p>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <p>
              The event&apos;s Drive folder, <span className="font-medium">{event.name}</span>, is shared with your
              email address as a reader. Open it from{" "}
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
