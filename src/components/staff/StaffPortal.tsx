import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import { queryKey } from "@/api/queryKeys";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEventDateRange } from "@/lib/eventDates";
import { cn } from "@/lib/utils";
import type { ApiEvent } from "@/schemas";

export type PortalSection = {
  /** URL slug: the section is at `<portal>/<slug>`. */
  slug: string;
  label: string;
  render: (event: ApiEvent, setEvent: (next: ApiEvent) => void) => ReactNode;
};

/**
 * The frame every per-event staff portal shares: the event's name and dates,
 * the portal's role, and one tab per section, each its own URL like the
 * admin sections. Only the event in the `:eventId` path segment is ever
 * shown; the route's EventRoleGuard has already checked the caller is on
 * its staff.
 */
export default function StaffPortal({
  roleLabel,
  portalSegment,
  sections,
}: {
  roleLabel: string;
  /** The path segment after the event id: "coordinator", "dj" or "manage". */
  portalSegment: string;
  sections: PortalSection[];
}) {
  const queryClient = useQueryClient();
  const { eventId = "", section: rawSection } = useParams<{ eventId: string; section: string }>();
  const eventQuery = useEndpointQuery(endpoints.events.get, { params: { id: eventId } });
  const event = eventQuery.data ?? null;
  const loadFailed = !event && !!eventQuery.error;
  // A section that saves the event hands back what the API stored.
  const setEvent = (next: ApiEvent) =>
    queryClient.setQueryData(queryKey(endpoints.events.get, { id: eventId }), next);

  const base = `/events/${encodeURIComponent(eventId)}/${portalSegment}`;
  const current = sections.find((s) => s.slug === rawSection);
  // A portal with several sections gives each its own URL; the bare portal
  // URL, or an unknown slug, lands on the first.
  if (sections.length > 1 && !current) {
    return <Navigate to={`${base}/${sections[0].slug}`} replace />;
  }
  const active = current ?? sections[0];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="page-title text-2xl">{event?.name ?? (loadFailed ? "Event" : "")}</h1>
          <Badge variant="secondary">{roleLabel}</Badge>
        </div>
        {event && (
          <p className="text-sm text-muted-foreground">
            {formatEventDateRange(event.start_date, event.end_date)}
          </p>
        )}
      </div>

      {sections.length > 1 && (
        <nav aria-label={`${roleLabel} sections`} className="flex gap-1 overflow-x-auto border-b border-white/[0.07] pb-2">
          {sections.map((s) => (
            <NavLink
              key={s.slug}
              to={`${base}/${s.slug}`}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
      )}

      {event ? (
        <div key={active.slug}>{active.render(event, setEvent)}</div>
      ) : loadFailed && eventQuery.error ? (
        <QueryError what="this event" error={eventQuery.error} onRetry={() => void eventQuery.refetch()} />
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
    </div>
  );
}
