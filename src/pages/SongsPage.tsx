import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { songPieces } from "@/lib/songLabel";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import SongCard from "@/components/SongCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function SongsPage() {
  const songsQuery = useEndpointQuery(endpoints.songs.list);
  const songs = songsQuery.data ?? [];
  const loading = songsQuery.isFetching;
  const removeSong = useEndpointMutation(endpoints.songs.remove, {
    invalidates: [endpoints.songs.list, endpoints.eventSongSubmissions.list],
  });

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await removeSong.mutateAsync({ params: { id } });
      setPendingDeleteId(null);
      toast.success("Song removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete song.");
      setPendingDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const pendingSong = songs.find((s) => s.id === pendingDeleteId);

  if (songsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="page-title text-2xl">My Songs</h1>
        <Button asChild>
          <Link to="/songs/add">Add Song</Link>
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!pendingDeleteId} onOpenChange={(open: boolean) => { if (!open) setPendingDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this song?</DialogTitle>
            <DialogDescription>
              {pendingSong && songPieces(pendingSong)
                ? <>This will permanently remove <span className="font-medium break-words">{songPieces(pendingSong)}</span>. This cannot be undone.</>
                : "This will permanently remove the song. This cannot be undone."
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={!!deletingId} onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!deletingId}
              onClick={() => { if (pendingDeleteId) void handleDelete(pendingDeleteId); }}
            >
              {deletingId ? "Removing…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className={`space-y-3${loading ? " opacity-60" : ""}`}>
        {songsQuery.error && !songsQuery.data && (
          <QueryError what="your songs" error={songsQuery.error} onRetry={() => void songsQuery.refetch()} />
        )}
        {songsQuery.data && songs.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No songs yet.{" "}
            <Link to="/songs/add" className="underline">
              Add a song
            </Link>
            .
          </p>
        )}
        {songs.map((s) => (
          <SongCard key={s.id} song={s} onDelete={setPendingDeleteId} />
        ))}
      </div>

    </div>
  );
}
