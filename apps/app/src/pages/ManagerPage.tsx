import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { DIVISIONS, type ApiSession, type ApiTestInjection } from "@deejaytools/schemas";
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

export const MANAGER_SECTIONS = ["upload-for", "checkin-for"] as const;
export type ManagerSection = (typeof MANAGER_SECTIONS)[number];
const DEFAULT_MANAGER_SECTION: ManagerSection = "checkin-for";

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

  useEffect(() => {
    loadSessions();
    void loadCheckins().catch(() => {});
  }, [loadSessions, loadCheckins]);

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
        {/* ── Upload For (placeholder) ── */}
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
