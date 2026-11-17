import AuthMeError from "@/components/AuthMeError";
import LinkCard from "@/components/LinkCard";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMe } from "@/hooks/useAuthMe";
import { useStaffEvents } from "@/hooks/useStaffEvents";
import { formatEventDateRange } from "@/lib/eventDates";
import { EVENT_ROLE_LABELS, eventPortalPath } from "@/lib/eventRoles";

/**
 * The events the caller is on the staff of, each linking to the portal of
 * the richest role they hold there.
 */
export default function MyEventsPage() {
  const { me, eventRoles, loading: meLoading, error, reload } = useAuthMe();
  const { items, loading, error: eventsError, retry } = useStaffEvents(eventRoles);

  if (!me && error) {
    return <AuthMeError message={error} onRetry={() => void reload()} />;
  }

  if (meLoading || loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">My events</h1>
      {eventsError && <QueryError what="the event details" error={eventsError} onRetry={retry} />}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You aren&apos;t on the staff of any event. An organizer adds you to an event&apos;s staff.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((s) => (
            // The shared card (LinkCard), as on the events and Floor Trials pages.
            <LinkCard
              key={s.eventId}
              to={eventPortalPath(s.eventId, s.role)}
              badges={
                <Badge variant="outline" className="border-primary/40 text-primary">
                  {EVENT_ROLE_LABELS[s.role]} portal
                </Badge>
              }
              title={s.event?.name ?? "Event"}
              details={s.event && <p>{formatEventDateRange(s.event.start_date, s.event.end_date)}</p>}
            />
          ))}
        </div>
      )}
    </div>
  );
}
