import { songLabel } from "@/lib/songLabel";
import type { ApiSong } from "@/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SongCardProps = {
  song: ApiSong;
  onDelete: (id: string) => void;
  /** Also show the uploaded file name and the Drive / legacy action. */
  showFile?: boolean;
};

export default function SongCard({ song: s, onDelete, showFile = false }: SongCardProps) {
  const partnerName = s.partnership_label?.trim() || null;
  const driveUrl = s.drive_file_id ? `https://drive.google.com/file/d/${s.drive_file_id}/view` : null;
  const sharedBadge = <Badge variant="outline">Shared with you</Badge>;

  return (
    <div className="rounded-lg border-2 border-primary/40 bg-card p-4 space-y-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm leading-snug break-words flex-1">{songLabel(s)}</p>
        <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {new Date(s.created_at).toLocaleDateString()}
        </p>
      </div>
      {showFile && s.shared_with_me && sharedBadge}
      {showFile && s.original_filename?.trim() && (
        <p className="font-mono text-xs text-muted-foreground leading-snug break-all">
          <span className="text-muted-foreground text-xs not-italic">Uploaded: </span>
          {s.original_filename}
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {s.division && (
          <span>
            <span className="text-muted-foreground text-xs">Division </span>
            {s.division}
          </span>
        )}
        {partnerName && (
          <span>
            <span className="text-muted-foreground text-xs">Entered as </span>
            {partnerName}
          </span>
        )}
        {s.routine_name && (
          <span>
            <span className="text-muted-foreground text-xs">Routine </span>
            {s.routine_name}
          </span>
        )}
        {s.personal_descriptor && (
          <span>
            <span className="text-muted-foreground text-xs">Descriptor </span>
            {s.personal_descriptor}
          </span>
        )}
      </div>
      {showFile ? (
        <div className="flex gap-2 mt-1">
          {/* Legacy rows have no Drive file (and never will): show a disabled
              placeholder so it reads as metadata-only, not a broken link. */}
          {s.is_legacy ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              disabled
              title="This song was imported from the legacy catalog and has no uploaded audio file."
            >
              Legacy Song
            </Button>
          ) : driveUrl ? (
            <Button type="button" size="sm" variant="outline" className="flex-1" asChild>
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open song in Google Drive to check playback"
              >
                Open in Google Drive
              </a>
            </Button>
          ) : null}
          {/* Only the owner may delete; a shared song is the partner's. */}
          {!s.shared_with_me && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => onDelete(s.id)}
            >
              Delete
            </Button>
          )}
        </div>
      ) : s.shared_with_me ? (
        sharedBadge
      ) : (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="w-full mt-1"
          onClick={() => onDelete(s.id)}
        >
          Delete
        </Button>
      )}
    </div>
  );
}
