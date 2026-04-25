import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuthMe } from "@/hooks/useAuthMe";
import { useUser } from "@clerk/clerk-react";

type SessionDetail = {
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
    priority_run_limit?: number;
  }[];
  has_active_checkin?: boolean;
  active_checkin_division?: string;
  queue_depth?: { priority: number; non_priority: number; active: number };
};

type QueueRow = {
  queueEntryId: string;
  checkinId: string;
  position: number;
  enteredQueueAt: number;
  entityPairId: string | null;
  entitySoloUserId: string | null;
  divisionName: string;
  songId: string;
  notes: string | null;
  initialQueue: string;
  checkedInAt: number;
};

type LeadingPair = { id: string; partner_b_id: string | null; display_name: string };

type SongRow = {
  id: string;
  display_name: string | null;
  processed_filename?: string | null;
};

const checkinFormSchema = z
  .object({
    divisionName: z.string().min(1),
    entityPairId: z.string().nullish(),
    entitySoloUserId: z.string().nullish(),
    songId: z.string().min(1),
    notes: z.string().nullish(),
    eventRegistrationId: z.string().nullish(),
    entity: z.enum(["solo", "pair"]),
    pairId: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.entity === "solo" && v.entitySoloUserId == null) {
      ctx.addIssue({ code: "custom", message: "Solo requires user", path: ["entity"] });
    }
    if (v.entity === "pair" && (!v.entityPairId || v.entityPairId === "")) {
      ctx.addIssue({ code: "custom", message: "Select a pair", path: ["pairId"] });
    }
  });

type CheckinFormValues = z.infer<typeof checkinFormSchema>;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
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

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApiClient();
  const { user } = useUser();
  const { isAdmin } = useAuthMe();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [active, setActive] = useState<QueueRow[]>([]);
  const [priority, setPriority] = useState<QueueRow[]>([]);
  const [nonPriority, setNonPriority] = useState<QueueRow[]>([]);
  const [pairs, setPairs] = useState<LeadingPair[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinOpen, setCheckinOpen] = useState(false);

  const form = useForm<CheckinFormValues>({
    resolver: zodResolver(checkinFormSchema),
    defaultValues: {
      divisionName: "",
      entity: "pair",
      pairId: "",
      entityPairId: undefined,
      entitySoloUserId: undefined,
      songId: "",
      notes: "",
      eventRegistrationId: undefined,
    },
  });

  const loadSession = useCallback(() => {
    if (!id) return;
    return api.get<SessionDetail>(`/v1/sessions/${id}`).then(setSession);
  }, [api, id]);

  const loadQueues = useCallback(async () => {
    if (!id) return;
    const a = await api.get<QueueRow[]>(`/v1/queue/${id}/active`);
    setActive(a);
    if (isAdmin) {
      const [p, np] = await Promise.all([
        api.get<QueueRow[]>(`/v1/queue/${id}/priority`),
        api.get<QueueRow[]>(`/v1/queue/${id}/non-priority`),
      ]);
      setPriority(p);
      setNonPriority(np);
    } else {
      setPriority([]);
      setNonPriority([]);
    }
  }, [api, id, isAdmin]);

  const loadExtras = useCallback(async () => {
    const [p, s] = await Promise.all([
      api.get<LeadingPair[]>("/v1/partners/leading-pairs"),
      api.get<SongRow[]>("/v1/songs"),
    ]);
    setPairs(p);
    setSongs(s);
  }, [api]);

  const refresh = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([loadSession(), loadQueues(), loadExtras()])
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id, loadExtras, loadQueues, loadSession]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => {
      void Promise.all([loadQueues(), loadSession()]).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, [id, loadQueues, loadSession]);

  const divisionsList = useMemo(() => {
    const fromSession = session?.divisions?.map((d) => d.division_name) ?? [];
    return fromSession.filter((n) => n && n !== "Other");
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const first = divisionsList[0] ?? "";
    if (first) form.setValue("divisionName", first);
  }, [session?.id, divisionsList, form]);

  const selectedPairId = form.watch("pairId");
  useEffect(() => {
    if (!id) return;
    const q =
      selectedPairId && pairs.find((p) => p.id === selectedPairId)?.partner_b_id
        ? `?partner_id=${encodeURIComponent(pairs.find((p) => p.id === selectedPairId)!.partner_b_id!)}`
        : "";
    void api
      .get<SongRow[]>(`/v1/songs${q}`)
      .then(setSongs)
      .catch(() => {});
  }, [api, id, selectedPairId, pairs]);

  const slotOne = active.find((r) => r.position === 1);
  const upcoming = active.filter((r) => r.position > 1).sort((a, b) => a.position - b.position);

  const depth = session?.queue_depth ?? { priority: 0, non_priority: 0, active: 0 };
  const promotePriorityDisabled =
    depth.active >= (session?.active_priority_max ?? 6);
  const promoteNonPriorityDisabled =
    depth.priority > 0 || depth.active >= (session?.active_non_priority_max ?? 4);

  const queueAction = async (path: string, body: unknown) => {
    try {
      await api.post(path, body);
      toast.success("Updated");
      await loadQueues();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      if (msg.toLowerCase().includes("conflict") || msg.toLowerCase().includes("retry")) {
        toast.error(`${msg} — retry?`);
      } else {
        toast.error(msg);
      }
    }
  };

  const submitCheckin = form.handleSubmit(async (values) => {
    if (!id || !user?.id) return;
    try {
      const soloId = values.entity === "solo" ? user.id : undefined;
      const pairId = values.entity === "pair" ? values.pairId || values.entityPairId : undefined;
      await api.post("/v1/checkins", {
        sessionId: id,
        divisionName: values.divisionName.trim(),
        entityPairId: pairId ?? null,
        entitySoloUserId: soloId ?? null,
        songId: values.songId,
        notes: values.notes?.trim() || undefined,
        eventRegistrationId: values.eventRegistrationId,
      });
      toast.success("Checked in");
      setCheckinOpen(false);
      await Promise.all([loadQueues(), loadSession()]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Check-in failed";
      if (msg.includes("already has a live")) {
        toast.error("You're already in the queue for this session.");
      } else {
        toast.error(msg);
      }
    }
  });

  const canCheckIn =
    session &&
    (session.status === "checkin_open" || session.status === "in_progress") &&
    session.has_active_checkin !== true &&
    songs.length > 0 &&
    divisionsList.length > 0;

  const songLabel = (s: SongRow) => s.display_name ?? s.processed_filename ?? s.id;

  if (!id) {
    return <p className="text-muted-foreground">Missing session id.</p>;
  }

  if (loading && !session) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!session) {
    return <p className="text-muted-foreground">Session not found.</p>;
  }

  return (
    <div className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
      <div>
        <Button variant="ghost" size="sm" className="mb-2 px-0" asChild>
          <Link to="/sessions">← Sessions</Link>
        </Button>
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">{session.name}</h1>
            <p className="text-sm text-muted-foreground">
              Opens {formatTime(session.checkin_opens_at)} · Floor trial{" "}
              {formatTime(session.floor_trial_starts_at)} – {formatTime(session.floor_trial_ends_at)}
            </p>
          </div>
          {sessionStatusBadge(session.status)}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Currently running</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {slotOne ? (
            <>
              <div className="text-sm">
                <div className="font-medium">Slot 1 · {slotOne.divisionName}</div>
                <div className="text-muted-foreground">Song {slotOne.songId}</div>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      queueAction("/v1/queue/complete", { sessionId: id, reason: null })
                    }
                  >
                    Run complete
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      queueAction("/v1/queue/incomplete", { sessionId: id, reason: null })
                    }
                  >
                    Run incomplete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      queueAction("/v1/queue/withdraw", {
                        queueEntryId: slotOne.queueEntryId,
                        reason: null,
                      })
                    }
                  >
                    Withdraw
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No one on deck (slot 1 empty).</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming (active)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming slots.</p>}
          {upcoming.map((r) => (
            <div
              key={r.queueEntryId}
              className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
            >
              <span>
                #{r.position} · {r.divisionName} · song {r.songId}
              </span>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    queueAction("/v1/queue/withdraw", {
                      queueEntryId: r.queueEntryId,
                      reason: null,
                    })
                  }
                >
                  Withdraw
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {isAdmin && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Priority queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {priority.map((r) => (
                <div
                  key={r.queueEntryId}
                  className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                >
                  <span>
                    #{r.position} · {r.divisionName}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={promotePriorityDisabled}
                      onClick={() =>
                        queueAction("/v1/queue/promote", { queueEntryId: r.queueEntryId })
                      }
                    >
                      Promote
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        queueAction("/v1/queue/withdraw", {
                          queueEntryId: r.queueEntryId,
                          reason: null,
                        })
                      }
                    >
                      Withdraw
                    </Button>
                  </div>
                </div>
              ))}
              {priority.length === 0 && (
                <p className="text-sm text-muted-foreground">Priority queue empty.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Non-priority queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {nonPriority.map((r) => (
                <div
                  key={r.queueEntryId}
                  className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                >
                  <span>
                    #{r.position} · {r.divisionName}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={promoteNonPriorityDisabled}
                      onClick={() =>
                        queueAction("/v1/queue/promote", { queueEntryId: r.queueEntryId })
                      }
                    >
                      Promote
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        queueAction("/v1/queue/withdraw", {
                          queueEntryId: r.queueEntryId,
                          reason: null,
                        })
                      }
                    >
                      Withdraw
                    </Button>
                  </div>
                </div>
              ))}
              {nonPriority.length === 0 && (
                <p className="text-sm text-muted-foreground">Non-priority queue empty.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex gap-2">
        <Button disabled={!canCheckIn} onClick={() => setCheckinOpen(true)}>
          Check in
        </Button>
      </div>

      <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check in</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={submitCheckin} className="space-y-4">
              <FormField
                control={form.control}
                name="entity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dancing as</FormLabel>
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v);
                        if (v === "solo" && user?.id) {
                          form.setValue("entitySoloUserId", user.id);
                          form.setValue("entityPairId", undefined);
                          form.setValue("pairId", "");
                        } else {
                          form.setValue("entitySoloUserId", undefined);
                        }
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="pair">Pair</SelectItem>
                        <SelectItem value="solo">Solo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("entity") === "pair" && (
                <FormField
                  control={form.control}
                  name="pairId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pair</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          field.onChange(v);
                          form.setValue("entityPairId", v);
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select pair" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pairs.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="divisionName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Division</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Division" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {divisionsList.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="songId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Song</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Song" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {songs.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {songLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value ?? ""} rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit">Submit</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
