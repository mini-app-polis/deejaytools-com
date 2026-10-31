import { Link } from "react-router-dom";
import AuthMeError from "@/components/AuthMeError";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMe } from "@/hooks/useAuthMe";
import { useStaffEvents } from "@/hooks/useStaffEvents";
import { CLICKABLE_CARD_CLASS } from "@/lib/clickable";
import { formatEventDateRange } from "@/lib/eventDates";
import { EVENT_ROLE_LABELS, eventPortalPath } from "@/lib/eventRoles";
import { cn } from "@/lib/utils";

/**
 * The events the caller is on the staff of, each linking to the portal of
 * the richest role they hold there.
 */
export default function MyEventsPage() {
  const { me, eventRoles, loading: meLoading, error, reload } = useAuthMe();
  const { items, loading } = useStaffEvents(eventRoles);

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
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You aren&apos;t on the staff of any event. An organizer adds you to an event&apos;s staff.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((s) => (
            <Link
              key={s.eventId}
              to={eventPortalPath(s.eventId, s.role)}
              className={cn(CLICKABLE_CARD_CLASS, "block rounded-lg border px-4 py-3")}
            >
              <p className="font-medium">{s.event?.name ?? "Event"}</p>
              {s.event && (
                <p className="text-sm text-muted-foreground">
                  {formatEventDateRange(s.event.start_date, s.event.end_date)}
                </p>
              )}
              <p className="text-xs text-primary mt-1">{EVENT_ROLE_LABELS[s.role]} portal →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
