import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { ApiSong } from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

      {/* Mobile card list */}
      <div className={`sm:hidden space-y-3${loading ? " opacity-60" : ""}`}>
        {songs.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No songs yet.</p>
        )}
        {songs.map((s) => {
          const partnerName = !s.partner_id
            ? null
            : [s.partner_first_name, s.partner_last_name].filter(Boolean).join(" ").trim() || null;
          return (
            <div
              key={s.id}
              className="rounded-lg border bg-card p-4 space-y-2 shadow-sm"
            >
              {/* Filename + date row */}
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-sm leading-snug break-all flex-1">
                  {s.processed_filename?.trim() ? s.processed_filename : "—"}
                </p>
                <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {new Date(s.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Metadata pills */}
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

              {/* Delete action */}
              {pendingDeleteId === s.id ? (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Delete this song?</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => void handleDelete(s.id)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id ? "Removing..." : "Yes, delete"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPendingDeleteId(null)}
                    disabled={deletingId === s.id}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="w-full mt-1"
                  onClick={() => setPendingDeleteId(s.id)}
                >
                  Delete
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className={`hidden sm:block${loading ? " opacity-60" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Processed filename</TableHead>
              <TableHead>Division</TableHead>
              <TableHead>Routine name</TableHead>
              <TableHead>Descriptor</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead className="w-[200px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {songs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No songs yet.
                </TableCell>
              </TableRow>
            )}
            {songs.map((s) => {
              const partnerCell = !s.partner_id
                ? "—"
                : [s.partner_first_name, s.partner_last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || "—";
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    {new Date(s.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {s.processed_filename?.trim() ? s.processed_filename : "—"}
                  </TableCell>
                  <TableCell>{s.division ?? "—"}</TableCell>
                  <TableCell>{s.routine_name ?? "—"}</TableCell>
                  <TableCell>{s.personal_descriptor ?? "—"}</TableCell>
                  <TableCell>{partnerCell}</TableCell>
                  <TableCell>
                    {pendingDeleteId === s.id ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">Delete?</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDelete(s.id)}
                          disabled={deletingId === s.id}
                        >
                          {deletingId === s.id ? "Removing..." : "Yes"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setPendingDeleteId(null)}
                          disabled={deletingId === s.id}
                        >
                          No
                        </Button>
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => setPendingDeleteId(s.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

    </div>
  );
}
