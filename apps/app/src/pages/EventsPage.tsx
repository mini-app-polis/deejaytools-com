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

type EventRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
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

export default function EventsPage() {
  const api = useApiClient();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div>
        <h1 className="page-title text-2xl">Events</h1>
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
            <p className="text-sm text-muted-foreground">
              {ev.start_date === ev.end_date
                ? ev.start_date
                : `${ev.start_date} – ${ev.end_date}`}
            </p>
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
              <TableHead>Dates</TableHead>
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
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {ev.start_date === ev.end_date
                    ? ev.start_date
                    : `${ev.start_date} – ${ev.end_date}`}
                </TableCell>
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
    </div>
  );
}
