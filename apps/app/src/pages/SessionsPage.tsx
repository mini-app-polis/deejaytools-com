import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

type SessionRow = {
  id: string;
  event_id: string | null;
  name: string;
  date: string | null;
  status: string;
  checkin_opens_at: number;
  floor_trial_starts_at: number;
  floor_trial_ends_at: number;
};

function sessionStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return <Badge variant="secondary">{status}</Badge>;
    case "checkin_open":
      return <Badge variant="default">{status}</Badge>;
    case "in_progress":
      return (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
          {status}
        </Badge>
      );
    case "completed":
      return <Badge variant="outline">{status}</Badge>;
    case "cancelled":
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function SessionsPage() {
  const api = useApiClient();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    setLoading(true);
    api
      .get<SessionRow[]>("/v1/sessions")
      .then((rows) => on && setSessions(rows))
      .catch((e: Error) => on && toast.error(e.message))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, [api]);

  if (loading && !sessions) {
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
        <h1 className="page-title text-2xl">Sessions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All floor trials, newest first. Open a session to check in or view the live queue.
        </p>
      </div>

      {/* Mobile card list */}
      <div className={`sm:hidden space-y-3${loading ? " opacity-60" : ""}`}>
        {sessions?.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No sessions yet.</p>
        )}
        {sessions?.map((s) => (
          <Link
            key={s.id}
            to={`/sessions/${s.id}`}
            className="block rounded-lg border bg-card p-4 space-y-2 shadow-sm active:opacity-70 transition-opacity"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-base leading-snug">{s.name}</p>
              {sessionStatusBadge(s.status)}
            </div>
            <div className="text-sm text-muted-foreground space-y-0.5">
              {s.date && <p>{s.date}</p>}
              <p>
                Check-in {formatTime(s.checkin_opens_at)}
              </p>
              <p>
                Floor trial ends {formatTime(s.floor_trial_ends_at)}
              </p>
            </div>
            <p className="text-sm font-medium text-primary pt-1">Open →</p>
          </Link>
        ))}
      </div>

      {/* Desktop table */}
      <div className={`hidden sm:block${loading ? " opacity-60" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Check-in / floor trial</TableHead>
              <TableHead className="w-[120px]"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No sessions yet.
                </TableCell>
              </TableRow>
            )}
            {sessions?.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.date ?? "—"}</TableCell>
                <TableCell>{sessionStatusBadge(s.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatTime(s.checkin_opens_at)} — {formatTime(s.floor_trial_ends_at)}
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/sessions/${s.id}`}>Open</Link>
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
