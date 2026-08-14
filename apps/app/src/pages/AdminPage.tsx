import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  DIVISIONS,
  type ApiEvent,
  type ApiSession,
  type ApiRun,
  type ApiAdminSong,
  type ApiAdminUser,
  type ApiTestInjection,
} from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import { useAuthMe } from "@/hooks/useAuthMe";
import { CLICKABLE_ROW_CLASS } from "@/lib/clickable";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr } from "@/lib/sessionFormat";
import { compareEventChrono, compareSessionChrono } from "@/lib/chronoSort";

// ─── Constants ────────────────────────────────────────────────────────────────

const DIVISION_OPTIONS = DIVISIONS;

function randomFourDigitTag(): string {
  return Math.floor(Math.random() * 10000).toString().padStart(4, "0");
}
function randomDivision(): string {
  return DIVISION_OPTIONS[Math.floor(Math.random() * DIVISION_OPTIONS.length)];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a "YYYY-MM-DD" date + "HH:MM" time string to a Unix epoch (ms),
 * interpreting the wall-clock time as local time in the given IANA timezone.
 *
 * e.g. ("2026-04-27", "19:30", "America/Chicago") → epoch for 7:30 PM CDT.
 * Falls back to browser local time if the timezone is empty or invalid.
 */
/**
 * Inverse of toEpochInTz: given an epoch and a timezone, return the local
 * wall-clock time in that zone as "HH:MM" (24-hour). Used by the Edit
 * Session dialog to pre-fill the start-time input from a stored epoch.
 */
function epochToTimeInTz(epoch: number, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(epoch));
    const h = parts.find((p) => p.type === "hour")!.value;
    const m = parts.find((p) => p.type === "minute")!.value;
    // Intl in Chrome can return "24" instead of "00" for midnight; normalize.
    return `${h === "24" ? "00" : h}:${m}`;
  } catch {
    const d = new Date(epoch);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

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

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * The admin sections, in display order. The order also drives the
 * navbar dropdown and any future iteration over admin pages.
 *
 * Each admin section is now its own route (`/admin/<section>`); the value
 * here is the URL slug and the corresponding Radix `<TabsContent value=...>`
 * identifier in this file. Keeping them in one constant keeps the route,
 * the param parsing, and the rendering in lock-step.
 */
export const ADMIN_SECTIONS = [
  "events",
  "sessions",
  "runs",
  "songs",
  "test-checkin",
  "users",
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

const DEFAULT_ADMIN_SECTION: AdminSection = "events";

function isAdminSection(s: string | undefined): s is AdminSection {
  return !!s && (ADMIN_SECTIONS as readonly string[]).includes(s);
}

export default function AdminPage() {
  const api = useApiClient();
  const navigate = useNavigate();
  // The URL drives which section is shown. An unknown / missing slug
  // collapses to the default rather than rendering nothing, so a
  // user typing /admin/foo doesn't see a blank page.
  const { section: rawSection } = useParams<{ section: string }>();
  const section: AdminSection = isAdminSection(rawSection)
    ? rawSection
    : DEFAULT_ADMIN_SECTION;
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
  /**
   * When set, the Event dialog is in edit mode: submitting calls PATCH on
   * this id instead of POST. Cleared when the dialog closes.
   */
  const [evEditId, setEvEditId] = useState<string | null>(null);
  const [showEventsCompleted, setShowEventsCompleted] = useState(false);
  const [showEventsCancelled, setShowEventsCancelled] = useState(false);

  // ── Sessions tab ────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ApiSession[] | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessDialogOpen, setSessDialogOpen] = useState(false);
  const [sessSubmitting, setSessSubmitting] = useState(false);
  const [sessEventId, setSessEventId] = useState("");
  const [sessDate, setSessDate] = useState("");
  const [sessStartTime, setSessStartTime] = useState("07:00");
  /** When set, the Session dialog is in edit mode (PATCH/PUT instead of POST). */
  const [sessEditId, setSessEditId] = useState<string | null>(null);
  /** Tracks the row currently mid-delete so its button can disable + show "Deleting…". */
  const [sessDeletingId, setSessDeletingId] = useState<string | null>(null);
  /** Delete-confirmation dialog state — one per destructive action type. */
  const [pendingDeleteEventId, setPendingDeleteEventId] = useState<string | null>(null);
  const [pendingDeleteSession, setPendingDeleteSession] = useState<ApiSession | null>(null);
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
  const [showSessionsCompleted, setShowSessionsCompleted] = useState(false);
  const [showSessionsCancelled, setShowSessionsCancelled] = useState(false);

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

  // ── Admin Songs tab ─────────────────────────────────────────────────────────
  // Mirrors the Users tab pattern: live keystrokes feed `adminSongsQuery`,
  // debounced into `adminSongsDebouncedQuery` to drive the API call.
  const [adminSongs, setAdminSongs] = useState<ApiAdminSong[] | null>(null);
  const [adminSongsLoading, setAdminSongsLoading] = useState(false);
  const [adminSongsQuery, setAdminSongsQuery] = useState("");
  const [adminSongsDebouncedQuery, setAdminSongsDebouncedQuery] = useState("");
  const [adminSongsIncludeDeleted, setAdminSongsIncludeDeleted] = useState(false);
  const [adminSongsYear, setAdminSongsYear] = useState<string>("all");
  const [adminSongsDivision, setAdminSongsDivision] = useState<string>("all");

  // ── Test Checkin tab ──────────────────────────────────────────────────────
  const [tcSessionId, setTcSessionId] = useState("");
  const [tcDivision, setTcDivision] = useState<string>(() => randomDivision());
  const [tcLeaderFirst, setTcLeaderFirst] = useState("Leader");
  const [tcLeaderLast, setTcLeaderLast] = useState(() => randomFourDigitTag());
  const [tcFollowerFirst, setTcFollowerFirst] = useState("Follower");
  const [tcFollowerLast, setTcFollowerLast] = useState(() => randomFourDigitTag());
  const [tcSubmitting, setTcSubmitting] = useState(false);
  const [tcData, setTcData] = useState<ApiTestInjection[] | null>(null);
  const [tcDeleting, setTcDeleting] = useState(false);
  const [pendingDeleteAllTestCheckins, setPendingDeleteAllTestCheckins] = useState(false);

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

  const loadAdminSongs = useCallback(
    async (q: string, includeDeleted: boolean) => {
      setAdminSongsLoading(true);
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (includeDeleted) params.set("include_deleted", "true");
        const qs = params.toString();
        const path = qs ? `/v1/admin/songs?${qs}` : "/v1/admin/songs";
        const data = await api.get<ApiAdminSong[]>(path);
        setAdminSongs(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load songs");
      } finally {
        setAdminSongsLoading(false);
      }
    },
    [api]
  );

  const loadTestCheckins = useCallback(async () => {
    try {
      const data = await api.get<ApiTestInjection[]>("/v1/admin/checkins/test");
      setTcData(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load test check-ins");
    }
  }, [api]);

  useEffect(() => {
    loadEvents();
    loadSessions();
    void loadUsers("").catch(() => {});
    void loadAdminSongs("", false).catch(() => {});
    void loadTestCheckins().catch(() => {});
  }, [loadEvents, loadSessions, loadUsers, loadAdminSongs, loadTestCheckins]);

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

  // Same debounce + refetch pattern for the Songs tab.
  useEffect(() => {
    const t = setTimeout(() => setAdminSongsDebouncedQuery(adminSongsQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [adminSongsQuery]);

  useEffect(() => {
    void loadAdminSongs(adminSongsDebouncedQuery, adminSongsIncludeDeleted).catch(() => {});
  }, [adminSongsDebouncedQuery, adminSongsIncludeDeleted, loadAdminSongs]);

  const adminSongYears = useMemo(() => {
    const set = new Set<string>();
    (adminSongs ?? []).forEach((s) => {
      if (s.season_year) set.add(s.season_year);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [adminSongs]);

  const adminSongDivisions = useMemo(() => {
    const set = new Set<string>();
    (adminSongs ?? []).forEach((s) => {
      if (s.division) set.add(s.division);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [adminSongs]);

  const visibleAdminSongs = useMemo(
    () =>
      (adminSongs ?? [])
        .filter((s) => adminSongsYear === "all" || s.season_year === adminSongsYear)
        .filter((s) => adminSongsDivision === "all" || s.division === adminSongsDivision)
        .slice()
        .sort((a, b) => b.created_at - a.created_at),
    [adminSongs, adminSongsYear, adminSongsDivision]
  );

  // ── Event CRUD ──────────────────────────────────────────────────────────────

  const deleteEvent = (id: string) => {
    setPendingDeleteEventId(id);
  };

  const confirmDeleteEvent = async () => {
    if (!pendingDeleteEventId) return;
    const id = pendingDeleteEventId;
    setPendingDeleteEventId(null);
    try {
      await api.del(`/v1/events/${id}`);
      toast.success("Event deleted");
      setEvents((prev) => prev?.filter((e) => e.id !== id) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const openEvDialog = () => {
    setEvEditId(null);
    setEvName("");
    setEvStartDate("");
    setEvEndDate("");
    setEvTimezone("America/Chicago");
    setEvDialogOpen(true);
  };

  const openEvEditDialog = (ev: ApiEvent) => {
    setEvEditId(ev.id);
    setEvName(ev.name);
    setEvStartDate(ev.start_date);
    setEvEndDate(ev.end_date);
    setEvTimezone(ev.timezone);
    setEvDialogOpen(true);
  };

  const submitEventDialog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evName.trim()) { toast.error("Name is required"); return; }
    if (!evStartDate) { toast.error("Start date is required"); return; }
    if (!evEndDate) { toast.error("End date is required"); return; }
    if (evEndDate < evStartDate) { toast.error("End date must be on or after start date"); return; }
    setEvSubmitting(true);
    try {
      if (evEditId) {
        // Edit mode — PATCH the existing event and merge the response back
        // into local state so the table updates without a full refetch.
        const updated = await api.patch<ApiEvent>(`/v1/events/${evEditId}`, {
          name: evName.trim(),
          start_date: evStartDate,
          end_date: evEndDate,
          timezone: evTimezone,
        });
        toast.success("Event updated");
        setEvents((prev) =>
          prev?.map((e) => (e.id === updated.id ? updated : e)) ?? null
        );
      } else {
        // Create mode — POST and prepend.
        const created = await api.post<ApiEvent>("/v1/events", {
          name: evName.trim(),
          start_date: evStartDate,
          end_date: evEndDate,
          timezone: evTimezone,
        });
        toast.success("Event created");
        setEvents((prev) => (prev ? [created, ...prev] : [created]));
      }
      setEvDialogOpen(false);
      setEvEditId(null);
      setEvName("");
      setEvStartDate("");
      setEvEndDate("");
      setEvTimezone("America/Chicago");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save event");
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
    setSessEditId(null);
    resetSessForm();
    setSessDialogOpen(true);
  };

  /**
   * Pre-fill the Session dialog from an existing session row and switch into
   * edit mode. The session stores absolute epochs but the form takes
   * wall-clock time + offsets, so we derive those by anchoring on the
   * event's timezone.
   */
  const openSessEditDialog = (s: ApiSession) => {
    const tz =
      s.event_timezone ??
      events?.find((ev) => ev.id === s.event_id)?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    setSessEditId(s.id);
    setSessEventId(s.event_id ?? "");
    setSessDate(s.date ?? "");
    setSessStartTime(epochToTimeInTz(s.floor_trial_starts_at, tz));
    setSessCheckinOffsetMins(
      String(Math.max(0, Math.round((s.floor_trial_starts_at - s.checkin_opens_at) / 60_000)))
    );
    setSessDurationMins(
      String(Math.max(1, Math.round((s.floor_trial_ends_at - s.floor_trial_starts_at) / 60_000)))
    );
    setSessPriorityMax(String(s.active_priority_max ?? 6));
    setSessNonPriorityMax(String(s.active_non_priority_max ?? 4));

    // Per-division priority flags + the (single, shared) priority run limit.
    const flags = Object.fromEntries(DIVISION_OPTIONS.map((d) => [d, false])) as Record<
      string,
      boolean
    >;
    let runLimit = 1;
    for (const d of s.divisions ?? []) {
      flags[d.division_name] = d.is_priority;
      // priority_run_limit is nullable on non-priority divisions; only
      // priority divisions store a real limit, and they all share one.
      const limit = d.priority_run_limit ?? 0;
      if (d.is_priority && limit > 0) {
        runLimit = limit;
      }
    }
    setSessDivisionPriority(flags);
    setSessPriorityRunLimit(String(runLimit));

    setSessDialogOpen(true);
  };

  const deleteSession = (s: ApiSession) => {
    setPendingDeleteSession(s);
  };

  const confirmDeleteSession = async () => {
    if (!pendingDeleteSession) return;
    const s = pendingDeleteSession;
    setPendingDeleteSession(null);
    setSessDeletingId(s.id);
    try {
      await api.del(`/v1/sessions/${s.id}`);
      toast.success("Session deleted");
      setSessions((prev) => prev?.filter((x) => x.id !== s.id) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete session");
    } finally {
      setSessDeletingId(null);
    }
  };

  const toggleDivisionPriority = (name: string) => {
    setSessDivisionPriority((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const submitSessionDialog = async (e: React.FormEvent) => {
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
      if (sessEditId) {
        // Edit: PATCH the scalar fields first, then PUT divisions to overwrite
        // the priority/run-limit flags. The two endpoints are intentionally
        // separate on the API side because divisions are a child collection.
        // Each call is wrapped so the toast can identify which leg failed —
        // necessary because the PATCH can succeed while the PUT errors,
        // leaving the row half-updated.
        try {
          await api.patch(`/v1/sessions/${sessEditId}`, {
            event_id: sessEventId,
            name: sessionName,
            date: sessDate,
            checkin_opens_at: checkinOpensAt,
            floor_trial_starts_at: floorStartsAt,
            floor_trial_ends_at: floorEndsAt,
            active_priority_max: priorityMaxNum,
            active_non_priority_max: nonPriorityMaxNum,
          });
        } catch (err) {
          throw new Error(
            `Failed to update session fields: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        try {
          await api.put(`/v1/sessions/${sessEditId}/divisions`, { divisions });
        } catch (err) {
          throw new Error(
            `Session fields saved, but failed to update divisions: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        toast.success("Session updated");
      } else {
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
      }
      setSessDialogOpen(false);
      setSessEditId(null);
      loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save session");
    } finally {
      setSessSubmitting(false);
    }
  };

  const submitTestCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tcSessionId) { toast.error("Select a session"); return; }
    if (!tcDivision) { toast.error("Select a division"); return; }
    if (!tcLeaderFirst.trim() || !tcLeaderLast.trim()) {
      toast.error("Leader first and last name are required");
      return;
    }
    if (!tcFollowerFirst.trim() || !tcFollowerLast.trim()) {
      toast.error("Follower first and last name are required");
      return;
    }
    setTcSubmitting(true);
    try {
      const result = await api.post<{
        id: string;
        sessionId: string;
        divisionName: string;
        initialQueue: "priority" | "non_priority";
        pair: { id: string; partner_b_id: string | null; display_name: string };
      }>("/v1/admin/checkins", {
        sessionId: tcSessionId,
        divisionName: tcDivision,
        leaderFirstName: tcLeaderFirst.trim(),
        leaderLastName: tcLeaderLast.trim(),
        followerFirstName: tcFollowerFirst.trim(),
        followerLastName: tcFollowerLast.trim(),
      });
      toast.success(
        `Checked in to ${result.initialQueue === "priority" ? "priority" : "non-priority"} queue`
      );
      setTcLeaderFirst("Leader");
      setTcLeaderLast(randomFourDigitTag());
      setTcFollowerFirst("Follower");
      setTcFollowerLast(randomFourDigitTag());
      setTcDivision(randomDivision());
      void loadTestCheckins().catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setTcSubmitting(false);
    }
  };

  const confirmDeleteAllTestCheckins = async () => {
    setPendingDeleteAllTestCheckins(false);
    if (!tcData) return;
    setTcDeleting(true);
    const expectedCount = tcData.length;
    try {
      await api.del("/v1/admin/checkins/test");
      toast.success(`Deleted ${expectedCount} check-in${expectedCount === 1 ? "" : "s"}`);
      setTcData([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setTcDeleting(false);
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

  // ── Render ────────────────────────────────────────────────────────────────────

  const eventBuckets = useMemo(() => {
    const list = (events ?? []).slice().sort(compareEventChrono);
    return {
      active: list.filter((e) => e.status === "active"),
      upcoming: list.filter((e) => e.status === "upcoming"),
      completed: list.filter((e) => e.status === "completed"),
      cancelled: list.filter((e) => e.status === "cancelled"),
    };
  }, [events]);

  const sessionBuckets = useMemo(() => {
    const list = (sessions ?? []).slice().sort(compareSessionChrono);
    return {
      active: list.filter((s) => s.status === "checkin_open" || s.status === "in_progress"),
      upcoming: list.filter((s) => s.status === "scheduled"),
      completed: list.filter((s) => s.status === "completed"),
      cancelled: list.filter((s) => s.status === "cancelled"),
    };
  }, [sessions]);

  const renderEventRow = (ev: ApiEvent) => (
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openEvEditDialog(ev)}>
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => deleteEvent(ev.id)}>
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  const renderSessionRow = (s: ApiSession) => {
    const eventName = events?.find((ev) => ev.id === s.event_id)?.name ?? "—";
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
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openSessEditDialog(s)}
              disabled={sessDeletingId === s.id}
            >
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteSession(s)}
              disabled={sessDeletingId === s.id}
            >
              {sessDeletingId === s.id ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderEventBox = (title: string, rows: ApiEvent[]) => (
    <section className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">None.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Start date</TableHead>
              <TableHead>End date</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{rows.map((ev) => renderEventRow(ev))}</TableBody>
        </Table>
      )}
    </section>
  );

  const renderSessionBox = (title: string, rows: ApiSession[]) => (
    <section className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">None.</p>
      ) : (
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
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{rows.map((s) => renderSessionRow(s))}</TableBody>
        </Table>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">Admin</h1>

      {/* The tab strip lived here previously; admin sections are now their
          own routes (`/admin/<section>`) reached via the navbar dropdown.
          We keep Radix's <Tabs> wrapper so we don't have to rewrite every
          <TabsContent value="..."> block — Radix hides every TabsContent
          whose `value` doesn't match the controlled `value` prop. */}
      <Tabs value={section}>

        {/* ── Events tab ── */}
        <TabsContent value="events" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={openEvDialog} className="w-full sm:w-auto">
              New Event
            </Button>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showEventsCompleted}
                onChange={(e) => setShowEventsCompleted(e.target.checked)}
              />
              Show completed
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showEventsCancelled}
                onChange={(e) => setShowEventsCancelled(e.target.checked)}
              />
              Show cancelled
            </label>
          </div>
          {loadingEvents && !events ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className={`space-y-4${loadingEvents ? " opacity-60" : ""}`}>
              {renderEventBox("Active", eventBuckets.active)}
              {renderEventBox("Upcoming", eventBuckets.upcoming)}
              {showEventsCompleted && renderEventBox("Completed", eventBuckets.completed)}
              {showEventsCancelled && renderEventBox("Cancelled", eventBuckets.cancelled)}
            </div>
          )}
        </TabsContent>

        {/* ── Sessions tab ── */}
        <TabsContent value="sessions" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={openSessDialog} className="w-full sm:w-auto">
              New Session
            </Button>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSessionsCompleted}
                onChange={(e) => setShowSessionsCompleted(e.target.checked)}
              />
              Show completed
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSessionsCancelled}
                onChange={(e) => setShowSessionsCancelled(e.target.checked)}
              />
              Show cancelled
            </label>
          </div>
          {loadingSessions && !sessions ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className={`space-y-4${loadingSessions ? " opacity-60" : ""}`}>
              {renderSessionBox("Active", sessionBuckets.active)}
              {renderSessionBox("Upcoming", sessionBuckets.upcoming)}
              {showSessionsCompleted && renderSessionBox("Completed", sessionBuckets.completed)}
              {showSessionsCancelled && renderSessionBox("Cancelled", sessionBuckets.cancelled)}
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

        {/* ── Songs tab ── */}
        <TabsContent value="songs" className="mt-4 space-y-4">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
              <div className="w-full sm:w-80">
                <Input
                  placeholder="Search by song, owner, or partner…"
                  value={adminSongsQuery}
                  onChange={(e) => setAdminSongsQuery(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={adminSongsIncludeDeleted}
                  onChange={(e) => setAdminSongsIncludeDeleted(e.target.checked)}
                />
                Show deleted
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void loadAdminSongs(adminSongsDebouncedQuery, adminSongsIncludeDeleted)
                }
                disabled={adminSongsLoading}
              >
                {adminSongsLoading ? "Refreshing…" : "Refresh"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {adminSongs === null
                  ? ""
                  : `${visibleAdminSongs.length} song${visibleAdminSongs.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Year</span>
                <ChoiceGroup
                  ariaLabel="Filter by year"
                  options={[
                    { value: "all", label: "All" },
                    ...adminSongYears.map((y) => ({ value: y, label: y })),
                  ]}
                  value={adminSongsYear}
                  onChange={setAdminSongsYear}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Division</span>
                <ChoiceGroup
                  ariaLabel="Filter by division"
                  options={[
                    { value: "all", label: "All" },
                    ...adminSongDivisions.map((d) => ({ value: d, label: d })),
                  ]}
                  value={adminSongsDivision}
                  onChange={setAdminSongsDivision}
                />
              </div>
            </div>
          </div>

          {adminSongs === null ? (
            <Skeleton className="h-32 w-full" />
          ) : adminSongs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {adminSongsDebouncedQuery
                ? `No songs match "${adminSongsDebouncedQuery}".`
                : "No songs yet."}
            </p>
          ) : visibleAdminSongs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No songs match the selected filters.</p>
          ) : (
            <div className={cn("space-y-3", adminSongsLoading && "opacity-60")}>
              {visibleAdminSongs.map((s) => {
                const ownerLabel = s.owner.full_name?.trim() || s.owner.email || "—";
                const partnerLabel = s.partner?.full_name?.trim() || "—";
                return (
                  <div
                    key={s.id}
                    className={cn("rounded-lg border px-4 py-3 space-y-3", s.deleted_at && "opacity-60")}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-medium">{s.song_label}</span>
                        {s.is_legacy && (
                          <Badge
                            variant="secondary"
                            className="text-xs font-normal bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                            title="Imported from the legacy catalog — no Drive file"
                          >
                            Legacy
                          </Badge>
                        )}
                        {s.deleted_at && (
                          <Badge variant="destructive" className="text-xs font-normal">deleted</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums shrink-0">
                        {formatTime(s.created_at)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Owner</p>
                        <p className="truncate">{ownerLabel}</p>
                        {s.owner.email && s.owner.full_name && (
                          <p className="text-xs text-muted-foreground truncate">{s.owner.email}</p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Partner</p>
                        <p className="truncate">{partnerLabel}</p>
                        {s.partner?.linked_user_email && (
                          <p className="text-xs text-muted-foreground truncate">linked: {s.partner.linked_user_email}</p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Division</p>
                        <p className="truncate">{s.division ?? "—"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Routine</p>
                        <p className="truncate">{s.routine_name ?? "—"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Descriptor</p>
                        <p className="truncate">{s.personal_descriptor ?? "—"}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Test Checkin tab ── */}
        <TabsContent value="test-checkin" className="mt-4 space-y-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Creates throwaway user/partner/pair rows and uses a placeholder song.
            Skips the check-in time window. Each submission adds one entry to the selected session's queue.
          </div>
          <form onSubmit={submitTestCheckin} className="space-y-4 max-w-lg">
            <div>
              <label className={FIELD_LABEL_CLASS}>Session</label>
              <ChoiceGroup
                ariaLabel="Session"
                options={(sessions ?? [])
                  .slice()
                  .sort(compareSessionChrono)
                  .map((s) => ({
                    value: s.id,
                    label: formatSessionTitle(s, s.event_timezone),
                  }))}
                value={tcSessionId}
                onChange={setTcSessionId}
              />
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS}>Division</label>
              <ChoiceGroup
                ariaLabel="Division"
                options={DIVISION_OPTIONS.map((d) => ({ value: d, label: d }))}
                value={tcDivision}
                onChange={setTcDivision}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL_CLASS}>Leader first name</label>
                <input className={FIELD_INPUT_CLASS} value={tcLeaderFirst}
                  onChange={(e) => setTcLeaderFirst(e.target.value)} />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Leader last name</label>
                <input className={FIELD_INPUT_CLASS} value={tcLeaderLast}
                  onChange={(e) => setTcLeaderLast(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL_CLASS}>Follower first name</label>
                <input className={FIELD_INPUT_CLASS} value={tcFollowerFirst}
                  onChange={(e) => setTcFollowerFirst(e.target.value)} />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Follower last name</label>
                <input className={FIELD_INPUT_CLASS} value={tcFollowerLast}
                  onChange={(e) => setTcFollowerLast(e.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={tcSubmitting} size="lg" className="w-full sm:w-auto">
              {tcSubmitting ? "Checking in…" : "Test check-in"}
            </Button>
          </form>

          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-base font-semibold">
                Existing test check-ins
                {tcData !== null && (
                  <span className="ml-2 text-sm text-muted-foreground font-normal">
                    ({tcData.length})
                  </span>
                )}
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm"
                  onClick={() => void loadTestCheckins()} disabled={tcDeleting}>
                  Refresh
                </Button>
                <Button variant="destructive" size="sm"
                  onClick={() => { if (tcData && tcData.length > 0) setPendingDeleteAllTestCheckins(true); }}
                  disabled={tcDeleting || !tcData || tcData.length === 0}>
                  {tcDeleting ? "Deleting…" : "Delete all"}
                </Button>
              </div>
            </div>

            {tcData === null ? (
              <Skeleton className="h-24 w-full" />
            ) : tcData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No test check-ins yet.</p>
            ) : (
              <div className="space-y-2">
                {tcData.map((row) => {
                  const queueLabel =
                    row.queue_status === "active" ? `Active #${row.position ?? "?"}`
                    : row.queue_status === "priority" ? `Priority #${row.position ?? "?"}`
                    : row.queue_status === "non_priority" ? `Non-priority #${row.position ?? "?"}`
                    : "Off queue";
                  const sessionRow = sessions?.find((s) => s.id === row.session_id);
                  const sessionLabel = sessionRow
                    ? formatSessionTitle(sessionRow, sessionRow.event_timezone)
                    : "No session";
                  return (
                    <div key={row.pair_id}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
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
                            Checked in {formatTime(row.created_at)}
                          </p>
                        </div>
                        <Badge variant={row.queue_status === "off_queue" ? "outline" : "default"}
                          className="shrink-0">
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
                    {/* Numeric columns are right-aligned and use tabular-nums
                        on the cells below so digits line up between rows. */}
                    <TableHead className="text-right">Songs</TableHead>
                    <TableHead className="text-right">Partners</TableHead>
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
                        <TableCell className="text-right tabular-nums text-sm">
                          {u.song_count}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {u.partner_count}
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

      {/* ── Delete all test check-ins confirmation dialog ── */}
      <Dialog open={pendingDeleteAllTestCheckins}
        onOpenChange={(open: boolean) => { if (!open) setPendingDeleteAllTestCheckins(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all test check-ins?</DialogTitle>
            <DialogDescription>
              This will remove {tcData?.length ?? 0} check-in{(tcData?.length ?? 0) === 1 ? "" : "s"} —
              synthetic users, partners, pairs, check-ins, and queue entries. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteAllTestCheckins(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteAllTestCheckins()}>Delete all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Event confirmation dialog ── */}
      <Dialog open={!!pendingDeleteEventId} onOpenChange={(open: boolean) => { if (!open) setPendingDeleteEventId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this event?</DialogTitle>
            <DialogDescription>
              {pendingDeleteEventId
                ? (() => {
                    const ev = events?.find((e) => e.id === pendingDeleteEventId);
                    return ev
                      ? <>This will permanently delete <span className="font-medium">{ev.name}</span>. This cannot be undone.</>
                      : "This will permanently delete the event. This cannot be undone.";
                  })()
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteEventId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteEvent()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Session confirmation dialog ── */}
      <Dialog open={!!pendingDeleteSession} onOpenChange={(open: boolean) => { if (!open) setPendingDeleteSession(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this session?</DialogTitle>
            <DialogDescription>
              {pendingDeleteSession && (
                <>
                  <span className="font-medium">{formatSessionTitle(pendingDeleteSession, pendingDeleteSession.event_timezone)}</span>
                  <br />
                  This will cascade-delete every check-in, queue entry, run, and division row attached to it. This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteSession(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteSession()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <h2 className="text-lg font-semibold">{evEditId ? "Edit event" : "New event"}</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEvDialogOpen(false)}>✕</Button>
            </div>
            <form onSubmit={submitEventDialog} className="space-y-4">
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
                {evSubmitting
                  ? evEditId ? "Saving…" : "Creating…"
                  : evEditId ? "Save changes" : "Create event"}
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
              <h2 className="text-lg font-semibold">{sessEditId ? "Edit session" : "New session"}</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSessDialogOpen(false)}>✕</Button>
            </div>
            <form onSubmit={submitSessionDialog} className="space-y-4">
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
                {sessSubmitting
                  ? sessEditId ? "Saving…" : "Creating…"
                  : sessEditId ? "Save changes" : "Create session"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
