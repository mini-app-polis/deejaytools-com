import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSessionTitle, formatTimeOnly } from "@/lib/sessionFormat";

type EventRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
};

type SessionRow = {
  id: string;
  event_id: string | null;
  name: string;
  date: string | null;
  checkin_opens_at: number;
  floor_trial_starts_at: number;
  floor_trial_ends_at: number;
  active_priority_max?: number;
  active_non_priority_max?: number;
  status: string;
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

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApiClient();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get<EventRow>(`/v1/events/${id}`),
      api.get<SessionRow[]>(`/v1/sessions?event_id=${encodeURIComponent(id)}`),
    ])
      .then(([ev, sess]) => {
        setEvent(ev);
        setSessions(sess);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api, id]);

  if (!id) {
    return <p className="text-muted-foreground">Missing event id.</p>;
  }

  if (loading && !event) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!event) {
    return <p className="text-muted-foreground">Event not found.</p>;
  }

  return (
    <div className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
      <div>
        <Button variant="ghost" size="sm" className="mb-2 px-0" asChild>
          <Link to="/events">← Events</Link>
        </Button>
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="page-title text-2xl">{event.name}</h1>
            <p className="text-sm text-muted-foreground">
              {event.start_date === event.end_date
                ? event.start_date
                : `${event.start_date} – ${event.end_date}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {event.status === "upcoming" && <Badge variant="default">upcoming</Badge>}
            {event.status === "active" && (
              <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
                active
              </Badge>
            )}
            {event.status === "completed" && <Badge variant="secondary">completed</Badge>}
            {event.status === "cancelled" && <Badge variant="destructive">cancelled</Badge>}
            {!["upcoming", "active", "completed", "cancelled"].includes(event.status) && (
              <Badge variant="outline">{event.status}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-base font-semibold">Sessions</h2>
        {sessions?.length === 0 && (
          <p className="text-sm text-muted-foreground">No sessions for this event.</p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {sessions?.map((sess) => (
            <Card key={sess.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  {formatSessionTitle(sess)}
                  {sessionStatusBadge(sess.status)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>Open: {formatTimeOnly(sess.checkin_opens_at)}</p>
                <p>
                  Floor trial: {formatTimeOnly(sess.floor_trial_starts_at)} –{" "}
                  {formatTimeOnly(sess.floor_trial_ends_at)}
                </p>
                <Separator className="my-2" />
                <Button variant="link" className="px-0 h-auto" asChild>
                  <Link to={`/sessions/${sess.id}`}>Open session →</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
