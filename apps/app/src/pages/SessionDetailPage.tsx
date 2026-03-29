import { zodResolver } from "@hookform/resolvers/zod";
import { QueueTypeSchema } from "@deejaytools/ts-utils";
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
  DialogDescription,
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
import { useAuthMe } from "@/hooks/useAuthMe";
import { cn } from "@/lib/utils";

type SessionDetail = {
  id: string;
  event_id: string | null;
  name: string;
  date: string | null;
  checkin_opens_at: number;
  floor_trial_starts_at: number;
  floor_trial_ends_at: number;
  status: string;
  divisions?: { division_name: string; is_priority: boolean }[];
  has_active_checkin?: boolean;
  active_checkin_division?: string;
};

type CheckinRow = {
  id: string;
  session_id: string;
  pair_id: string;
  pair_display_name: string;
  song_id: string | null;
  division: string;
  queue_type: string;
  queue_position: number;
  status: string;
  processed_filename?: string | null;
};

type SlotRow = {
  id: string;
  session_id: string;
  slot_number: number;
  checkin_id: string | null;
  assigned_at: number;
  pair_display_name?: string;
  division?: string;
  queue_type?: string;
};

type PartnerRow = {
  id: string;
  first_name: string;
  last_name: string;
};

type SongRow = {
  id: string;
  display_name: string | null;
  processed_filename?: string | null;
};

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

const checkinFormSchema = z.object({
  division: z.string().min(1),
  queue_type: QueueTypeSchema,
  partner_id: z.string().optional(),
  song_id: z.string().min(1, "Select a song"),
});

type CheckinFormValues = z.infer<typeof checkinFormSchema>;

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApiClient();
  const { isAdmin } = useAuthMe();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearSlot, setClearSlot] = useState<SlotRow | null>(null);
  const [withdrawOnClear, setWithdrawOnClear] = useState(false);

  const form = useForm<CheckinFormValues>({
    resolver: zodResolver(checkinFormSchema),
    defaultValues: {
      division: "Other",
      queue_type: "standard",
      partner_id: "",
      song_id: "",
    },
  });

  const loadSession = useCallback(() => {
    if (!id) return;
    return api.get<SessionDetail>(`/v1/sessions/${id}`).then(setSession);
  }, [api, id]);

  const loadQueue = useCallback(() => {
    if (!id) return;
    return api
      .get<CheckinRow[]>(`/v1/checkins?session_id=${encodeURIComponent(id)}`)
      .then(setCheckins);
  }, [api, id]);

  const loadSlots = useCallback(() => {
    if (!id) return;
    return api.get<SlotRow[]>(`/v1/slots?session_id=${encodeURIComponent(id)}`).then(setSlots);
  }, [api, id]);

  const loadExtras = useCallback(() => {
    return Promise.all([
      api.get<PartnerRow[]>("/v1/partners"),
      api.get<SongRow[]>("/v1/songs"),
    ]).then(([p, s]) => {
      setPartners(p);
      setSongs(s);
    });
  }, [api]);

  const refresh = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([loadSession(), loadQueue(), loadSlots(), loadExtras()])
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id, loadExtras, loadQueue, loadSession, loadSlots]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => {
      void Promise.all([loadQueue(), loadSlots(), loadSession()]).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, [id, loadQueue, loadSession, loadSlots]);

  const divisionsList = useMemo(() => {
    const fromSession = session?.divisions?.map((d) => d.division_name) ?? [];
    const withOther = fromSession.includes("Other") ? fromSession : [...fromSession, "Other"];
    return withOther.length > 0 ? withOther : ["Other"];
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const first = divisionsList[0] ?? "Other";
    form.setValue("division", first);
  }, [session?.id, divisionsList, form]);

  useEffect(() => {
    if (songs.length > 0 && !form.getValues("song_id")) {
      form.setValue("song_id", songs[0]!.id);
    }
  }, [songs, form]);

  const priorityWaiting = useMemo(
    () =>
      checkins
        .filter((c) => c.status === "waiting" && c.queue_type === "priority")
        .sort((a, b) => a.queue_position - b.queue_position),
    [checkins]
  );

  const standardWaiting = useMemo(
    () =>
      checkins
        .filter((c) => c.status === "waiting" && c.queue_type === "standard")
        .sort((a, b) => a.queue_position - b.queue_position),
    [checkins]
  );

  const canCheckIn =
    session &&
    (session.status === "checkin_open" || session.status === "in_progress") &&
    session.has_active_checkin !== true &&
    songs.length > 0;

  const submitCheckin = form.handleSubmit(async (values) => {
    if (!id) return;
    try {
      await api.post("/v1/checkins", {
        session_id: id,
        partner_id: values.partner_id?.trim() ? values.partner_id.trim() : null,
        division: values.division.trim(),
        queue_type: values.queue_type,
        song_id: values.song_id,
      });
      toast.success("Checked in");
      setCheckinOpen(false);
      await Promise.all([loadQueue(), loadSession(), loadSlots()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed");
    }
  });

  const withdraw = async () => {
    if (!id) return;
    try {
      await api.del(`/v1/checkins/mine?session_id=${encodeURIComponent(id)}`);
      toast.success("Withdrawn");
      await Promise.all([loadQueue(), loadSession(), loadSlots()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Withdraw failed");
    }
  };

  const swapQueuePositions = async (a: CheckinRow, b: CheckinRow) => {
    const subset = checkins
      .filter((c) => c.status === "waiting" && c.queue_type === a.queue_type)
      .map((c) => c.queue_position);
    const maxPos = subset.length > 0 ? Math.max(...subset) : 0;
    const temp = maxPos + 1;
    try {
      await api.patch(`/v1/checkins/${a.id}`, { queue_position: temp });
      await api.patch(`/v1/checkins/${b.id}`, { queue_position: a.queue_position });
      await api.patch(`/v1/checkins/${a.id}`, { queue_position: b.queue_position });
      toast.success("Order updated");
      await loadQueue();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
    }
  };

  const moveCheckin = async (row: CheckinRow, dir: -1 | 1) => {
    const list =
      row.queue_type === "priority"
        ? priorityWaiting
        : standardWaiting;
    const idx = list.findIndex((c) => c.id === row.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= list.length) return;
    await swapQueuePositions(row, list[j]!);
  };

  /** One call fills a single empty slot (next by slot number); repeat to fill more. */
  const fillNext = async () => {
    if (!id) return;
    try {
      await api.post("/v1/slots/fill", { session_id: id });
      toast.success("Next empty slot filled");
      await Promise.all([loadSlots(), loadQueue()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fill failed");
    }
  };

  const confirmClearSlot = async () => {
    if (!id || !clearSlot) return;
    try {
      await api.patch(
        `/v1/slots/${clearSlot.slot_number}/clear?session_id=${encodeURIComponent(id)}`,
        { withdraw_checkin: withdrawOnClear }
      );
      toast.success(withdrawOnClear ? "Cleared and withdrawn" : "Cleared and returned to queue");
      setClearOpen(false);
      setClearSlot(null);
      await Promise.all([loadSlots(), loadQueue()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Clear failed");
    }
  };

  const songLabel = (s: SongRow) => s.display_name ?? s.processed_filename ?? s.id;

  const renderQueueCard = (c: CheckinRow) => (
    <Card key={c.id}>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium leading-snug">{c.pair_display_name}</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          {c.division} · #{c.queue_position}
          {c.processed_filename && (
            <>
              <br />
              <span className="italic">{c.processed_filename}</span>
            </>
          )}
        </p>
        {isAdmin && (
          <div className="flex gap-2 mt-2">
            <Button type="button" size="sm" variant="outline" onClick={() => moveCheckin(c, -1)}>
              Up
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => moveCheckin(c, 1)}>
              Down
            </Button>
          </div>
        )}
      </CardHeader>
    </Card>
  );

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

  const backHref = session.event_id ? `/events/${session.event_id}` : "/events";

  return (
    <div className={cn("space-y-6", loading && "opacity-70")}>
      <div>
        <Button variant="ghost" size="sm" className="mb-2 px-0" asChild>
          <Link to={backHref}>← Back</Link>
        </Button>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-xl font-semibold flex flex-wrap items-center gap-3">
              {session.name}
              {sessionStatusBadge(session.status)}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Check-in opens {formatTime(session.checkin_opens_at)} · Floor{" "}
              {formatTime(session.floor_trial_starts_at)} – {formatTime(session.floor_trial_ends_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCheckIn && (
              <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
                <Button type="button" onClick={() => setCheckinOpen(true)}>
                  Check in
                </Button>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Check in</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={submitCheckin} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="division"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Division</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
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
                        name="queue_type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Queue</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {QueueTypeSchema.options.map((q) => (
                                  <SelectItem key={q} value={q}>
                                    {q}
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
                        name="partner_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Partner</FormLabel>
                            <Select
                              onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                              value={field.value && field.value !== "" ? field.value : "none"}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Solo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">Solo</SelectItem>
                                {partners.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.first_name} {p.last_name}
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
                        name="song_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Song</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
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
                      <DialogFooter>
                        <Button type="submit">Submit</Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            )}
            {session.has_active_checkin && (
              <Button variant="destructive" onClick={withdraw}>
                Withdraw
              </Button>
            )}
            {session.has_active_checkin && (
              <p className="text-sm text-muted-foreground self-center">
                Checked in ({session.active_checkin_division ?? "—"})
              </p>
            )}
          </div>
        </div>
      </div>

      {songs.length === 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Add a song under Songs before you can check in.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold mb-2">Priority queue</h2>
            <div className="space-y-2">
              {priorityWaiting.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one waiting.</p>
              ) : (
                priorityWaiting.map(renderQueueCard)
              )}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold mb-2">Standard queue</h2>
            <div className="space-y-2">
              {standardWaiting.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one waiting.</p>
              ) : (
                standardWaiting.map(renderQueueCard)
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h2 className="text-sm font-semibold">Floor slots</h2>
              {isAdmin && session.status === "in_progress" && (
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  Fill Next Slot assigns one waiting check-in to the lowest-numbered empty slot. Click again to
                  fill additional slots.
                </p>
              )}
            </div>
            {isAdmin && session.status === "in_progress" && (
              <Button size="sm" className="shrink-0" onClick={fillNext}>
                Fill Next Slot
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {slots.map((slot) => (
              <Card key={slot.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Slot {slot.slot_number}</div>
                  <p className="text-sm">{slot.pair_display_name ?? "Empty"}</p>
                  {isAdmin && slot.checkin_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setClearSlot(slot);
                        setWithdrawOnClear(false);
                        setClearOpen(true);
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear slot {clearSlot?.slot_number}</DialogTitle>
            <DialogDescription>
              Remove this pair from the slot. Choose whether to withdraw the check-in entirely or return it
              to the queue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              variant={!withdrawOnClear ? "default" : "outline"}
              onClick={() => setWithdrawOnClear(false)}
            >
              Return to queue
            </Button>
            <Button
              variant={withdrawOnClear ? "destructive" : "outline"}
              onClick={() => setWithdrawOnClear(true)}
            >
              Withdraw check-in
            </Button>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmClearSlot}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
