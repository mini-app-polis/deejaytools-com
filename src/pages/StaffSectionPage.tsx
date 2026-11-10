import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import { queryKey } from "@/api/queryKeys";
import AuthMeError from "@/components/AuthMeError";
import QueryError from "@/components/QueryError";
import { SECTION_RENDER } from "@/components/staff/portalSections";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMe } from "@/hooks/useAuthMe";
import { defaultEventId, formatEventDateRange } from "@/lib/eventDates";
import { EVENT_ROLE_LABELS, richestEventRole } from "@/lib/eventRoles";
import { ALL_STAFF_PAGES, eventsForStaffPage } from "@/lib/staffPages";
import type { ApiEvent } from "@/schemas";

const NO_EVENTS: readonly ApiEvent[] = [];

/**
 * A staff page, at /staff/:section?event=<id>: pick one of the events the
 * caller may open this page for, then the page on that event, as an admin
 * picks an event on an admin page. The events are those where the caller's
 * role has this page (an admin: every event). The event picked is kept in
 * the URL, so the page can be linked and reloaded.
 *
 * This only decides what the app shows. The API authorizes every call the
 * page makes on its own, against the picked event.
 */
export default function StaffSectionPage() {
  const { section = "" } = useParams<{ section: string }>();
  const [search, setSearch] = useSearchParams();
  const queryClient = useQueryClient();
  const { me, loading, isAdmin, eventRoles, error, reload } = useAuthMe();
  const eventsQuery = useEndpointQuery(endpoints.events.list);
  const allEvents = eventsQuery.data ?? NO_EVENTS;

  const page = ALL_STAFF_PAGES.find((p) => p.slug === section);
  const allowed = isAdmin ? allEvents.map((e) => e.id) : eventsForStaffPage(eventRoles, section);
  const events = allEvents.filter((e) => allowed.includes(e.id));
  const asked = search.get("event") ?? "";
  const eventId = events.some((e) => e.id === asked) ? asked : defaultEventId(events);
  const event = events.find((e) => e.id === eventId) ?? null;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!me && error) return <AuthMeError message={error} onRetry={() => void reload()} />;
  // An unknown page, or one none of the caller's roles has: nothing to show.
  if (!me || !page || (!isAdmin && eventsForStaffPage(eventRoles, section).length === 0)) {
    return <Navigate to="/" replace />;
  }

  const pick = (id: string) => setSearch({ event: id }, { replace: true });
  // A section that saves the event hands back what the API stored.
  const setEvent = (next: ApiEvent) => {
    queryClient.setQueryData<ApiEvent[]>(queryKey(endpoints.events.list), (list) =>
      list?.map((e) => (e.id === next.id ? next : e))
    );
    queryClient.setQueryData(queryKey(endpoints.events.get, { id: next.id }), next);
  };
  const role = event ? richestEventRole(eventRoles, event.id) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="page-title text-2xl">{page.label}</h1>
        {role && <Badge variant="secondary">{EVENT_ROLE_LABELS[role]}</Badge>}
      </div>

      <div className="w-full sm:w-80 space-y-1">
        <Label htmlFor="staff-page-event">Event</Label>
        <Select value={eventId || undefined} onValueChange={pick}>
          <SelectTrigger id="staff-page-event">
            <SelectValue placeholder={eventsQuery.isLoading ? "Loading events…" : "Select an event"} />
          </SelectTrigger>
          <SelectContent>
            {[...events]
              .sort((a, b) => b.start_date.localeCompare(a.start_date))
              .map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} · {formatEventDateRange(e.start_date, e.end_date)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {eventsQuery.error && allEvents.length === 0 ? (
        <QueryError what="the events" error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()} />
      ) : !event ? (
        eventsQuery.isLoading ? <Skeleton className="h-40 w-full" /> : <p className="text-sm text-muted-foreground">No events yet.</p>
      ) : (
        // Keyed by event, so a filter or open dialog never carries over to another event.
        <div key={`${section}:${event.id}`}>{SECTION_RENDER[section](event, setEvent)}</div>
      )}
    </div>
  );
}
