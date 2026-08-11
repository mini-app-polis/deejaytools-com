import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { ApiSong } from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
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
  const api = useApiClient();

  const [songs, setSongs] = useState<ApiSong[]>([]);
  const [loading, setLoading] = useState(true);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get<ApiSong[]>("/v1/songs")
      .then((s) => { if (!cancelled) setSongs(s); })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.del(`/v1/songs/${id}`);
      setSongs((prev) => prev.filter((s) => s.id !== id));
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

  if (loading) {
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
              {pendingSong?.processed_filename
                ? <>This will permanently remove <span className="font-mono break-all">{pendingSong.processed_filename}</span>. This cannot be undone.</>
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
        {songs.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No songs yet.</p>
        )}
        {songs.map((s) => {
          const partnerName = !s.partner_id
            ? null
            : [s.partner_first_name, s.partner_last_name].filter(Boolean).join(" ").trim() || null;
          return (
            <div key={s.id} className="rounded-lg border-2 border-primary/40 bg-card p-4 space-y-2 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-sm leading-snug break-all flex-1">
                  {s.processed_filename?.trim() ? s.processed_filename : "—"}
                </p>
                <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {new Date(s.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {s.division && (
                  <span>
                    <span className="text-muted-foreground text-xs">Division </span>
                    {s.division}
                  </span>
                )}
                {partnerName && (
                  <span>
                    <span className="text-muted-foreground text-xs">Partner </span>
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
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="w-full mt-1"
                onClick={() => setPendingDeleteId(s.id)}
              >
                Delete
              </Button>
            </div>
          );
        })}
      </div>

    </div>
  );
}
