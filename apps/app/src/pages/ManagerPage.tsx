import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  type ApiAdminUser,
  type ApiAdminEventSongSubmission,
  type ApiEvent,
  type ApiEventSongSubmission,
  type ApiQueueEntry,
  type ApiLeadingPair,
  type ApiSession,
  type ApiSong,
} from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import SongUploadForm from "@/components/SongUploadForm";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { formatSessionTitle } from "@/lib/sessionFormat";
import { cn } from "@/lib/utils";

const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

export const MANAGER_SECTIONS = ["active-sessions", "event-songs", "upload-for", "checkin-for"] as const;
export type ManagerSection = (typeof MANAGER_SECTIONS)[number];
const DEFAULT_MANAGER_SECTION: ManagerSection = "active-sessions";

function isManagerSection(s: string | undefined): s is ManagerSection {
  return !!s && (MANAGER_SECTIONS as readonly string[]).includes(s);
}

export default function ManagerPage() {
  const api = useApiClient();
  const { section: rawSection } = useParams<{ section: string }>();
  const section: ManagerSection = isManagerSection(rawSection)
    ? rawSection
    : DEFAULT_MANAGER_SECTION;

  const [sessions, setSessions] = useState<ApiSession[] | null>(null);

  const [esEvents, setEsEvents] = useState<ApiEvent[]>([]);
  const [esEventsLoading, setEsEventsLoading] = useState(false);
  const [esEventId, setEsEventId] = useState("");
  const [esShowPast, setEsShowPast] = useState(false);
  const [esSubmissions, setEsSubmissions] = useState<ApiAdminEventSongSubmission[]>([]);
  const [esSubmissionsLoading, setEsSubmissionsLoading] = useState(false);

  const [cfUserQuery, setCfUserQuery] = useState("");
  const [cfUserResults, setCfUserResults] = useState<ApiAdminUser[]>([]);
  const [cfSearching, setCfSearching] = useState(false);
  const [cfSelectedUser, setCfSelectedUser] = useState<ApiAdminUser | null>(null);
  const [cfSessionId, setCfSessionId] = useState("");
  const [cfSubmissions, setCfSubmissions] = useState<ApiEventSongSubmission[] | null>(null);
  const [cfSongId, setCfSongId] = useState("");
  const [cfDivision, setCfDivision] = useState("");
  const [cfSubmitting, setCfSubmitting] = useState(false);

  const [ufQuery, setUfQuery] = useState("");
  const [ufResults, setUfResults] = useState<Array<{ id: string; email: string; first_name: string | null; last_name: string | null }>>([]);
  const [ufSearching, setUfSearching] = useState(false);
  const [ufSelected, setUfSelected] = useState<{ id: string; email: string; first_name: string | null; last_name: string | null } | null>(null);

  const [lqSessionId, setLqSessionId] = useState("");
  const [lqActive, setLqActive] = useState<ApiQueueEntry[]>([]);
  const [lqPriority, setLqPriority] = useState<ApiQueueEntry[]>([]);
  const [lqNonPriority, setLqNonPriority] = useState<ApiQueueEntry[]>([]);
  const [lqPairs, setLqPairs] = useState<ApiLeadingPair[]>([]);
  const [lqSongs, setLqSongs] = useState<ApiSong[]>([]);
  const [lqLoading, setLqLoading] = useState(false);
  const lqSessionRef = useRef(lqSessionId);
  lqSessionRef.current = lqSessionId;

  const loadSessions = useCallback(() => {
    api.get<ApiSession[]>("/v1/sessions").then(setSessions).catch(() => setSessions([]));
  }, [api]);

  const cfActiveSessions = (sessions ?? []).filter(
    (s) => s.status === "checkin_open" || s.status === "in_progress"
  );
  const cfSessionObj = sessions?.find((s) => s.id === cfSessionId) ?? null;
  const cfSessionDivisions = (cfSessionObj?.divisions ?? []).map((d) => d.division_name);
  const cfSelectedSubmission = cfSubmissions?.find((s) => s.song_id === cfSongId) ?? null;

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

  useEffect(() => {
    loadSessions();
    void loadLqExtras().catch(() => {});
  }, [loadSessions, loadLqExtras]);

  useEffect(() => {
    if (section !== "event-songs") return;
    let cancelled = false;
    setEsEventsLoading(true);
    api
      .get<ApiEvent[]>("/v1/events")
      .catch(() => [] as ApiEvent[])
      .then((evs) => {
        if (!cancelled) setEsEvents(evs);
      })
      .finally(() => {
        if (!cancelled) setEsEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, section]);

  useEffect(() => {
    if (section !== "event-songs" || !esEventId) {
      setEsSubmissions([]);
      return;
    }
    let cancelled = false;
    setEsSubmissionsLoading(true);
    api
      .get<ApiAdminEventSongSubmission[]>(
        `/v1/admin/event-song-submissions?event_id=${encodeURIComponent(esEventId)}`
      )
      .catch(() => [] as ApiAdminEventSongSubmission[])
      .then((rows) => {
        if (!cancelled) setEsSubmissions(rows);
      })
      .finally(() => {
        if (!cancelled) setEsSubmissionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, section, esEventId]);

  useEffect(() => {
    if (cfSelectedUser) return;
    const q = cfUserQuery.trim();
    if (!q) { setCfUserResults([]); return; }
    const t = setTimeout(async () => {
      setCfSearching(true);
      try {
        const rows = await api.get<ApiAdminUser[]>(`/v1/admin/users?q=${encodeURIComponent(q)}`);
        setCfUserResults(rows);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
        setCfUserResults([]);
      } finally {
        setCfSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [cfUserQuery, cfSelectedUser, api]);

  useEffect(() => {
    setCfSongId("");
    setCfDivision("");
    setCfSubmissions(null);
    if (!cfSelectedUser || !cfSessionId) return;
    const eventId = cfSessionObj?.event_id ?? null;
    if (!eventId) { setCfSubmissions([]); return; }
    api.get<ApiEventSongSubmission[]>(
      `/v1/admin/users/${cfSelectedUser.id}/event-song-submissions?event_id=${encodeURIComponent(eventId)}`
    ).then(setCfSubmissions).catch(() => setCfSubmissions([]));
  }, [cfSelectedUser, cfSessionId, cfSessionObj?.event_id, api]);

  useEffect(() => {
    if (!cfSelectedSubmission) return;
    const d = cfSelectedSubmission.division ?? "";
    setCfDivision(cfSessionDivisions.includes(d) ? d : "");
  }, [cfSongId]);

  useEffect(() => {
    if (ufSelected) return;
    const q = ufQuery.trim();
    if (!q) { setUfResults([]); return; }
    const t = setTimeout(async () => {
      setUfSearching(true);
      try {
        const rows = await api.get<typeof ufResults>(`/v1/admin/users?q=${encodeURIComponent(q)}`);
        setUfResults(rows);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      } finally {
        setUfSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [ufQuery, ufSelected, api]);

  useEffect(() => {
    if (!sessions) return;
    const active = sessions.filter(
      (s) => s.status === "checkin_open" || s.status === "in_progress"
    );
    if (active.length === 1 && !lqSessionId) {
      setLqSessionId(active[0]!.id);
    }
  }, [sessions]); // intentionally omit lqSessionId — only auto-select on initial session load

  useEffect(() => {
    if (!lqSessionId) return;
    void loadLiveQueues(lqSessionId);
  }, [lqSessionId, loadLiveQueues]);

  const pairMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of lqPairs) m.set(p.id, p.display_name);
    return m;
  }, [lqPairs]);

  const songMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of lqSongs) {
      m.set(s.id, s.processed_filename?.trim() || s.routine_name?.trim() || s.division?.trim() || s.id);
    }
    return m;
  }, [lqSongs]);

  const esVisibleEvents = useMemo(
    () =>
      esEvents
        .filter(
          (ev) => esShowPast || (ev.status !== "completed" && ev.status !== "cancelled")
        )
        .slice()
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [esEvents, esShowPast]
  );

  const esSubmissionsByDivision = useMemo(() => {
    const map = new Map<string, ApiAdminEventSongSubmission[]>();
    for (const row of esSubmissions) {
      const key = row.division?.trim() || "Unspecified";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === "Unspecified") return 1;
      if (b === "Unspecified") return -1;
      return a.localeCompare(b);
    });
    return keys.map((division) => ({ division, rows: map.get(division)! }));
  }, [esSubmissions]);

  const activeSessionOptions = useMemo(() => {
    if (!sessions) return [];
    const now = new Date();
    return sessions
      .filter((s) => {
        const d = new Date(s.floor_trial_starts_at);
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      })
      .sort((a, b) => {
        const isLive = (s: ApiSession) =>
          s.status === "checkin_open" || s.status === "in_progress";
        if (isLive(a) && !isLive(b)) return -1;
        if (!isLive(a) && isLive(b)) return 1;
        return a.floor_trial_starts_at - b.floor_trial_starts_at;
      });
  }, [sessions]);

  const renderEntityLabel = (row: ApiQueueEntry) => {
    if (row.entityLabel && row.entityLabel !== "—") return row.entityLabel;
    if (row.entityPairId) return pairMap.get(row.entityPairId) ?? row.entityLabel;
    return row.entityLabel;
  };

  const renderSongLabel = (row: ApiQueueEntry) =>
    row.songDisplayName ?? (row.songId ? (songMap.get(row.songId) ?? row.songId) : "—");

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

  const handlePromoteNext = () => {
    const prioritySorted = [...lqPriority].sort((a, b) => a.position - b.position);
    const nonPrioritySorted = [...lqNonPriority].sort((a, b) => a.position - b.position);
    const next = prioritySorted[0] ?? nonPrioritySorted[0];
    if (!next) return;
    return handlePromote(next.queueEntryId);
  };

  const canPromoteNext = lqPriority.length > 0 || lqNonPriority.length > 0;

  const submitCheckinFor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfSelectedUser) { toast.error("Select a user"); return; }
    if (!cfSessionId) { toast.error("Select a session"); return; }
    if (!cfSongId) { toast.error("Select a song"); return; }
    if (!cfDivision) { toast.error("Select a division"); return; }
    setCfSubmitting(true);
    try {
      await api.post("/v1/checkins", {
        sessionId: cfSessionId,
        songId: cfSongId,
        divisionName: cfDivision,
        on_behalf_of_user_id: cfSelectedUser.id,
      });
      const who = [cfSelectedUser.first_name, cfSelectedUser.last_name].filter(Boolean).join(" ") || cfSelectedUser.email;
      toast.success(`Checked in ${who}`);
      setCfSongId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setCfSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">Manager</h1>

      <Tabs value={section}>
        {/* ── Active Sessions (moved from admin Live Queue tab) ── */}
        <TabsContent value="active-sessions" className="mt-4 space-y-5">
          {/* Session selector */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="w-full sm:w-72">
              {sessions === null ? null : activeSessionOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions today.</p>
              ) : (
                <ChoiceGroup
                  ariaLabel="Session"
                  options={activeSessionOptions.map((s) => ({
                    value: s.id,
                    label:
                      formatSessionTitle(s, s.event_timezone) +
                      (s.status === "completed" || s.status === "cancelled"
                        ? ` (${s.status})`
                        : ""),
                  }))}
                  value={lqSessionId}
                  onChange={setLqSessionId}
                />
              )}
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
                        const filename = row.songProcessedFilename ?? undefined;
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
                                {row.divisionName} · {renderSongLabel(row)}
                              </p>
                              {filename && (
                                <p className="text-xs text-muted-foreground/70 break-all font-mono">
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
                          const filename = row.songProcessedFilename ?? undefined;
                          return (
                            <div key={row.queueEntryId} className="flex items-start gap-3">
                              <span className="text-sm font-medium tabular-nums shrink-0 pt-2 w-12 text-right">
                                #{row.position}
                              </span>
                              <div className="border rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5">
                                <p className="font-medium">{renderEntityLabel(row)}</p>
                                <p className="text-muted-foreground truncate">
                                  {row.divisionName} · {renderSongLabel(row)}
                                </p>
                                {filename && (
                                  <p className="text-xs text-muted-foreground/70 break-all font-mono">
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
                          const filename = row.songProcessedFilename ?? undefined;
                          return (
                            <div key={row.queueEntryId} className="flex items-start gap-3">
                              <span className="text-sm font-medium tabular-nums shrink-0 pt-2 w-12 text-right">
                                #{row.position}
                              </span>
                              <div className="border rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5">
                                <p className="font-medium">{renderEntityLabel(row)}</p>
                                <p className="text-muted-foreground truncate">
                                  {row.divisionName} · {renderSongLabel(row)}
                                </p>
                                {filename && (
                                  <p className="text-xs text-muted-foreground/70 break-all font-mono">
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

        {/* ── Event Songs tab ── */}
        <TabsContent value="event-songs" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Event Songs</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="w-full sm:w-96 space-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Label>Event</Label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={esShowPast}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setEsShowPast(next);
                        if (!next) {
                          const sel = esEvents.find((ev) => ev.id === esEventId);
                          if (sel && (sel.status === "completed" || sel.status === "cancelled")) {
                            setEsEventId("");
                          }
                        }
                      }}
                    />
                    Show past events
                  </label>
                </div>
                {esEventsLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : esVisibleEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events to show.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                    {esVisibleEvents.map((ev) => {
                      const active = ev.id === esEventId;
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setEsEventId(active ? "" : ev.id)}
                          className={cn(
                            "w-full h-full rounded-lg border px-4 py-2 text-left transition-colors",
                            active
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <p className="font-medium text-sm">{ev.name}</p>
                          <p className="text-xs text-muted-foreground">{ev.start_date}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {!esEventId ? (
                <p className="text-sm text-muted-foreground">Select an event to view submitted songs.</p>
              ) : esSubmissionsLoading && esSubmissions.length === 0 ? (
                <Skeleton className="h-32 w-full" />
              ) : esSubmissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No songs submitted to this event yet.</p>
              ) : (
                <div className={`space-y-6${esSubmissionsLoading ? " opacity-60" : ""}`}>
                  {esSubmissionsByDivision.map(({ division, rows }) => (
                    <section key={division} className="space-y-2">
                      <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                        {division}
                      </h2>
                      <div className="space-y-2">
                        {rows.map((row) => (
                          <div key={row.id} className="rounded-lg border px-4 py-3 text-sm space-y-0.5">
                            <p className="font-medium">
                              {row.partnership_label}{" "}
                              <span className="font-normal text-muted-foreground">·</span>{" "}
                              {row.song_label}
                            </p>
                            <p className="text-xs text-muted-foreground">{row.submitter_email}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Upload For ── */}
        <TabsContent value="upload-for" className="mt-4 space-y-4">
          {!ufSelected ? (
            <Card>
              <CardHeader><CardTitle>Upload For</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Find the user you're uploading for. The song is created exactly as if they uploaded it themselves.
                </p>
                <Input
                  placeholder="Search by name or email…"
                  value={ufQuery}
                  onChange={(e) => setUfQuery(e.target.value)}
                  autoFocus
                />
                {ufSearching ? (
                  <Skeleton className="h-24 w-full" />
                ) : ufResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {ufQuery.trim() ? "No matches." : "Type a name or email to search."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {ufResults.map((u) => {
                      const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "(no name)";
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setUfSelected(u)}
                          className="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                        >
                          <p className="font-medium">{name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle>
                    Upload For:{" "}
                    {[ufSelected.first_name, ufSelected.last_name].filter(Boolean).join(" ").trim() || ufSelected.email}
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => { setUfSelected(null); setUfResults([]); setUfQuery(""); }}>
                    Change user
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <SongUploadForm
                  variant="self"
                  onBehalf={{
                    userId: ufSelected.id,
                    label: `${[ufSelected.first_name, ufSelected.last_name].filter(Boolean).join(" ").trim() || ufSelected.email}${ufSelected.email ? ` (${ufSelected.email})` : ""}`,
                  }}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── CheckIn For — real on-behalf check-in ── */}
        <TabsContent value="checkin-for" className="mt-4 space-y-4">
          {!cfSelectedUser ? (
            <Card>
              <CardHeader><CardTitle>CheckIn For</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Find the user you&apos;re checking in for. The check-in is recorded exactly as if they did it themselves.
                </p>
                <Input
                  placeholder="Search by name or email…"
                  value={cfUserQuery}
                  onChange={(e) => setCfUserQuery(e.target.value)}
                  autoFocus
                />
                {cfSearching ? (
                  <Skeleton className="h-24 w-full" />
                ) : cfUserResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {cfUserQuery.trim() ? "No matches." : "Type a name or email to search."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {cfUserResults.map((u) => {
                      const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "(no name)";
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setCfSelectedUser(u);
                            setCfUserQuery("");
                            setCfUserResults([]);
                          }}
                          className="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                        >
                          <p className="font-medium">{name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle>
                    CheckIn For:{" "}
                    {[cfSelectedUser.first_name, cfSelectedUser.last_name].filter(Boolean).join(" ").trim() || cfSelectedUser.email}
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCfSelectedUser(null);
                      setCfUserQuery("");
                      setCfSessionId("");
                      setCfSongId("");
                      setCfDivision("");
                      setCfSubmissions(null);
                    }}
                  >
                    Change user
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitCheckinFor} className="space-y-4 max-w-lg">
                  <div>
                    <label className={FIELD_LABEL_CLASS}>Session</label>
                    <ChoiceGroup
                      ariaLabel="Session"
                      options={cfActiveSessions.map((s) => ({
                        value: s.id,
                        label: formatSessionTitle(s, s.event_timezone),
                      }))}
                      value={cfSessionId}
                      onChange={setCfSessionId}
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL_CLASS}>Song</label>
                    {cfSessionObj && !cfSessionObj.event_id ? (
                      <p className="text-sm text-muted-foreground">This session has no event</p>
                    ) : cfSubmissions !== null && cfSubmissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No songs submitted to this event for this user
                      </p>
                    ) : (
                      <ChoiceGroup
                        ariaLabel="Song"
                        options={(cfSubmissions ?? []).map((sub) => ({
                          value: sub.song_id,
                          label: sub.song_label,
                        }))}
                        value={cfSongId}
                        onChange={setCfSongId}
                        disabled={!cfSessionId || cfSubmissions === null}
                      />
                    )}
                  </div>

                  <div>
                    <label className={FIELD_LABEL_CLASS}>Division</label>
                    <ChoiceGroup
                      ariaLabel="Division"
                      options={cfSessionDivisions.map((d) => ({ value: d, label: d }))}
                      value={cfDivision}
                      onChange={setCfDivision}
                      disabled={!cfSessionId || cfSessionDivisions.length === 0}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={
                      cfSubmitting ||
                      !cfSessionId ||
                      !cfSongId ||
                      !cfDivision
                    }
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    {cfSubmitting ? "Checking in…" : "Check in"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
