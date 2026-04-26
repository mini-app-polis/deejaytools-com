import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
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
  status: string;
  divisions?: { division_name: string; is_priority: boolean; sort_order: number }[];
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
});

const sessionFormSchema = z.object({
  name: z.string().min(1),
  date: z.string().optional(),
  checkin_opens_at: z.string().min(1),
  floor_trial_starts_at: z.string().min(1),
  floor_trial_ends_at: z.string().min(1),
  max_slots: z.coerce.number().int().min(1).optional(),
  max_priority_runs: z.coerce.number().int().min(0).optional(),
  divisions: z.array(divisionSchema).default([]),
});

type SessionFormValues = z.infer<typeof sessionFormSchema>;

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
    defaultValues: {
      name: "",
      date: "",
      checkin_opens_at: "",
      floor_trial_starts_at: "",
      floor_trial_ends_at: "",
      max_slots: 7,
      max_priority_runs: 3,
      divisions: [{ division_name: "Classic", is_priority: false }],
    },
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

  const onCreateSession = form.handleSubmit(async (values) => {
    if (!id) return;
    try {
      const divisions = values.divisions
        .filter((d) => d.division_name.trim() && d.division_name.trim() !== "Other")
        .map((d, i) => ({
          division_name: d.division_name.trim(),
          is_priority: d.is_priority,
          sort_order: i,
        }));
      await api.post<SessionRow>("/v1/sessions", {
        event_id: id,
        name: values.name.trim(),
        ...(values.date?.trim() ? { date: values.date.trim() } : {}),
        checkin_opens_at: new Date(values.checkin_opens_at).getTime(),
        floor_trial_starts_at: new Date(values.floor_trial_starts_at).getTime(),
        floor_trial_ends_at: new Date(values.floor_trial_ends_at).getTime(),
        ...(values.max_slots != null ? { max_slots: values.max_slots } : {}),
        ...(values.max_priority_runs != null ? { max_priority_runs: values.max_priority_runs } : {}),
        divisions,
      });
      toast.success("Session created");
      setSessionDialogOpen(false);
      form.reset({
        name: "",
        date: "",
        checkin_opens_at: "",
        floor_trial_starts_at: "",
        floor_trial_ends_at: "",
        max_slots: 7,
        max_priority_runs: 3,
        divisions: [{ division_name: "Classic", is_priority: false }],
      });
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
              <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
                <DialogTrigger asChild>
                  <Button>New Session</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>New session</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={onCreateSession} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date (optional)</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="checkin_opens_at"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Check-in opens</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="floor_trial_starts_at"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Floor trial starts</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="floor_trial_ends_at"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Floor trial ends</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="max_slots"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Max slots</FormLabel>
                              <FormControl>
                                <Input type="number" min={1} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="max_priority_runs"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Max priority runs</FormLabel>
                              <FormControl>
                                <Input type="number" min={0} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <FormLabel>Divisions</FormLabel>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({ division_name: "", is_priority: false })}
                          >
                            Add division
                          </Button>
                        </div>
                        {fields.map((f, index) => (
                          <div key={f.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center">
                            <FormField
                              control={form.control}
                              name={`divisions.${index}.division_name`}
                              render={({ field }) => (
                                <FormItem className="flex-1">
                                  <FormControl>
                                    <Input placeholder="Division name" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`divisions.${index}.is_priority`}
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                  <FormControl>
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                  </FormControl>
                                  <FormLabel className="font-normal">Priority division</FormLabel>
                                </FormItem>
                              )}
                            />
                            <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                      <DialogFooter>
                        <Button type="submit">Create session</Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
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
