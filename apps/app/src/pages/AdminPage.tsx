import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// ─── Types ────────────────────────────────────────────────────────────────────

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

type DivisionRow = {
  division_name: string;
  is_priority: boolean;
  priority_run_limit: number;
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

type LeadingPair = {
  id: string;
  partner_b_id: string | null;
  display_name: string;
};

type SongRow = {
  id: string;
  display_name: string | null;
  processed_filename?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eventStatusBadge(status: string) {
  switch (status) {
    case "upcoming":
      return <Badge variant="default">{status}</Badge>;
    case "active":
      return (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
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
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
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

const FIELD_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const api = useApiClient();
  const navigate = useNavigate();

  // ── Events tab ──────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [evDialogOpen, setEvDialogOpen] = useState(false);
  const [evSubmitting, setEvSubmitting] = useState(false);
  const [evName, setEvName] = useState("");
  const [evDate, setEvDate] = useState("");

  // ── Sessions tab ────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessDialogOpen, setSessDialogOpen] = useState(false);
  const [sessSubmitting, setSessSubmitting] = useState(false);
  const [sessEventId, setSessEventId] = useState("");
  const [sessName, setSessName] = useState("");
  const [sessDate, setSessDate] = useState("");
  const [sessCheckinOpensAt, setSessCheckinOpensAt] = useState("");
  const [sessFloorStartsAt, setSessFloorStartsAt] = useState("");
  const [sessFloorEndsAt, setSessFloorEndsAt] = useState("");
  const [sessPriorityMax, setSessPriorityMax] = useState("6");
  const [sessNonPriorityMax, setSessNonPriorityMax] = useState("4");
  const [sessDivisions, setSessDivisions] = useState<DivisionRow[]>([
    { division_name: "Classic", is_priority: false, priority_run_limit: 0 },
  ]);

  // ── Live queue tab ──────────────────────────────────────────────────────────
  const [lqSessionId, setLqSessionId] = useState("");
  const [lqActive, setLqActive] = useState<QueueRow[]>([]);
  const [lqPriority, setLqPriority] = useState<QueueRow[]>([]);
  const [lqNonPriority, setLqNonPriority] = useState<QueueRow[]>([]);
  const [lqPairs, setLqPairs] = useState<LeadingPair[]>([]);
  const [lqSongs, setLqSongs] = useState<SongRow[]>([]);
  const [lqLoading, setLqLoading] = useState(false);
  const lqSessionRef = useRef(lqSessionId);
  lqSessionRef.current = lqSessionId;

  // ── Data loaders ────────────────────────────────────────────────────────────

  const loadEvents = useCallback(() => {
    setLoadingEvents(true);
    api
      .get<EventRow[]>("/v1/events")
      .then(setEvents)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoadingEvents(false));
  }, [api]);

  const loadSessions = useCallback(() => {
    setLoadingSessions(true);
    api
      .get<SessionRow[]>("/v1/sessions")
      .then(setSessions)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoadingSessions(false));
  }, [api]);

  const loadLiveQueues = useCallback(
    async (sessionId: string) => {
      if (!sessionId) return;
      setLqLoading(true);
      try {
        const [active, priority, nonPriority] = await Promise.all([
          api.get<QueueRow[]>(`/v1/queue/${sessionId}/active`),
          api.get<QueueRow[]>(`/v1/queue/${sessionId}/priority`),
          api.get<QueueRow[]>(`/v1/queue/${sessionId}/non-priority`),
        ]);
        setLqActive(active);
        setLqPriority(priority);
        setLqNonPriority(nonPriority);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load queues");
      } finally {
        setLqLoading(false);
      }
    },
    [api]
  );

  const loadLqExtras = useCallback(async () => {
    const [pairs, songs] = await Promise.all([
      api.get<LeadingPair[]>("/v1/partners/leading-pairs"),
      api.get<SongRow[]>("/v1/songs"),
    ]);
    setLqPairs(pairs);
    setLqSongs(songs);
  }, [api]);

  useEffect(() => {
    loadEvents();
    loadSessions();
    void loadLqExtras().catch(() => {});
  }, [loadEvents, loadSessions, loadLqExtras]);

  // Auto-refresh live queue every 8 s when a session is selected
  useEffect(() => {
    if (!lqSessionId) return;
    void loadLiveQueues(lqSessionId);
    const t = setInterval(() => {
      if (lqSessionRef.current) void loadLiveQueues(lqSessionRef.current).catch(() => {});
    }, 8_000);
    return () => clearInterval(t);
  }, [lqSessionId, loadLiveQueues]);

  // ── Derived maps ────────────────────────────────────────────────────────────

  const pairMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of lqPairs) m.set(p.id, p.display_name);
    return m;
  }, [lqPairs]);

  const songMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of lqSongs) {
      m.set(s.id, s.display_name ?? s.processed_filename ?? s.id);
    }
    return m;
  }, [lqSongs]);

  const renderEntityLabel = (row: QueueRow) => {
    if (row.entityPairId) return pairMap.get(row.entityPairId) ?? "Pair";
    if (row.entitySoloUserId) return "Solo dancer";
    return "Entity";
  };

  const renderSongLabel = (songId: string) => songMap.get(songId) ?? songId;

  // ── Event CRUD ──────────────────────────────────────────────────────────────

  const deleteEvent = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    try {
      await api.del(`/v1/events/${id}`);
      toast.success("Event deleted");
      setEvents((prev) => prev?.filter((e) => e.id !== id) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const openEvDialog = () => {
    setEvName("");
    setEvDate("");
    setEvDialogOpen(true);
  };

  const submitCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evName.trim()) { toast.error("Name is required"); return; }
    if (!evDate) { toast.error("Date is required"); return; }
    setEvSubmitting(true);
    try {
      const created = await api.post<EventRow>("/v1/events", {
        name: evName.trim(),
        date: evDate,
      });
      toast.success("Event created");
      setEvDialogOpen(false);
      setEvents((prev) => (prev ? [created, ...prev] : [created]));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setEvSubmitting(false);
    }
  };

  // ── Session CRUD ─────────────────────────────────────────────────────────────

  const resetSessForm = () => {
    setSessEventId(events?.[0]?.id ?? "");
    setSessName("");
    setSessDate("");
    setSessCheckinOpensAt("");
    setSessFloorStartsAt("");
    setSessFloorEndsAt("");
    setSessPriorityMax("6");
    setSessNonPriorityMax("4");
    setSessDivisions([{ division_name: "Classic", is_priority: false, priority_run_limit: 0 }]);
  };

  const openSessDialog = () => {
    resetSessForm();
    setSessDialogOpen(true);
  };

  const updateDivision = (index: number, patch: Partial<DivisionRow>) => {
    setSessDivisions((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const submitCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessEventId) { toast.error("Select an event"); return; }
    if (!sessName.trim()) { toast.error("Name is required"); return; }
    if (!sessCheckinOpensAt || !sessFloorStartsAt || !sessFloorEndsAt) {
      toast.error("All three datetime fields are required");
      return;
    }
    const priorityMaxNum = Number(sessPriorityMax);
    const nonPriorityMaxNum = Number(sessNonPriorityMax);
    if (Number.isNaN(priorityMaxNum) || priorityMaxNum < 0) {
      toast.error("Active cap (priority) must be a non-negative number");
      return;
    }
    if (Number.isNaN(nonPriorityMaxNum) || nonPriorityMaxNum < 0) {
      toast.error("Active cap (non-priority) must be a non-negative number");
      return;
    }
    if (nonPriorityMaxNum > priorityMaxNum) {
      toast.error("Non-priority cap must be ≤ priority cap");
      return;
    }
    const divisions = sessDivisions
      .filter((d) => d.division_name.trim() && d.division_name.trim() !== "Other")
      .map((d, i) => ({
        division_name: d.division_name.trim(),
        is_priority: d.is_priority,
        sort_order: i,
        priority_run_limit: Number.isFinite(d.priority_run_limit) ? d.priority_run_limit : 0,
      }));

    setSessSubmitting(true);
    try {
      await api.post<SessionRow>("/v1/sessions", {
        event_id: sessEventId,
        name: sessName.trim(),
        ...(sessDate.trim() ? { date: sessDate.trim() } : {}),
        checkin_opens_at: new Date(sessCheckinOpensAt).getTime(),
        floor_trial_starts_at: new Date(sessFloorStartsAt).getTime(),
        floor_trial_ends_at: new Date(sessFloorEndsAt).getTime(),
        active_priority_max: priorityMaxNum,
        active_non_priority_max: nonPriorityMaxNum,
        divisions,
      });
      toast.success("Session created");
      setSessDialogOpen(false);
      loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setSessSubmitting(false);
    }
  };

  // ── Queue actions ────────────────────────────────────────────────────────────

  const queueAction = async (path: string, body: Record<string, unknown>) => {
    try {
      await api.post(path, body);
      await loadLiveQueues(lqSessionRef.current);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const handleComplete = () =>
    queueAction("/v1/queue/complete", { sessionId: lqSessionId });

  const handleIncomplete = () =>
    queueAction("/v1/queue/incomplete", { sessionId: lqSessionId });

  const handleWithdraw = (queueEntryId: string) =>
    queueAction("/v1/queue/withdraw", { queueEntryId });

  const handlePromote = (queueEntryId: string) =>
    queueAction("/v1/queue/promote", { queueEntryId });

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">Admin</h1>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="queue">Live Queue</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        {/* ── Events tab ── */}
        <TabsContent value="events" className="mt-4 space-y-3">
          <Button onClick={openEvDialog} className="w-full sm:w-auto">
            New Event
          </Button>
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
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No events yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {events?.map((ev) => (
                    <TableRow
                      key={ev.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/events/${ev.id}`)}
                    >
                      <TableCell className="font-medium">{ev.name}</TableCell>
                      <TableCell>{ev.date ?? "—"}</TableCell>
                      <TableCell>{eventStatusBadge(ev.status)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteEvent(ev.id)}
                        >
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

        {/* ── Sessions tab ── */}
        <TabsContent value="sessions" className="mt-4 space-y-3">
          <Button onClick={openSessDialog} className="w-full sm:w-auto">
            New Session
          </Button>
          {loadingSessions && !sessions ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className={loadingSessions ? "opacity-60" : ""}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Check-in opens</TableHead>
                    <TableHead>Floor trial ends</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No sessions yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {sessions?.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/sessions/${s.id}`)}
                    >
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{sessionStatusBadge(s.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatTime(s.checkin_opens_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatTime(s.floor_trial_ends_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── Live Queue tab ── */}
        <TabsContent value="queue" className="mt-4 space-y-5">
          {/* Session selector */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="w-full sm:w-72">
              <select
                className={FIELD_INPUT_CLASS}
                value={lqSessionId}
                onChange={(e) => setLqSessionId(e.target.value)}
              >
                <option value="">Select a session…</option>
                {sessions?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {lqSessionId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadLiveQueues(lqSessionId)}
                disabled={lqLoading}
              >
                {lqLoading ? "Refreshing…" : "Refresh"}
              </Button>
            )}
          </div>

          {!lqSessionId && (
            <p className="text-sm text-muted-foreground">Choose a session above to manage its queue.</p>
          )}

          {lqSessionId && (
            <div className={`space-y-6 ${lqLoading ? "opacity-60" : ""}`}>

              {/* Active queue */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Active queue</h2>
                  <span className="text-xs text-muted-foreground">{lqActive.length} slot{lqActive.length !== 1 ? "s" : ""}</span>
                </div>
                {lqActive.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No one in the active queue.</p>
                ) : (
                  <div className="space-y-2">
                    {lqActive
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map((row) => {
                        const isSlotOne = row.position === 1;
                        return (
                          <div
                            key={row.queueEntryId}
                            className={`rounded-lg border px-3 py-3 text-sm space-y-2 ${isSlotOne ? "border-primary/40 bg-primary/5" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5 min-w-0">
                                <p className="font-medium">
                                  {isSlotOne && (
                                    <span className="text-primary mr-1.5">▶</span>
                                  )}
                                  #{row.position} · {renderEntityLabel(row)}
                                </p>
                                <p className="text-muted-foreground truncate">
                                  {row.divisionName} · {renderSongLabel(row.songId)}
                                </p>
                                {row.notes && (
                                  <p className="text-xs text-muted-foreground italic">
                                    Note: {row.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              {isSlotOne ? (
                                <>
                                  <Button size="sm" onClick={handleComplete}>
                                    Run complete
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={handleIncomplete}>
                                    Run incomplete
                                  </Button>
                                </>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleWithdraw(row.queueEntryId)}
                              >
                                Withdraw
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </section>

              {/* Priority queue */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Priority queue</h2>
                  <span className="text-xs text-muted-foreground">{lqPriority.length} waiting</span>
                </div>
                {lqPriority.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Priority queue is empty.</p>
                ) : (
                  <div className="space-y-2">
                    {lqPriority
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map((row) => (
                        <div
                          key={row.queueEntryId}
                          className="rounded-lg border px-3 py-3 text-sm space-y-2"
                        >
                          <div className="space-y-0.5">
                            <p className="font-medium">#{row.position} · {renderEntityLabel(row)}</p>
                            <p className="text-muted-foreground truncate">
                              {row.divisionName} · {renderSongLabel(row.songId)}
                            </p>
                            {row.notes && (
                              <p className="text-xs text-muted-foreground italic">Note: {row.notes}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handlePromote(row.queueEntryId)}>
                              Promote to active
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleWithdraw(row.queueEntryId)}
                            >
                              Withdraw
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </section>

              {/* Non-priority queue */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">Non-priority queue</h2>
                  <span className="text-xs text-muted-foreground">{lqNonPriority.length} waiting</span>
                </div>
                {lqNonPriority.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Non-priority queue is empty.</p>
                ) : (
                  <div className="space-y-2">
                    {lqNonPriority
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map((row) => (
                        <div
                          key={row.queueEntryId}
                          className="rounded-lg border px-3 py-3 text-sm space-y-2"
                        >
                          <div className="space-y-0.5">
                            <p className="font-medium">#{row.position} · {renderEntityLabel(row)}</p>
                            <p className="text-muted-foreground truncate">
                              {row.divisionName} · {renderSongLabel(row.songId)}
                            </p>
                            {row.notes && (
                              <p className="text-xs text-muted-foreground italic">Note: {row.notes}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handlePromote(row.queueEntryId)}>
                              Promote to active
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleWithdraw(row.queueEntryId)}
                            >
                              Withdraw
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </section>

            </div>
          )}
        </TabsContent>

        {/* ── Users tab ── */}
        <TabsContent value="users" className="mt-4">
          <p className="text-muted-foreground">User management coming soon</p>
        </TabsContent>
      </Tabs>

      {/* ── Create Event dialog ── */}
      {evDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setEvDialogOpen(false)}
        >
          <div
            className="rounded-t-2xl sm:rounded-lg border bg-background p-6 shadow-lg w-full sm:max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center -mt-2 mb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New event</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEvDialogOpen(false)}>✕</Button>
            </div>
            <form onSubmit={submitCreateEvent} className="space-y-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>Name</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  value={evName}
                  onChange={(e) => setEvName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Date</label>
                <input
                  type="date"
                  className={FIELD_INPUT_CLASS}
                  value={evDate}
                  onChange={(e) => setEvDate(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={evSubmitting} size="lg" className="w-full">
                {evSubmitting ? "Creating…" : "Create event"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ── Create Session dialog ── */}
      {sessDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setSessDialogOpen(false)}
        >
          <div
            className="rounded-t-2xl sm:rounded-lg border bg-background p-6 shadow-lg w-full sm:max-w-lg max-h-[92vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center -mt-2 mb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New session</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSessDialogOpen(false)}>✕</Button>
            </div>
            <form onSubmit={submitCreateSession} className="space-y-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>Event</label>
                <select
                  className={FIELD_INPUT_CLASS}
                  value={sessEventId}
                  onChange={(e) => setSessEventId(e.target.value)}
                >
                  <option value="">Select event…</option>
                  {events?.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Name</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  value={sessName}
                  onChange={(e) => setSessName(e.target.value)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Date (optional)</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  value={sessDate}
                  onChange={(e) => setSessDate(e.target.value)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Check-in opens</label>
                <input
                  type="datetime-local"
                  className={FIELD_INPUT_CLASS}
                  value={sessCheckinOpensAt}
                  onChange={(e) => setSessCheckinOpensAt(e.target.value)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Floor trial starts</label>
                <input
                  type="datetime-local"
                  className={FIELD_INPUT_CLASS}
                  value={sessFloorStartsAt}
                  onChange={(e) => setSessFloorStartsAt(e.target.value)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Floor trial ends</label>
                <input
                  type="datetime-local"
                  className={FIELD_INPUT_CLASS}
                  value={sessFloorEndsAt}
                  onChange={(e) => setSessFloorEndsAt(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={FIELD_LABEL_CLASS}>Active cap (priority)</label>
                  <input
                    type="number"
                    min={0}
                    className={FIELD_INPUT_CLASS}
                    value={sessPriorityMax}
                    onChange={(e) => setSessPriorityMax(e.target.value)}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL_CLASS}>Active cap (non-priority)</label>
                  <input
                    type="number"
                    min={0}
                    className={FIELD_INPUT_CLASS}
                    value={sessNonPriorityMax}
                    onChange={(e) => setSessNonPriorityMax(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={FIELD_LABEL_CLASS}>Divisions</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSessDivisions((prev) => [
                        ...prev,
                        { division_name: "", is_priority: false, priority_run_limit: 0 },
                      ])
                    }
                  >
                    Add division
                  </Button>
                </div>
                {sessDivisions.map((d, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center"
                  >
                    <input
                      placeholder="Division name"
                      className={`${FIELD_INPUT_CLASS} flex-1`}
                      value={d.division_name}
                      onChange={(e) => updateDivision(index, { division_name: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={d.is_priority}
                        onChange={(e) => updateDivision(index, { is_priority: e.target.checked })}
                      />
                      Priority
                    </label>
                    <div className="w-28 shrink-0">
                      <label className="text-xs block mb-1">Priority runs (1..X)</label>
                      <input
                        type="number"
                        min={0}
                        className={FIELD_INPUT_CLASS}
                        value={d.priority_run_limit}
                        onChange={(e) =>
                          updateDivision(index, {
                            priority_run_limit: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSessDivisions((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="submit" disabled={sessSubmitting} size="lg" className="w-full">
                {sessSubmitting ? "Creating…" : "Create session"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
