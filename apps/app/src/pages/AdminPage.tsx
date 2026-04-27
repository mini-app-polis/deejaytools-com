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
import { formatSessionTitle, formatTimeOnly } from "@/lib/sessionFormat";
import { compareEventChrono, compareSessionChrono } from "@/lib/chronoSort";

// ─── Constants ────────────────────────────────────────────────────────────────

const DIVISION_OPTIONS = [
  "Classic",
  "Showcase",
  "Rising Star Classic",
  "Rising Star Showcase",
  "Sophisticated",
  "Masters",
  "Teams",
  "ProAm LeaderAm",
  "ProAm FollowerAm",
  "NovInt Routines",
  "Juniors",
  "Young Adult",
  "Exhibition",
  "Superstar",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type EventRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string; // computed server-side
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

type TestInjection = {
  pair_id: string;
  created_at: number;
  leader_name: string;
  follower_name: string | null;
  session_id: string | null;
  session_name: string | null;
  division_name: string | null;
  queue_status: "active" | "priority" | "non_priority" | "off_queue";
  position: number | null;
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

function randomFourDigitTag(): string {
  return Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
}

function randomDivision(): string {
  return DIVISION_OPTIONS[Math.floor(Math.random() * DIVISION_OPTIONS.length)];
}

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
  const [evStartDate, setEvStartDate] = useState("");
  const [evEndDate, setEvEndDate] = useState("");

  // ── Sessions tab ────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessDialogOpen, setSessDialogOpen] = useState(false);
  const [sessSubmitting, setSessSubmitting] = useState(false);
  const [sessEventId, setSessEventId] = useState("");
  const [sessDate, setSessDate] = useState("");
  const [sessCheckinOpensTime, setSessCheckinOpensTime] = useState("");
  const [sessFloorStartsTime, setSessFloorStartsTime] = useState("");
  const [sessFloorEndsTime, setSessFloorEndsTime] = useState("");
  const [sessPriorityMax, setSessPriorityMax] = useState("6");
  const [sessNonPriorityMax, setSessNonPriorityMax] = useState("4");
  const [sessPriorityRunLimit, setSessPriorityRunLimit] = useState("1");
  // Per-division priority flags — all divisions always present, admin picks which are priority
  const [sessDivisionPriority, setSessDivisionPriority] = useState<Record<string, boolean>>(
    Object.fromEntries(DIVISION_OPTIONS.map((d) => [d, false]))
  );

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

  // ── Test injection tab ──────────────────────────────────────────────────────
  // Defaults are randomized on mount and after every successful injection.
  // Users can override any field before submitting.
  const [tiSessionId, setTiSessionId] = useState("");
  const [tiDivision, setTiDivision] = useState<string>(() => randomDivision());
  const [tiLeaderFirst, setTiLeaderFirst] = useState("Leader");
  const [tiLeaderLast, setTiLeaderLast] = useState(() => randomFourDigitTag());
  const [tiFollowerFirst, setTiFollowerFirst] = useState("Follower");
  const [tiFollowerLast, setTiFollowerLast] = useState(() => randomFourDigitTag());
  const [tiSubmitting, setTiSubmitting] = useState(false);
  const [tiData, setTiData] = useState<TestInjection[] | null>(null);
  const [tiDeleting, setTiDeleting] = useState(false);

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

  const loadTestInjections = useCallback(async () => {
    try {
      const data = await api.get<TestInjection[]>("/v1/admin/checkins/test");
      setTiData(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load test data");
    }
  }, [api]);

  useEffect(() => {
    loadEvents();
    loadSessions();
    void loadLqExtras().catch(() => {});
    void loadTestInjections().catch(() => {});
  }, [loadEvents, loadSessions, loadLqExtras, loadTestInjections]);

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
    setEvStartDate("");
    setEvEndDate("");
    setEvDialogOpen(true);
  };

  const submitCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evName.trim()) { toast.error("Name is required"); return; }
    if (!evStartDate) { toast.error("Start date is required"); return; }
    if (!evEndDate) { toast.error("End date is required"); return; }
    if (evEndDate < evStartDate) { toast.error("End date must be on or after start date"); return; }
    setEvSubmitting(true);
    try {
      const created = await api.post<EventRow>("/v1/events", {
        name: evName.trim(),
        start_date: evStartDate,
        end_date: evEndDate,
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
    setSessDate("");
    setSessCheckinOpensTime("");
    setSessFloorStartsTime("");
    setSessFloorEndsTime("");
    setSessPriorityMax("6");
    setSessNonPriorityMax("4");
    setSessPriorityRunLimit("1");
    setSessDivisionPriority(Object.fromEntries(DIVISION_OPTIONS.map((d) => [d, false])));
  };

  const openSessDialog = () => {
    resetSessForm();
    setSessDialogOpen(true);
  };

  const toggleDivisionPriority = (name: string) => {
    setSessDivisionPriority((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const submitCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessEventId) { toast.error("Select an event"); return; }
    if (!sessDate) { toast.error("Date is required"); return; }
    if (!sessCheckinOpensTime || !sessFloorStartsTime || !sessFloorEndsTime) {
      toast.error("All three time fields are required");
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

    // Build timestamps by combining the selected date with each time
    const toTs = (time: string) => new Date(`${sessDate}T${time}`).getTime();
    const checkinOpensAt = toTs(sessCheckinOpensTime);
    const floorStartsAt = toTs(sessFloorStartsTime);
    const floorEndsAt = toTs(sessFloorEndsTime);

    if (floorStartsAt >= floorEndsAt) {
      toast.error("Floor trial end must be after floor trial start");
      return;
    }
    if (checkinOpensAt >= floorStartsAt) {
      toast.error("Check-in must open before floor trial starts");
      return;
    }

    const priorityRunLimitNum = Number(sessPriorityRunLimit);
    if (Number.isNaN(priorityRunLimitNum) || priorityRunLimitNum < 0) {
      toast.error("Priority run limit must be a non-negative number");
      return;
    }

    // Auto-generate session name from date
    const sessionName = new Date(`${sessDate}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // All divisions always included; per-division priority flag; shared run limit
    const divisions = DIVISION_OPTIONS.map((d, i) => ({
      division_name: d,
      is_priority: sessDivisionPriority[d] ?? false,
      sort_order: i,
      priority_run_limit: (sessDivisionPriority[d] ?? false) ? priorityRunLimitNum : 0,
    }));

    setSessSubmitting(true);
    try {
      await api.post<SessionRow>("/v1/sessions", {
        event_id: sessEventId,
        name: sessionName,
        date: sessDate,
        checkin_opens_at: checkinOpensAt,
        floor_trial_starts_at: floorStartsAt,
        floor_trial_ends_at: floorEndsAt,
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

  // ── Test injection ──────────────────────────────────────────────────────────

  const submitTestInjection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tiSessionId) { toast.error("Select a session"); return; }
    if (!tiDivision) { toast.error("Select a division"); return; }
    if (!tiLeaderFirst.trim() || !tiLeaderLast.trim()) {
      toast.error("Leader first and last name are required");
      return;
    }
    if (!tiFollowerFirst.trim() || !tiFollowerLast.trim()) {
      toast.error("Follower first and last name are required");
      return;
    }

    setTiSubmitting(true);
    try {
      const result = await api.post<{
        id: string;
        sessionId: string;
        divisionName: string;
        initialQueue: "priority" | "non_priority";
        pair: { id: string; partner_b_id: string | null; display_name: string };
      }>("/v1/admin/checkins", {
        sessionId: tiSessionId,
        divisionName: tiDivision,
        leaderFirstName: tiLeaderFirst.trim(),
        leaderLastName: tiLeaderLast.trim(),
        followerFirstName: tiFollowerFirst.trim(),
        followerLastName: tiFollowerLast.trim(),
      });

      // Append the synthetic pair to the local map so the queue tab renders
      // the leader/follower name correctly when the same session is viewed.
      setLqPairs((prev) => [...prev, result.pair]);

      toast.success(
        `Injected into ${result.initialQueue === "priority" ? "priority" : "non-priority"} queue`
      );

      // If the user is currently viewing this session's live queue, refresh it.
      if (lqSessionRef.current === tiSessionId) {
        void loadLiveQueues(tiSessionId).catch(() => {});
      }

      // Regenerate randomized defaults so the next injection gets fresh names + division.
      // Session stays selected for repeat injects against the same session.
      setTiLeaderFirst("Leader");
      setTiLeaderLast(randomFourDigitTag());
      setTiFollowerFirst("Follower");
      setTiFollowerLast(randomFourDigitTag());
      setTiDivision(randomDivision());

      void loadTestInjections().catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Injection failed");
    } finally {
      setTiSubmitting(false);
    }
  };

  const deleteAllTestData = async () => {
    if (!tiData || tiData.length === 0) return;
    if (
      !confirm(
        `Delete all ${tiData.length} test injection${tiData.length === 1 ? "" : "s"}? This will remove the synthetic users, partners, pairs, check-ins, and queue entries created by test injection. This cannot be undone.`
      )
    ) {
      return;
    }
    setTiDeleting(true);
    const expectedCount = tiData.length;
    try {
      await api.del("/v1/admin/checkins/test");
      toast.success(`Deleted ${expectedCount} test injection${expectedCount === 1 ? "" : "s"}`);
      setTiData([]);
      // Refresh queue display if a session is currently being viewed.
      if (lqSessionRef.current) {
        void loadLiveQueues(lqSessionRef.current).catch(() => {});
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setTiDeleting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">Admin</h1>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="queue">Live Queue</TabsTrigger>
          <TabsTrigger value="inject">Test Inject</TabsTrigger>
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
                    <TableHead>Dates</TableHead>
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
                  {events
                    ?.slice()
                    .sort(compareEventChrono)
                    .map((ev) => (
                    <TableRow
                      key={ev.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/events/${ev.id}`)}
                    >
                      <TableCell className="font-medium">{ev.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {ev.start_date === ev.end_date
                          ? ev.start_date
                          : `${ev.start_date} – ${ev.end_date}`}
                      </TableCell>
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
                    <TableHead>Session</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Open</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        No sessions yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {sessions
                    ?.slice()
                    .sort(compareSessionChrono)
                    .map((s) => {
                    const eventName =
                      events?.find((ev) => ev.id === s.event_id)?.name ?? "—";
                    return (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/sessions/${s.id}`)}
                      >
                        <TableCell className="font-medium">{formatSessionTitle(s)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {eventName}
                        </TableCell>
                        <TableCell>{sessionStatusBadge(s.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatTimeOnly(s.checkin_opens_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatTimeOnly(s.floor_trial_starts_at)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatTimeOnly(s.floor_trial_ends_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
                {sessions
                  ?.slice()
                  .sort(compareSessionChrono)
                  .map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatSessionTitle(s)}
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

        {/* ── Test Inject tab ── */}
        <TabsContent value="inject" className="mt-4 space-y-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Testing-only bypass. Creates throwaway user/partner/pair rows and uses a placeholder song.
            Skips the check-in time window. Each submission adds one entry to the selected session's queue.
          </div>
          <form onSubmit={submitTestInjection} className="space-y-4 max-w-lg">
            <div>
              <label className={FIELD_LABEL_CLASS}>Session</label>
              <select
                className={FIELD_INPUT_CLASS}
                value={tiSessionId}
                onChange={(e) => setTiSessionId(e.target.value)}
              >
                <option value="">Select a session…</option>
                {sessions
                  ?.slice()
                  .sort(compareSessionChrono)
                  .map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatSessionTitle(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS}>Division</label>
              <select
                className={FIELD_INPUT_CLASS}
                value={tiDivision}
                onChange={(e) => setTiDivision(e.target.value)}
              >
                {DIVISION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL_CLASS}>Leader first name</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  value={tiLeaderFirst}
                  onChange={(e) => setTiLeaderFirst(e.target.value)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Leader last name</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  value={tiLeaderLast}
                  onChange={(e) => setTiLeaderLast(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL_CLASS}>Follower first name</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  value={tiFollowerFirst}
                  onChange={(e) => setTiFollowerFirst(e.target.value)}
                />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Follower last name</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  value={tiFollowerLast}
                  onChange={(e) => setTiFollowerLast(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={tiSubmitting} size="lg" className="w-full sm:w-auto">
              {tiSubmitting ? "Injecting…" : "Inject check-in"}
            </Button>
          </form>

          {/* Existing test data */}
          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-base font-semibold">
                Existing test data
                {tiData !== null && (
                  <span className="ml-2 text-sm text-muted-foreground font-normal">
                    ({tiData.length})
                  </span>
                )}
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadTestInjections()}
                  disabled={tiDeleting}
                >
                  Refresh
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void deleteAllTestData()}
                  disabled={tiDeleting || !tiData || tiData.length === 0}
                >
                  {tiDeleting ? "Deleting…" : "Delete all test data"}
                </Button>
              </div>
            </div>

            {tiData === null ? (
              <Skeleton className="h-24 w-full" />
            ) : tiData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No test data in the system.</p>
            ) : (
              <div className="space-y-2">
                {tiData.map((row) => {
                  const queueLabel =
                    row.queue_status === "active"
                      ? `Active #${row.position ?? "?"}`
                      : row.queue_status === "priority"
                      ? `Priority #${row.position ?? "?"}`
                      : row.queue_status === "non_priority"
                      ? `Non-priority #${row.position ?? "?"}`
                      : "Off queue";
                  const sessionRow = sessions?.find((s) => s.id === row.session_id);
                  const sessionLabel = sessionRow ? formatSessionTitle(sessionRow) : "No session";
                  return (
                    <div
                      key={row.pair_id}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-medium">
                            {row.leader_name}
                            {row.follower_name ? ` & ${row.follower_name}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {sessionLabel}
                            {row.division_name ? ` · ${row.division_name}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Injected {formatTime(row.created_at)}
                          </p>
                        </div>
                        <Badge
                          variant={row.queue_status === "off_queue" ? "outline" : "default"}
                          className="shrink-0"
                        >
                          {queueLabel}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={FIELD_LABEL_CLASS}>Start date</label>
                  <input
                    type="date"
                    className={FIELD_INPUT_CLASS}
                    value={evStartDate}
                    onChange={(e) => {
                      setEvStartDate(e.target.value);
                      if (evEndDate && e.target.value > evEndDate) setEvEndDate(e.target.value);
                    }}
                    required
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL_CLASS}>End date</label>
                  <input
                    type="date"
                    className={FIELD_INPUT_CLASS}
                    value={evEndDate}
                    min={evStartDate || undefined}
                    onChange={(e) => setEvEndDate(e.target.value)}
                    required
                  />
                </div>
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
                <label className={FIELD_LABEL_CLASS}>Date</label>
                <input
                  type="date"
                  className={FIELD_INPUT_CLASS}
                  value={sessDate}
                  onChange={(e) => setSessDate(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={FIELD_LABEL_CLASS}>Check-in opens</label>
                  <input
                    type="time"
                    className={FIELD_INPUT_CLASS}
                    value={sessCheckinOpensTime}
                    onChange={(e) => setSessCheckinOpensTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL_CLASS}>Floor starts</label>
                  <input
                    type="time"
                    className={FIELD_INPUT_CLASS}
                    value={sessFloorStartsTime}
                    onChange={(e) => setSessFloorStartsTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL_CLASS}>Floor ends</label>
                  <input
                    type="time"
                    className={FIELD_INPUT_CLASS}
                    value={sessFloorEndsTime}
                    onChange={(e) => setSessFloorEndsTime(e.target.value)}
                  />
                </div>
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
              <div>
                <label className={FIELD_LABEL_CLASS}>Priority run limit</label>
                <input
                  type="number"
                  min={0}
                  className={FIELD_INPUT_CLASS}
                  value={sessPriorityRunLimit}
                  onChange={(e) => setSessPriorityRunLimit(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Number of runs that count as priority for each priority division.
                </p>
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Divisions</label>
                <div className="space-y-1 mt-1">
                  {DIVISION_OPTIONS.map((d) => (
                    <label key={d} className="flex items-center gap-3 text-sm cursor-pointer py-0.5">
                      <input
                        type="checkbox"
                        checked={sessDivisionPriority[d] ?? false}
                        onChange={() => toggleDivisionPriority(d)}
                      />
                      <span>{d}</span>
                      {sessDivisionPriority[d] && (
                        <span className="text-xs text-primary font-medium">priority</span>
                      )}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  All divisions are always included. Check the ones that grant priority status.
                </p>
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
