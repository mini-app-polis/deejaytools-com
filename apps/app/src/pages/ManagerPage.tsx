import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  DIVISIONS,
  type ApiQueueEntry,
  type ApiLeadingPair,
  type ApiSession,
  type ApiSong,
  type ApiTestInjection,
} from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import SongUploadForm from "@/components/SongUploadForm";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { formatSessionTitle } from "@/lib/sessionFormat";
import { compareSessionChrono } from "@/lib/chronoSort";

const DIVISION_OPTIONS = DIVISIONS;
const FIELD_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

function randomFourDigitTag(): string {
  return Math.floor(Math.random() * 10000).toString().padStart(4, "0");
}
function randomDivision(): string {
  return DIVISION_OPTIONS[Math.floor(Math.random() * DIVISION_OPTIONS.length)];
}
function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export const MANAGER_SECTIONS = ["active-sessions", "upload-for", "checkin-for"] as const;
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

  const [tiSessionId, setTiSessionId] = useState("");
  const [tiDivision, setTiDivision] = useState<string>(() => randomDivision());
  const [tiLeaderFirst, setTiLeaderFirst] = useState("Leader");
  const [tiLeaderLast, setTiLeaderLast] = useState(() => randomFourDigitTag());
  const [tiFollowerFirst, setTiFollowerFirst] = useState("Follower");
  const [tiFollowerLast, setTiFollowerLast] = useState(() => randomFourDigitTag());
  const [tiSubmitting, setTiSubmitting] = useState(false);
  const [tiData, setTiData] = useState<ApiTestInjection[] | null>(null);
  const [tiDeleting, setTiDeleting] = useState(false);
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);

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

  const loadCheckins = useCallback(async () => {
    try {
      const data = await api.get<ApiTestInjection[]>("/v1/admin/checkins/test");
      setTiData(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load check-ins");
    }
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

  useEffect(() => {
    loadSessions();
    void loadLqExtras().catch(() => {});
    void loadCheckins().catch(() => {});
  }, [loadSessions, loadLqExtras, loadCheckins]);

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

  const songFilenameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of lqSongs) {
      if (s.processed_filename) m.set(s.id, s.processed_filename);
    }
    return m;
  }, [lqSongs]);

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

  const submitCheckin = async (e: React.FormEvent) => {
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
      toast.success(
        `Checked in to ${result.initialQueue === "priority" ? "priority" : "non-priority"} queue`
      );
      setTiLeaderFirst("Leader");
      setTiLeaderLast(randomFourDigitTag());
      setTiFollowerFirst("Follower");
      setTiFollowerLast(randomFourDigitTag());
      setTiDivision(randomDivision());
      void loadCheckins().catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setTiSubmitting(false);
    }
  };

  const confirmDeleteAll = async () => {
    setPendingDeleteAll(false);
    if (!tiData) return;
    setTiDeleting(true);
    const expectedCount = tiData.length;
    try {
      await api.del("/v1/admin/checkins/test");
      toast.success(`Deleted ${expectedCount} check-in${expectedCount === 1 ? "" : "s"}`);
      setTiData([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setTiDeleting(false);
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

        {/* ── CheckIn For (moved from the admin Test Inject tab) ── */}
        <TabsContent value="checkin-for" className="mt-4 space-y-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Creates throwaway user/partner/pair rows and uses a placeholder song.
            Skips the check-in time window. Each submission adds one entry to the selected session's queue.
          </div>
          <form onSubmit={submitCheckin} className="space-y-4 max-w-lg">
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
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL_CLASS}>Leader first name</label>
                <input className={FIELD_INPUT_CLASS} value={tiLeaderFirst}
                  onChange={(e) => setTiLeaderFirst(e.target.value)} />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Leader last name</label>
                <input className={FIELD_INPUT_CLASS} value={tiLeaderLast}
                  onChange={(e) => setTiLeaderLast(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL_CLASS}>Follower first name</label>
                <input className={FIELD_INPUT_CLASS} value={tiFollowerFirst}
                  onChange={(e) => setTiFollowerFirst(e.target.value)} />
              </div>
              <div>
                <label className={FIELD_LABEL_CLASS}>Follower last name</label>
                <input className={FIELD_INPUT_CLASS} value={tiFollowerLast}
                  onChange={(e) => setTiFollowerLast(e.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={tiSubmitting} size="lg" className="w-full sm:w-auto">
              {tiSubmitting ? "Checking in…" : "Check in"}
            </Button>
          </form>

          <section className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-base font-semibold">
                Existing check-ins
                {tiData !== null && (
                  <span className="ml-2 text-sm text-muted-foreground font-normal">
                    ({tiData.length})
                  </span>
                )}
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm"
                  onClick={() => void loadCheckins()} disabled={tiDeleting}>
                  Refresh
                </Button>
                <Button variant="destructive" size="sm"
                  onClick={() => { if (tiData && tiData.length > 0) setPendingDeleteAll(true); }}
                  disabled={tiDeleting || !tiData || tiData.length === 0}>
                  {tiDeleting ? "Deleting…" : "Delete all"}
                </Button>
              </div>
            </div>

            {tiData === null ? (
              <Skeleton className="h-24 w-full" />
            ) : tiData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No check-ins yet.</p>
            ) : (
              <div className="space-y-2">
                {tiData.map((row) => {
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
      </Tabs>

      <Dialog open={pendingDeleteAll}
        onOpenChange={(open: boolean) => { if (!open) setPendingDeleteAll(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all check-ins?</DialogTitle>
            <DialogDescription>
              This will remove {tiData?.length ?? 0} check-in{(tiData?.length ?? 0) === 1 ? "" : "s"} —
              synthetic users, partners, pairs, check-ins, and queue entries. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteAll(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteAll()}>Delete all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
