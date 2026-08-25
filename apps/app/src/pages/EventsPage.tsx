import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { ApiEvent } from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { compareEventChrono } from "@/lib/chronoSort";
import { CLICKABLE_CARD_CLASS } from "@/lib/clickable";
import { cn } from "@/lib/utils";

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

/** "2026-06-15" for a one-day event, "2026-06-01 – 2026-06-05" for a run. */
function formatEventDates(ev: Pick<ApiEvent, "start_date" | "end_date">): string {
  return ev.start_date === ev.end_date
    ? ev.start_date
    : `${ev.start_date} – ${ev.end_date}`;
}

export default function EventsPage() {
  const api = useApiClient();
  const [events, setEvents] = useState<ApiEvent[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<ApiEvent[]>("/v1/events")
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

  // This page answers "what is on right now, and what is coming up". Completed
  // and cancelled events are dropped rather than sorted to the bottom — they
  // stay reachable by direct URL, they just don't belong in the listing.
  // Active first, then upcoming soonest-first.
  const sortedEvents = events
    ?.filter((ev) => ev.status === "active" || ev.status === "upcoming")
    .sort(compareEventChrono);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title text-2xl">Events</h1>
        <p className="text-sm text-muted-foreground">
          Everything current and upcoming on the platform.
        </p>
      </div>

      {sortedEvents?.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">No current or upcoming events.</p>
      )}

      {/* Cards at every breakpoint — a handful of events with a name, a date
          range and a status has no columns worth aligning, and the card is
          already the shape used for sessions on Floor Trials and the event
          picker in Manager. */}
      <div
        className={cn(
          "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
          loading && "opacity-60 pointer-events-none"
        )}
      >
        {sortedEvents?.map((ev) => (
          // A real <Link>, not a button + navigate: middle-click, cmd-click and
          // "copy link address" all work, and the whole card is the target.
          <Link
            key={ev.id}
            to={`/events/${ev.id}`}
            className={cn(
              "flex h-full flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm",
              CLICKABLE_CARD_CLASS
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-base leading-snug transition-colors group-hover:text-primary">
                {ev.name}
              </p>
              {eventStatusBadge(ev.status)}
            </div>
            <p className="text-sm text-muted-foreground">{formatEventDates(ev)}</p>
            {/* Pushed to the bottom so the affordance lines up across a row of
                cards whose names wrap to different heights. */}
            <p className="mt-auto pt-1 text-sm font-medium text-primary">Open →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
