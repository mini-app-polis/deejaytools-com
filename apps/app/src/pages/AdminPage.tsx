import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type {
  ApiEvent,
  ApiSession,
  ApiQueueEntry,
  ApiLeadingPair,
  ApiSong,
  ApiTestInjection,
  ApiRun,
  ApiAdminUser,
} from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import { useAuthMe } from "@/hooks/useAuthMe";
import { CLICKABLE_ROW_CLASS } from "@/lib/clickable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr } from "@/lib/sessionFormat";
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a "YYYY-MM-DD" date + "HH:MM" time string to a Unix epoch (ms),
 * interpreting the wall-clock time as local time in the given IANA timezone.
 *
 * e.g. ("2026-04-27", "19:30", "America/Chicago") → epoch for 7:30 PM CDT.
 * Falls back to browser local time if the timezone is empty or invalid.
 */
function toEpochInTz(dateStr: string, timeStr: string, tz: string): number {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hours, minutes] = timeStr.split(":").map(Number);
    // Create a UTC epoch for the date+time as if it were UTC, then adjust.
    const utcGuess = Date.UTC(year!, month! - 1, day!, hours!, minutes!, 0);
    // Find what local time that UTC epoch corresponds to in `tz`.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(utcGuess));
    const tzHour = parseInt(parts.find((p) => p.type === "hour")!.value);
    const tzMin  = parseInt(parts.find((p) => p.type === "minute")!.value);
    // Difference between desired local time and what UTC gave us in `tz`.
    const diffMs = ((hours! * 60 + minutes!) - (tzHour * 60 + tzMin)) * 60_000;
    return utcGuess + diffMs;
  } catch {
    // Fallback: treat as browser local time.
    return new Date(`${dateStr}T${timeStr}:00`).getTime();
  }
}

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
  // Used to identify the current admin so the Users tab can hide the role
  // toggle on their own row (the API also rejects self-demotion).
  const { me } = useAuthMe();

  // ── Events tab ──────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<ApiEvent[] | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [evDialogOpen, setEvDialogOpen] = useState(false);
  const [evSubmitting, setEvSubmitting] = useState(false);
  const [evName, setEvName] = useState("");
  const [evStartDate, setEvStartDate] = useState("");
  const [evEndDate, setEvEndDate] = useState("");
  const [evTimezone, setEvTimezone] = useState("America/Chicago");

  // ── Sessions tab ────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ApiSession[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessDialogOpen, setSessDialogOpen] = useState(false);
  const [sessSubmitting, setSessSubmitting] = useState(false);
  const [sessEventId, setSessEventId] = useState("");
  const [sessDate, setSessDate] = useState("");
  const [sessStartTime, setSessStartTime] = useState("07:00");
  /** Minutes before start that check-in opens. 0 = same moment as start. */
  const [sessCheckinOffsetMins, setSessCheckinOffsetMins] = useState("30");
  /** Floor trial duration in minutes. */
  const [sessDurationMins, setSessDurationMins] = useState("120");
  const [sessPriorityMax, setSessPriorityMax] = useState("6");
  const [sessNonPriorityMax, setSessNonPriorityMax] = useState("4");
  const [sessPriorityRunLimit, setSessPriorityRunLimit] = useState("1");
  // Per-division priority flags — all divisions always present, admin picks which are priority
  const [sessDivisionPriority, setSessDivisionPriority] = useState<Record<string, boolean>>(
    Object.fromEntries(DIVISION_OPTIONS.map((d) => [d, false]))
  );

  // ── Live queue tab ──────────────────────────────────────────────────────────
  const [lqSessionId, setLqSessionId] = useState("");
  const [lqActive, setLqActive] = useState<ApiQueueEntry[]>([]);
  const [lqPriority, setLqPriority] = useState<ApiQueueEntry[]>([]);
  const [lqNonPriority, setLqNonPriority] = useState<ApiQueueEntry[]>([]);
  const [lqPairs, setLqPairs] = useState<ApiLeadingPair[]>([]);
  const [lqSongs, setLqSongs] = useState<ApiSong[]>([]);
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
  const [tiData, setTiData] = useState<ApiTestInjection[] | null>(null);
  const [tiDeleting, setTiDeleting] = useState(false);

  // ── Run history tab ─────────────────────────────────────────────────────────
  const [runsSessionFilter, setRunsSessionFilter] = useState("");
  const [runs, setRuns] = useState<ApiRun[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);

  // ── Users tab ───────────────────────────────────────────────────────────────
  // `usersQuery` updates on every keystroke; `usersDebouncedQuery` is what
  // actually fires the network request. 300 ms feels responsive without
  // hammering the API on every character.
  const [users, setUsers] = useState<ApiAdminUser[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersQuery, setUsersQuery] = useState("");
  const [usersDebouncedQuery, setUsersDebouncedQuery] = useState("");
  /** Per-row loading state while a role PATCH is in flight. */
  const [userRoleSubmitting, setUserRoleSubmitting] = useState<Record<string, boolean>>({});

  // ── Data loaders ────────────────────────────────────────────────────────────

  const loadEvents = useCallback(() => {
    setLoadingEvents(true);
    api
      .get<ApiEvent[]>("/v1/events")
      .then(setEvents)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoadingEvents(false));
  }, [api]);

  const loadSessions = useCallback(() => {
    setLoadingSessions(true);
    api
      .get<ApiSession[]>("/v1/sessions")
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
          api.get<ApiQueueEntry[]>(`/v1/queue/${sessionId}/active`),
          api.get<ApiQueueEntry[]>(`/v1/queue/${sessionId}/priority`),
          api.get<ApiQueueEntry[]>(`/v1/queue/${sessionId}/non-priority`),
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
      api.get<ApiLeadingPair[]>("/v1/partners/leading-pairs"),
      api.get<ApiSong[]>("/v1/songs"),
    ]);
    setLqPairs(pairs);
    setLqSongs(songs);
  }, [api]);

  const loadApiTestInjections = useCallback(async () => {
    try {
      const data = await api.get<ApiTestInjection[]>("/v1/admin/checkins/test");
      setTiData(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load test data");
    }
  }, [api]);

  const loadRuns = useCallback(
    async (sessionId: string) => {
      setRunsLoading(true);
      try {
        const path = sessionId
          ? `/v1/runs?session_id=${encodeURIComponent(sessionId)}`
          : "/v1/runs";
        const data = await api.get<ApiRun[]>(path);
        setRuns(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load run history");
      } finally {
        setRunsLoading(false);
      }
    },
    [api]
  );

  const loadUsers = useCallback(
    async (q: string) => {
      setUsersLoading(true);
      try {
        const path = q
          ? `/v1/admin/users?q=${encodeURIComponent(q)}`
          : "/v1/admin/users";
        const data = await api.get<ApiAdminUser[]>(path);
        setUsers(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        setUsersLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    loadEvents();
    loadSessions();
    void loadLqExtras().catch(() => {});
    void loadApiTestInjections().catch(() => {});
    void loadUsers("").catch(() => {});
  }, [loadEvents, loadSessions, loadLqExtras, loadApiTestInjections, loadUsers]);

  // Refetch run history whenever the session filter changes.
  useEffect(() => {
    void loadRuns(runsSessionFilter).catch(() => {});
  }, [runsSessionFilter, loadRuns]);

  // Debounce keystrokes in the Users tab search box → only the trailing value
  // wins, so typing "alic" hits the API once with q=alic instead of four
  // requests for q, qa, qal, qali.
  useEffect(() => {
    const t = setTimeout(() => setUsersDebouncedQuery(usersQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [usersQuery]);

  // Refetch users whenever the debounced query changes (including initial empty).
  useEffect(() => {
    void loadUsers(usersDebouncedQuery).catch(() => {});
  }, [usersDebouncedQuery, loadUsers]);

  // Auto-select the single active session when sessions load / change.
  // "Active" means checkin_open or in_progress; completed/cancelled sessions
  // are accessible via the dropdown but not auto-selected.
  useEffect(() => {
    if (!sessions) return;
    const active = sessions.filter(
      (s) => s.status === "checkin_open" || s.status === "in_progress"
    );
    if (active.length === 1 && !lqSessionId) {
      setLqSessionId(active[0]!.id);
    }
  }, [sessions]); // intentionally omit lqSessionId — only auto-select on initial session load

  // Load queue when a session is selected; subsequent refreshes happen after
  // each action or via the manual Refresh button.
  useEffect(() => {
    if (!lqSessionId) return;
    void loadLiveQueues(lqSessionId);
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

  const songFilenameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of lqSongs) {
      if (s.processed_filename) m.set(s.id, s.processed_filename);
    }
    return m;
  }, [lqSongs]);

  const renderEntityLabel = (row: ApiQueueEntry) => {
    // Prefer server-provided partnership label; fall back to local pair map
    // (only useful for the current admin's own pairs / freshly-injected test
    // pairs that we appended client-side).
    if (row.entityLabel && row.entityLabel !== "—") return row.entityLabel;
    if (row.entityPairId) return pairMap.get(row.entityPairId) ?? row.entityLabel;
    return row.entityLabel;
  };

  const renderSongLabel = (songId: string | null | undefined) =>
    songId ? (songMap.get(songId) ?? songId) : "—";

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
      const created = await api.post<ApiEvent>("/v1/events", {
        name: evName.trim(),
        start_date: evStartDate,
        end_date: evEndDate,
        timezone: evTimezone,
      });
      toast.success("Event created");
      setEvDialogOpen(false);
      setEvName("");
      setEvStartDate("");
      setEvEndDate("");
      setEvTimezone("America/Chicago");
      setEvents((prev) => (prev ? [created, ...prev] : [created]));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setEvSubmitting(false);
    }
  };

  // ── Session CRUD ─────────────────────────────────────────────────────────────

  const resetSessForm = () => {
    const defaultEvent = events?.[0];
    setSessEventId(defaultEvent?.id ?? "");
    setSessDate(defaultEvent?.start_date ?? "");
    setSessStartTime("07:00");
    setSessCheckinOffsetMins("30");
    setSessDurationMins("120");
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
    if (!sessStartTime) { toast.error("Start time is required"); return; }

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

    // Interpret the start time in the event's timezone so times are always
    // correct regardless of where the admin's browser is located.
    const eventTz =
      events?.find((ev) => ev.id === sessEventId)?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    const floorStartsAt  = toEpochInTz(sessDate, sessStartTime, eventTz);
    const checkinOpensAt = floorStartsAt - Number(sessCheckinOffsetMins) * 60_000;
    const floorEndsAt    = floorStartsAt + Number(sessDurationMins) * 60_000;

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
      await api.post<ApiSession>("/v1/sessions", {
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

  const handleComplete = (queueEntryId: string) =>
    queueAction("/v1/queue/complete", { queueEntryId });

  const handleIncomplete = (queueEntryId: string) =>
    queueAction("/v1/queue/incomplete", { queueEntryId });

  const handleMoveDown = (queueEntryId: string) =>
    queueAction("/v1/queue/move-down", { queueEntryId });

  const handleWithdraw = (queueEntryId: string) =>
    queueAction("/v1/queue/withdraw", { queueEntryId });

  const handlePromote = (queueEntryId: string) =>
    queueAction("/v1/queue/promote", { queueEntryId });

  // Promotes the next entry from whichever waiting queue should go next:
  // priority first (if it has entries), then non-priority.
  const handlePromoteNext = () => {
    const prioritySorted = [...lqPriority].sort((a, b) => a.position - b.position);
    const nonPrioritySorted = [...lqNonPriority].sort((a, b) => a.position - b.position);
    const next = prioritySorted[0] ?? nonPrioritySorted[0];
    if (!next) return;
    return handlePromote(next.queueEntryId);
  };

  const canPromoteNext = lqPriority.length > 0 || lqNonPriority.length > 0;

  // ── Test injection ──────────────────────────────────────────────────────────

  const submitApiTestInjection = async (e: React.FormEvent) => {
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

      void loadApiTestInjections().catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Injection failed");
    } finally {
      setTiSubmitting(false);
    }
  };

  // ── User role management ────────────────────────────────────────────────────

  /**
   * Patch a user's role server-side, then merge the response into local state
   * so the UI reflects the change without a full refetch. The server is the
   * source of truth — we mirror its response rather than predicting it. The
   * self-demote case is also blocked server-side; the UI just hides the
   * toggle for the current admin's own row to make it obvious.
   */
  const setUserRole = async (userId: string, nextRole: "user" | "admin") => {
    setUserRoleSubmitting((prev) => ({ ...prev, [userId]: true }));
    try {
      const updated = await api.patch<ApiAdminUser>(
        `/v1/admin/users/${userId}/role`,
        { role: nextRole }
      );
      setUsers((prev) =>
        prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null
      );
      toast.success(
        nextRole === "admin"
          ? `${updated.email} is now an admin`
          : `${updated.email} is now a regular user`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setUserRoleSubmitting((prev) => {
        const { [userId]: _, ...rest } = prev;
        return rest;
      });
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
          <TabsTrigger value="runs">Run History</TabsTrigger>
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
                    <TableHead>Start date</TableHead>
                    <TableHead>End date</TableHead>
                    <TableHead>Timezone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
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
                      className={CLICKABLE_ROW_CLASS}
                      onClick={() => navigate(`/events/${ev.id}`)}
                    >
                      <TableCell className="font-medium">{ev.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {ev.start_date}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {ev.end_date}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        <Badge variant="outline" className="text-xs font-normal">
                          {formatTimezoneAbbr(ev.timezone)}
                        </Badge>
                        <span className="ml-1.5 text-xs">{ev.timezone}</span>
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
                    <TableHead>TZ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Open</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
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
                        className={CLICKABLE_ROW_CLASS}
                        onClick={() => navigate(`/sessions/${s.id}`)}
                      >
                        <TableCell className="font-medium">{formatSessionTitle(s, s.event_timezone)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {eventName}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {s.event_timezone && (
                            <Badge variant="outline" className="text-xs font-normal">
                              {formatTimezoneAbbr(s.event_timezone, s.floor_trial_starts_at)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{sessionStatusBadge(s.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatTimeOnly(s.checkin_opens_at, s.event_timezone)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatTimeOnly(s.floor_trial_starts_at, s.event_timezone)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatTimeOnly(s.floor_trial_ends_at, s.event_timezone)}
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
              {(() => {
                if (!sessions) return null;
                // Show all of today's sessions so admins can manage queues
                // even after a session ends. Active sessions appear first.
                const now = new Date();
                const todaySessions = sessions
                  .filter((s) => {
                    const d = new Date(s.floor_trial_starts_at);
                    return (
                      d.getFullYear() === now.getFullYear() &&
                      d.getMonth() === now.getMonth() &&
                      d.getDate() === now.getDate()
                    );
                  })
                  .sort((a, b) => {
                    const isLive = (s: typeof a) =>
                      s.status === "checkin_open" || s.status === "in_progress";
                    if (isLive(a) && !isLive(b)) return -1;
                    if (!isLive(a) && isLive(b)) return 1;
                    return a.floor_trial_starts_at - b.floor_trial_starts_at;
                  });
                if (todaySessions.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground">No sessions today.</p>
                  );
                }
                return (
                  <select
                    className={FIELD_INPUT_CLASS}
                    value={lqSessionId}
                    onChange={(e) => setLqSessionId(e.target.value)}
                  >
                    <option value="">Select a session…</option>
                    {todaySessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatSessionTitle(s, s.event_timezone)}
                        {s.status === "completed" || s.status === "cancelled"
                          ? ` (${s.status})`
                          : ""}
                      </option>
                    ))}
                  </select>
                );
              })()}
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
            <div className={`space-y-4 ${lqLoading ? "opacity-60" : ""}`}>

              {/* Active queue */}
              <Card className="border-primary/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-primary">Active</CardTitle>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {lqActive.length} slot{lqActive.length !== 1 ? "s" : ""}
                      </span>
                      <Button
                        size="sm"
                        onClick={handlePromoteNext}
                        disabled={!canPromoteNext || lqLoading}
                      >
                        Promote next
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {lqActive.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No one on deck.</p>
                  ) : (
                    lqActive
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map((row) => {
                        const isSlotOne = row.position === 1;
                        const isLast = row.position === lqActive.length;
                        const filename = row.songId ? songFilenameMap.get(row.songId) : undefined;
                        return (
                          <div key={row.queueEntryId} className="flex items-start gap-3">
                            <span className="text-sm font-medium tabular-nums shrink-0 pt-2 w-12 text-right">
                              {isSlotOne && <span className="text-primary mr-0.5">▶</span>}
                              #{row.position}
                            </span>
                            <div
                              className={
                                isSlotOne
                                  ? "border border-primary/50 bg-primary/10 rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5"
                                  : "border rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5"
                              }
                            >
                              <p className="font-medium">{renderEntityLabel(row)}</p>
                              <p className="text-muted-foreground truncate">
                                {row.divisionName} · {renderSongLabel(row.songId)}
                              </p>
                              {filename && (
                                <p className="text-xs text-muted-foreground/70 truncate font-mono">
                                  {filename}
                                </p>
                              )}
                              {row.notes && (
                                <p className="text-xs text-muted-foreground italic">
                                  Note: {row.notes}
                                </p>
                              )}
                              <div className="flex gap-2 flex-wrap pt-2 border-t border-border/40 mt-1.5">
                                <Button size="sm" onClick={() => handleComplete(row.queueEntryId)}>
                                  Run complete
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleIncomplete(row.queueEntryId)}>
                                  Run incomplete
                                </Button>
                                {!isLast && (
                                  <Button size="sm" variant="outline" onClick={() => handleMoveDown(row.queueEntryId)}>
                                    Move down
                                  </Button>
                                )}
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
                          </div>
                        );
                      })
                  )}
                </CardContent>
              </Card>

              {/* Priority + Non-priority queues — side by side when there's room */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="border-amber-500/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-amber-500 dark:text-amber-400">Priority</CardTitle>
                      <span className="text-xs text-muted-foreground">{lqPriority.length} waiting</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {lqPriority.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Priority queue is empty.</p>
                    ) : (
                      lqPriority
                        .slice()
                        .sort((a, b) => a.position - b.position)
                        .map((row) => {
                          const isLast = row.position === lqPriority.length;
                          const filename = row.songId ? songFilenameMap.get(row.songId) : undefined;
                          return (
                            <div key={row.queueEntryId} className="flex items-start gap-3">
                              <span className="text-sm font-medium tabular-nums shrink-0 pt-2 w-12 text-right">
                                #{row.position}
                              </span>
                              <div className="border rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5">
                                <p className="font-medium">{renderEntityLabel(row)}</p>
                                <p className="text-muted-foreground truncate">
                                  {row.divisionName} · {renderSongLabel(row.songId)}
                                </p>
                                {filename && (
                                  <p className="text-xs text-muted-foreground/70 truncate font-mono">
                                    {filename}
                                  </p>
                                )}
                                {row.notes && (
                                  <p className="text-xs text-muted-foreground italic">Note: {row.notes}</p>
                                )}
                                <div className="flex gap-2 pt-2 border-t border-border/40 mt-1.5">
                                  {!isLast && (
                                    <Button size="sm" variant="outline" onClick={() => handleMoveDown(row.queueEntryId)}>
                                      Move down
                                    </Button>
                                  )}
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
                            </div>
                          );
                        })
                    )}
                  </CardContent>
                </Card>

                <Card className="border-sky-500/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sky-500 dark:text-sky-400">Standard</CardTitle>
                      <span className="text-xs text-muted-foreground">{lqNonPriority.length} waiting</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {lqNonPriority.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Standard queue is empty.</p>
                    ) : (
                      lqNonPriority
                        .slice()
                        .sort((a, b) => a.position - b.position)
                        .map((row) => {
                          const isLast = row.position === lqNonPriority.length;
                          const filename = row.songId ? songFilenameMap.get(row.songId) : undefined;
                          return (
                            <div key={row.queueEntryId} className="flex items-start gap-3">
                              <span className="text-sm font-medium tabular-nums shrink-0 pt-2 w-12 text-right">
                                #{row.position}
                              </span>
                              <div className="border rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5">
                                <p className="font-medium">{renderEntityLabel(row)}</p>
                                <p className="text-muted-foreground truncate">
                                  {row.divisionName} · {renderSongLabel(row.songId)}
                                </p>
                                {filename && (
                                  <p className="text-xs text-muted-foreground/70 truncate font-mono">
                                    {filename}
                                  </p>
                                )}
                                {row.notes && (
                                  <p className="text-xs text-muted-foreground italic">Note: {row.notes}</p>
                                )}
                                <div className="flex gap-2 pt-2 border-t border-border/40 mt-1.5">
                                  {!isLast && (
                                    <Button size="sm" variant="outline" onClick={() => handleMoveDown(row.queueEntryId)}>
                                      Move down
                                    </Button>
                                  )}
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
                            </div>
                          );
                        })
                    )}
                  </CardContent>
                </Card>
              </div>

            </div>
          )}
        </TabsContent>

        {/* ── Run History tab ── */}
        <TabsContent value="runs" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="w-full sm:w-72">
              <select
                className={FIELD_INPUT_CLASS}
                value={runsSessionFilter}
                onChange={(e) => setRunsSessionFilter(e.target.value)}
              >
                <option value="">All sessions</option>
                {sessions
                  ?.slice()
                  .sort(compareSessionChrono)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatSessionTitle(s, s.event_timezone)}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadRuns(runsSessionFilter)}
              disabled={runsLoading}
            >
              {runsLoading ? "Refreshing…" : "Refresh"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {runs === null ? "" : `${runs.length} run${runs.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {runs === null ? (
            <Skeleton className="h-32 w-full" />
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
          ) : (
            <div className={`space-y-2${runsLoading ? " opacity-60" : ""}`}>
              {runs.map((row) => {
                const sessionRow = sessions?.find((s) => s.id === row.session_id);
                const runEventTz = row.event_id
                  ? (events?.find((e) => e.id === row.event_id)?.timezone ?? null)
                  : null;
                const sessionLabel = sessionRow
                  ? formatSessionTitle(sessionRow, sessionRow.event_timezone)
                  : row.session_floor_trial_starts_at
                  ? formatSessionTitle(
                      { floor_trial_starts_at: row.session_floor_trial_starts_at },
                      runEventTz
                    )
                  : "Unknown session";
                return (
                  <div
                    key={row.id}
                    className="rounded-lg border px-3 py-3 text-sm space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium">
                          {row.entity_label}
                          <span className="text-muted-foreground"> · {row.division_name}</span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.song_label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sessionLabel}
                          {row.event_name ? ` · ${row.event_name}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {formatTime(row.completed_at)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          by {row.completed_by_label}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Test Inject tab ── */}
        <TabsContent value="inject" className="mt-4 space-y-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Testing-only bypass. Creates throwaway user/partner/pair rows and uses a placeholder song.
            Skips the check-in time window. Each submission adds one entry to the selected session's queue.
          </div>
          <form onSubmit={submitApiTestInjection} className="space-y-4 max-w-lg">
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
                    {formatSessionTitle(s, s.event_timezone)}
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
                  onClick={() => void loadApiTestInjections()}
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
                  const sessionLabel = sessionRow ? formatSessionTitle(sessionRow, sessionRow.event_timezone) : "No session";
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
        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="w-full sm:w-80">
              <Input
                placeholder="Search by name or email…"
                value={usersQuery}
                onChange={(e) => setUsersQuery(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadUsers(usersDebouncedQuery)}
              disabled={usersLoading}
            >
              {usersLoading ? "Refreshing…" : "Refresh"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {users === null ? "" : `${users.length} user${users.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {users === null ? (
            <Skeleton className="h-32 w-full" />
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {usersDebouncedQuery
                ? `No users match "${usersDebouncedQuery}".`
                : "No users yet."}
            </p>
          ) : (
            <div className={usersLoading ? "opacity-60" : ""}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const fullName =
                      [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
                      "—";
                    const isSelf = me?.id === u.id;
                    const isSubmitting = !!userRoleSubmitting[u.id];
                    const nextRole: "user" | "admin" =
                      u.role === "admin" ? "user" : "admin";
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{fullName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.email}
                        </TableCell>
                        <TableCell>
                          {u.role === "admin" ? (
                            <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
                              admin
                            </Badge>
                          ) : (
                            <Badge variant="secondary">user</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground">
                              (you)
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant={nextRole === "admin" ? "default" : "outline"}
                              onClick={() => void setUserRole(u.id, nextRole)}
                              disabled={isSubmitting}
                            >
                              {isSubmitting
                                ? "Saving…"
                                : nextRole === "admin"
                                ? "Make admin"
                                : "Revoke admin"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
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
              <div>
                <label className={FIELD_LABEL_CLASS}>Timezone</label>
                <select
                  className={FIELD_INPUT_CLASS}
                  value={evTimezone}
                  onChange={(e) => setEvTimezone(e.target.value)}
                >
                  <optgroup label="United States">
                    <option value="America/New_York">Eastern — New York / Miami</option>
                    <option value="America/Chicago">Central — Chicago / Dallas</option>
                    <option value="America/Denver">Mountain — Denver / Salt Lake City</option>
                    <option value="America/Phoenix">Mountain (no DST) — Phoenix</option>
                    <option value="America/Los_Angeles">Pacific — Los Angeles / Seattle</option>
                    <option value="America/Anchorage">Alaska — Anchorage</option>
                    <option value="Pacific/Honolulu">Hawaii — Honolulu</option>
                  </optgroup>
                  <optgroup label="Canada">
                    <option value="America/Toronto">Eastern — Toronto</option>
                    <option value="America/Winnipeg">Central — Winnipeg</option>
                    <option value="America/Edmonton">Mountain — Edmonton</option>
                    <option value="America/Vancouver">Pacific — Vancouver</option>
                  </optgroup>
                  <optgroup label="Europe">
                    <option value="Europe/London">London / Dublin</option>
                    <option value="Europe/Paris">Central European — Paris / Berlin</option>
                    <option value="Europe/Helsinki">Eastern European — Helsinki / Kyiv</option>
                  </optgroup>
                  <optgroup label="Asia / Pacific">
                    <option value="Asia/Tokyo">Tokyo / Osaka</option>
                    <option value="Asia/Seoul">Seoul</option>
                    <option value="Asia/Shanghai">Shanghai / Beijing</option>
                    <option value="Asia/Singapore">Singapore / Kuala Lumpur</option>
                    <option value="Australia/Sydney">Sydney / Melbourne</option>
                    <option value="Pacific/Auckland">Auckland</option>
                  </optgroup>
                </select>
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
                  onChange={(e) => {
                    const id = e.target.value;
                    setSessEventId(id);
                    const ev = events?.find((ev) => ev.id === id);
                    if (ev) setSessDate(ev.start_date);
                  }}
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
              <div>
                <label className={FIELD_LABEL_CLASS}>
                  Start time
                  {sessEventId && events?.find((ev) => ev.id === sessEventId)?.timezone && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({formatTimezoneAbbr(
                        events.find((ev) => ev.id === sessEventId)!.timezone
                      )})
                    </span>
                  )}
                </label>
                <input
                  type="time"
                  className={FIELD_INPUT_CLASS}
                  value={sessStartTime}
                  onChange={(e) => setSessStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={FIELD_LABEL_CLASS}>Check-in opens</label>
                  <select
                    className={FIELD_INPUT_CLASS}
                    value={sessCheckinOffsetMins}
                    onChange={(e) => setSessCheckinOffsetMins(e.target.value)}
                  >
                    <option value="0">Same as start</option>
                    <option value="15">15 min before</option>
                    <option value="30">30 min before</option>
                    <option value="45">45 min before</option>
                    <option value="60">1 hour before</option>
                    <option value="90">1.5 hours before</option>
                    <option value="120">2 hours before</option>
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL_CLASS}>Floor trial duration</label>
                  <select
                    className={FIELD_INPUT_CLASS}
                    value={sessDurationMins}
                    onChange={(e) => setSessDurationMins(e.target.value)}
                  >
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                    <option value="150">2.5 hours</option>
                    <option value="180">3 hours</option>
                    <option value="210">3.5 hours</option>
                    <option value="240">4 hours</option>
                    <option value="270">4.5 hours</option>
                    <option value="300">5 hours</option>
                  </select>
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
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                  {DIVISION_OPTIONS.map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
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
