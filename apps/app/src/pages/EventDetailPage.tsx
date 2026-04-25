import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthMe } from "@/hooks/useAuthMe";

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
  checkin_opens_at: number;
  floor_trial_starts_at: number;
  floor_trial_ends_at: number;
  active_priority_max?: number;
  active_non_priority_max?: number;
  status: string;
  divisions?: {
    division_name: string;
    is_priority: boolean;
    sort_order: number;
    priority_run_limit?: number;
  }[];
};

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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const divisionSchema = z.object({
  division_name: z.string().min(1),
  is_priority: z.boolean(),
  priority_run_limit: z.coerce.number().int().min(0).default(0),
});

const sessionFormSchema = z
  .object({
    name: z.string().min(1),
    date: z.string().optional(),
    checkin_opens_at: z.string().min(1),
    floor_trial_starts_at: z.string().min(1),
    floor_trial_ends_at: z.string().min(1),
    active_priority_max: z.coerce.number().int().min(0).default(6),
    active_non_priority_max: z.coerce.number().int().min(0).default(4),
    divisions: z.array(divisionSchema).default([]),
  })
  .refine((v) => v.active_non_priority_max <= v.active_priority_max, {
    message: "Non-priority cap must be less than or equal to the priority (active) cap",
    path: ["active_non_priority_max"],
  });

type SessionFormValues = z.infer<typeof sessionFormSchema>;

function getEmptySessionFormValues(): SessionFormValues {
  return {
    name: "",
    date: "",
    checkin_opens_at: "",
    floor_trial_starts_at: "",
    floor_trial_ends_at: "",
    active_priority_max: 6,
    active_non_priority_max: 4,
    divisions: [{ division_name: "Classic", is_priority: false, priority_run_limit: 0 }],
  };
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApiClient();
  const { isAdmin } = useAuthMe();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: getEmptySessionFormValues(),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "divisions",
  });

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

  const onSessionDialogOpenChange = useCallback(
    (open: boolean) => {
      setSessionDialogOpen(open);
      if (open) {
        form.reset(getEmptySessionFormValues());
      }
    },
    [form]
  );

  const onCreateSession = form.handleSubmit(async (values) => {
    if (!id) return;
    try {
      const divisions = values.divisions
        .filter((d) => d.division_name.trim() && d.division_name.trim() !== "Other")
        .map((d, i) => ({
          division_name: d.division_name.trim(),
          is_priority: d.is_priority,
          sort_order: i,
          priority_run_limit: d.priority_run_limit ?? 0,
        }));
      await api.post<SessionRow>("/v1/sessions", {
        event_id: id,
        name: values.name.trim(),
        ...(values.date?.trim() ? { date: values.date.trim() } : {}),
        checkin_opens_at: new Date(values.checkin_opens_at).getTime(),
        floor_trial_starts_at: new Date(values.floor_trial_starts_at).getTime(),
        floor_trial_ends_at: new Date(values.floor_trial_ends_at).getTime(),
        active_priority_max: values.active_priority_max,
        active_non_priority_max: values.active_non_priority_max,
        divisions,
      });
      toast.success("Session created");
      setSessionDialogOpen(false);
      form.reset(getEmptySessionFormValues());
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create session");
    }
  });

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
            <h1 className="text-xl font-semibold">{event.name}</h1>
            <p className="text-sm text-muted-foreground">{event.date ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            {event.status === "upcoming" && <Badge variant="default">upcoming</Badge>}
            {event.status === "active" && (
              <Badge className="bg-green-600 text-white hover:bg-green-600/90 border-transparent">
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

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions" className="space-y-4 mt-4">
          <div className="flex justify-end">
            {isAdmin && (
              <div>
                <Button onClick={() => setSessionDialogOpen(true)}>New Session</Button>
                {sessionDialogOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="rounded-lg border bg-background p-6 shadow-lg max-w-lg w-full space-y-4">
                      <h2 className="text-lg font-semibold">New session (smoke test)</h2>
                      <p>If you can read this, the dialog itself was the problem.</p>
                      <Button onClick={() => setSessionDialogOpen(false)}>Close</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {sessions?.length === 0 && (
            <p className="text-sm text-muted-foreground">No sessions for this event.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {sessions?.map((sess) => (
              <Card key={sess.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex flex-wrap items-center gap-2">
                    {sess.name}
                    {sessionStatusBadge(sess.status)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  <p>Check-in: {formatTime(sess.checkin_opens_at)}</p>
                  <p>Floor trial: {formatTime(sess.floor_trial_starts_at)} – {formatTime(sess.floor_trial_ends_at)}</p>
                  <Separator className="my-2" />
                  <Button variant="link" className="px-0 h-auto" asChild>
                    <Link to={`/sessions/${sess.id}`}>Open session →</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="registrations" className="mt-4">
          <p className="text-muted-foreground">Coming soon</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
