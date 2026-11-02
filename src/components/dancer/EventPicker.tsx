import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import {
  LoadError,
  LoadingSkeleton,
  PageHeader,
  errorMessage,
} from "@/components/dancer/eventSubmissionsShared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApiEvent } from "@/schemas";

// A stable empty list while a query has no data, so memos over it hold.
const NO_ROWS: readonly never[] = [];

function eventOptionLabel(e: ApiEvent): string {
  return `${e.name} · ${e.start_date}`;
}

/** `/event-submissions`: pick an event; choosing one navigates to its page. */
export default function EventPicker() {
  const navigate = useNavigate();
  const eventsQuery = useEndpointQuery(endpoints.events.list);
  const events = useMemo(
    () => (eventsQuery.data ?? NO_ROWS).filter((e) => e.status !== "completed"),
    [eventsQuery.data]
  );

  if (eventsQuery.isLoading) return <LoadingSkeleton />;

  if (eventsQuery.error && !eventsQuery.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Event submissions" />
        <LoadError
          what="the events"
          message={errorMessage(eventsQuery.error)}
          onRetry={() => void eventsQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Event submissions" />

      <Card>
        <CardHeader>
          <CardTitle>Submit songs to an event</CardTitle>
          <CardDescription>
            Choose an upcoming event, then add songs from your library.{" "}
            <Link
              to="/how-it-works/submitting-music#event-submission-required"
              className="text-primary underline underline-offset-2"
            >
              About event submissions →
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming events are available right now.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="event-submissions-event">Event</Label>
              <Select onValueChange={(id) => navigate(`/event-submissions/${id}`)}>
                <SelectTrigger id="event-submissions-event">
                  <SelectValue placeholder="Select an event" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {eventOptionLabel(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">Select an event to manage submissions.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
