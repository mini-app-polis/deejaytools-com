import { EventStatusSchema } from "@deejaytools/schemas";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
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
import { useAuthMe } from "@/hooks/useAuthMe";

type EventRow = {
  id: string;
  name: string;
  date: string | null;
  status: string;
  created_by?: string;
  created_at?: number;
  updated_at?: number;
};

function eventStatusBadge(status: string) {
  switch (status) {
    case "upcoming":
      return <Badge variant="default">{status}</Badge>;
    case "active":
      return (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
          {status}
        </Badge>
      );
    case "completed":
      return <Badge variant="secondary">{status}</Badge>;
    case "cancelled":
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

const FIELD_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

export default function EventsPage() {
  const api = useApiClient();
  const navigate = useNavigate();
  const { isAdmin } = useAuthMe();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [fName, setFName] = useState("");
  const [fDate, setFDate] = useState("");
  const [fStatus, setFStatus] = useState<string>("upcoming");

  const load = () => {
    setLoading(true);
    api
      .get<EventRow[]>("/v1/events")
      .then(setEvents)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api]);

  const openDialog = () => {
    setFName("");
    setFDate("");
    setFStatus("upcoming");
    setDialogOpen(true);
  };

  const closeDialog = () => setDialogOpen(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.post<EventRow>("/v1/events", {
        name: fName.trim(),
        ...(fDate.trim() ? { date: fDate.trim() } : {}),
        ...(fStatus ? { status: fStatus } : {}),
      });
      toast.success("Event created");
      setDialogOpen(false);
      setEvents((prev) => (prev ? [created, ...prev] : [created]));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !events) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="page-title text-2xl">Events</h1>
        {isAdmin && (
          <Button onClick={openDialog} className="w-full sm:w-auto">
            New Event
          </Button>
        )}
      </div>

      {/* Mobile card list */}
      <div className={`sm:hidden space-y-3${loading ? " opacity-60 pointer-events-none" : ""}`}>
        {events?.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No events yet.</p>
        )}
        {events?.map((ev) => (
          <button
            key={ev.id}
            type="button"
            className="w-full text-left rounded-lg border bg-card p-4 space-y-2 shadow-sm active:opacity-70 transition-opacity"
            onClick={() => navigate(`/events/${ev.id}`)}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-base leading-snug">{ev.name}</p>
              {eventStatusBadge(ev.status)}
            </div>
            {ev.date && (
              <p className="text-sm text-muted-foreground">{ev.date}</p>
            )}
            <p className="text-sm font-medium text-primary pt-1">Open →</p>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className={`hidden sm:block${loading ? " opacity-60 pointer-events-none" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No events yet.
                </TableCell>
              </TableRow>
            )}
            {events?.map((ev) => (
              <TableRow
                key={ev.id}
                className="cursor-pointer"
                onClick={() => navigate(`/events/${ev.id}`)}
              >
                <TableCell className="font-medium">{ev.name}</TableCell>
                <TableCell>{ev.date ?? "—"}</TableCell>
                <TableCell>{eventStatusBadge(ev.status)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="link"
                    className="px-0 h-auto"
                    onClick={() => navigate(`/events/${ev.id}`)}
                  >
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={closeDialog}
        >
          <div
            className="rounded-lg border bg-background p-6 shadow-lg w-full sm:max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New event</h2>
              <Button type="button" variant="ghost" size="sm" onClick={closeDialog}>
                ✕
              </Button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>Name</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Date (optional)</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  placeholder="e.g. March 15, 2026"
                  value={fDate}
                  onChange={(e) => setFDate(e.target.value)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Status</label>
                <select
                  className={FIELD_INPUT_CLASS}
                  value={fStatus}
                  onChange={(e) => setFStatus(e.target.value)}
                >
                  {EventStatusSchema.options.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Creating..." : "Create event"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
