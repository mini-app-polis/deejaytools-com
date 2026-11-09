import { useEffect, useState } from "react";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import RegistrationsPanel from "@/components/registrations/RegistrationsPanel";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { defaultEventId } from "@/lib/eventDates";
import type { ApiEvent } from "@/schemas";

const NO_EVENTS: readonly ApiEvent[] = [];

/**
 * The admin Registrations section: pick an event, then its registration list
 * against the songs submitted to it (RegistrationsPanel, which the event's
 * staff portals show too), with the admin's notes. Optional per event. It
 * renders its own TabsContent so it stays mounted while another admin
 * section is shown; `open` holds its queries back until it is.
 */
export default function AdminRegistrationsSection({ open }: { open: boolean }) {
  const eventsQuery = useEndpointQuery(endpoints.events.list, { enabled: open });
  const events = eventsQuery.data ?? NO_EVENTS;
  const [eventId, setEventId] = useState("");
  useEffect(() => {
    if (!eventId && events.length > 0) setEventId(defaultEventId(events));
  }, [eventId, events]);
  const event = events.find((e) => e.id === eventId) ?? null;

  return (
    <TabsContent value="registrations" className="mt-4 space-y-4">
      <div className="w-full sm:w-80 space-y-1">
        <Label htmlFor="admin-registrations-event">Event</Label>
        <Select value={eventId || undefined} onValueChange={setEventId}>
          <SelectTrigger id="admin-registrations-event">
            <SelectValue placeholder={eventsQuery.isLoading ? "Loading events…" : "Select an event"} />
          </SelectTrigger>
          <SelectContent>
            {[...events]
              .sort((a, b) => b.start_date.localeCompare(a.start_date))
              .map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} · {e.start_date}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {eventsQuery.error && events.length === 0 ? (
        <QueryError what="the events" error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()} />
      ) : !event ? (
        eventsQuery.isLoading ? <Skeleton className="h-32 w-full" /> : <p className="text-sm text-muted-foreground">No events yet.</p>
      ) : open ? (
        // Keyed by event, so a filter or open dialog never carries over to another event.
        <RegistrationsPanel key={event.id} event={event} showNotes />
      ) : null}
    </TabsContent>
  );
}
