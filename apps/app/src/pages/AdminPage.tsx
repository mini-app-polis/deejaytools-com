import { EventStatusSchema, SessionStatusSchema } from "@deejaytools/schemas";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EventRow = {
  id: string;
  name: string;
  date: string | null;
  status: string;
};

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

function eventStatusBadge(status: string) {
  switch (status) {
    case "upcoming":
      return <Badge variant="default">{status}</Badge>;
    case "active":
      return (
        <Badge className="bg-green-600 text-white hover:bg-green-600/90 border-transparent">
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

function sessionStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return <Badge variant="secondary">{status}</Badge>;
    case "checkin_open":
      return <Badge variant="default">{status}</Badge>;
    case "in_progress":
      return (
        <Badge className="bg-green-600 text-white hover:bg-green-600/90 border-transparent">
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

export default function AdminPage() {
  const api = useApiClient();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const loadEvents = () => {
    setLoadingEvents(true);
    api
      .get<EventRow[]>("/v1/events")
      .then(setEvents)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoadingEvents(false));
  };

  const loadSessions = () => {
    setLoadingSessions(true);
    api
      .get<SessionRow[]>("/v1/sessions")
      .then(setSessions)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoadingSessions(false));
  };

  useEffect(() => {
    loadEvents();
    loadSessions();
  }, [api]);

  const patchEventStatus = async (id: string, status: string) => {
    try {
      const updated = await api.patch<EventRow>(`/v1/events/${id}`, { status });
      toast.success("Event updated");
      setEvents((prev) => prev?.map((e) => (e.id === id ? updated : e)) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      await api.del(`/v1/events/${id}`);
      toast.success("Event deleted");
      setEvents((prev) => prev?.filter((e) => e.id !== id) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const patchSessionStatus = async (id: string, status: string) => {
    try {
      const updated = await api.patch<SessionRow>(`/v1/sessions/${id}/status`, { status });
      toast.success("Session updated");
      setSessions((prev) => prev?.map((s) => (s.id === id ? { ...s, ...updated } : s)) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Admin</h1>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4 space-y-3">
          {loadingEvents && !events ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className={loadingEvents ? "opacity-60" : ""}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Controls</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events?.map((ev) => (
                    <TableRow
                      key={ev.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/events/${ev.id}`)}
                    >
                      <TableCell className="font-medium">{ev.name}</TableCell>
                      <TableCell>{ev.date ?? "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {eventStatusBadge(ev.status)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={ev.status}
                          onValueChange={(v) => patchEventStatus(ev.id, v)}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EventStatusSchema.options.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button variant="destructive" size="sm" onClick={() => deleteEvent(ev.id)}>
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sessions" className="mt-4 space-y-3">
          {loadingSessions && !sessions ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className={loadingSessions ? "opacity-60" : ""}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Times</TableHead>
                    <TableHead>Update status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions?.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        <Button variant="link" className="px-0 h-auto" onClick={() => navigate(`/sessions/${s.id}`)}>
                          {s.name}
                        </Button>
                      </TableCell>
                      <TableCell>{sessionStatusBadge(s.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(s.checkin_opens_at).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell>
                        <Select value={s.status} onValueChange={(v) => patchSessionStatus(s.id, v)}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SessionStatusSchema.options.map((st) => (
                              <SelectItem key={st} value={st}>
                                {st}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <p className="text-muted-foreground">User management coming soon</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
