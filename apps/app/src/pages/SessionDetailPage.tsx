import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useUser } from "@clerk/clerk-react";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMe } from "@/hooks/useAuthMe";

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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Display-derived status from timestamps. The DB column is decorative; this is what users see. */
function derivedStatus(s: SessionDetail, now: number): string {
  if (now < s.checkin_opens_at) return "scheduled";
  if (now <= s.floor_trial_ends_at) return "open";
  return "ended";
}

function derivedStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return <Badge variant="secondary">{status}</Badge>;
    case "open":
      return (
        <Badge className="bg-green-600 text-white hover:bg-green-600/90 border-transparent">
          {status}
        </Badge>
      );
    case "ended":
      return <Badge variant="outline">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

const FIELD_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

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

  // Plain useState form fields. No useForm, no zodResolver, no FormField.
  const [fEntity, setFEntity] = useState<"pair" | "solo">("pair");
  const [fPairId, setFPairId] = useState("");
  const [fDivision, setFDivision] = useState("");
  const [fSongId, setFSongId] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [now, setNow] = useState(Date.now());

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

  // Poll queues + session, and tick the clock so canCheckIn re-evaluates without a refresh.
  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => {
      setNow(Date.now());
      void Promise.all([loadQueues(), loadSession()]).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, [id, loadQueues, loadSession]);

  const divisionsList = useMemo(() => {
    const fromSession = session?.divisions?.map((d) => d.division_name) ?? [];
    return fromSession.filter((n) => n && n !== "Other");
  }, [session]);

  // Auto-pick the first division in the form when the session loads.
  useEffect(() => {
    if (!session) return;
    const first = divisionsList[0] ?? "";
    if (first && !fDivision) setFDivision(first);
  }, [session, divisionsList, fDivision]);

  // When the user picks a pair, refetch songs scoped to that partner.
  useEffect(() => {
    if (!id) return;
    const pair = fPairId ? pairs.find((p) => p.id === fPairId) : null;
    const q = pair?.partner_b_id
      ? `?partner_id=${encodeURIComponent(pair.partner_b_id)}`
      : "";
    void api
      .get<SongRow[]>(`/v1/songs${q}`)
      .then(setSongs)
      .catch(() => {});
  }, [api, id, fPairId, pairs]);

  // Build lookup maps so we render names instead of UUIDs.
  const songMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of songs) {
      m.set(s.id, s.display_name ?? s.processed_filename ?? s.id);
    }
    return m;
  }, [songs]);

  const pairMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pairs) m.set(p.id, p.display_name);
    return m;
  }, [pairs]);

  const renderEntityLabel = (row: QueueRow): string => {
    if (row.entityPairId) return pairMap.get(row.entityPairId) ?? "Pair";
    if (row.entitySoloUserId) return "Solo dancer";
    return "Entity";
  };

  const renderSongLabel = (songId: string): string => songMap.get(songId) ?? songId;

  const slotOne = active.find((r) => r.position === 1);
  const upcoming = active
    .filter((r) => r.position > 1)
    .sort((a, b) => a.position - b.position);

  const depth = session?.queue_depth ?? { priority: 0, non_priority: 0, active: 0 };
  const promotePriorityDisabled =
    depth.active >= (session?.active_priority_max ?? 6);
  const promoteNonPriorityDisabled =
    depth.priority > 0 || depth.active >= (session?.active_non_priority_max ?? 4);

  // Time-based check-in gate matches what the API enforces.
  const checkinWindowOpen =
    !!session &&
    now >= session.checkin_opens_at &&
    now <= session.floor_trial_ends_at;

  const canCheckIn =
    !!session &&
    checkinWindowOpen &&
    session.has_active_checkin !== true &&
    songs.length > 0 &&
    divisionsList.length > 0;

  const queueAction = async (path: string, body: unknown) => {
    try {
      await api.post(path, body);
      toast.success("Updated");
      await loadQueues();
      await loadSession();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      if (msg.toLowerCase().includes("conflict") || msg.toLowerCase().includes("retry")) {
        toast.error(`${msg} — retry?`);
      } else {
        toast.error(msg);
      }
    }
  };

  const openCheckin = () => {
    setFEntity("pair");
    setFPairId("");
    setFDivision(divisionsList[0] ?? "");
    setFSongId("");
    setFNotes("");
    setCheckinOpen(true);
  };

  const closeCheckin = () => setCheckinOpen(false);

  const submitCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user?.id) return;

    if (!fDivision.trim()) {
      toast.error("Pick a division");
      return;
    }
    if (!fSongId) {
      toast.error("Pick a song");
      return;
    }
    if (fEntity === "pair" && !fPairId) {
      toast.error("Pick a pair");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/v1/checkins", {
        sessionId: id,
        divisionName: fDivision.trim(),
        entityPairId: fEntity === "pair" ? fPairId : null,
        entitySoloUserId: fEntity === "solo" ? user.id : null,
        songId: fSongId,
        notes: fNotes.trim() || undefined,
      });
      toast.success("Checked in");
      setCheckinOpen(false);
      await Promise.all([loadQueues(), loadSession()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Check-in failed";
      if (msg.includes("already has a live")) {
        toast.error("You're already in the queue for this session.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

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
              {formatTime(session.floor_trial_starts_at)} –{" "}
              {formatTime(session.floor_trial_ends_at)}
            </p>
          </div>
          {derivedStatusBadge(derivedStatus(session, now))}
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
                <div className="font-medium">
                  Slot 1 · {renderEntityLabel(slotOne)} · {slotOne.divisionName}
                </div>
                <div className="text-muted-foreground">
                  {renderSongLabel(slotOne.songId)}
                </div>
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
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">No upcoming slots.</p>
          )}
          {upcoming.map((r) => (
            <div
              key={r.queueEntryId}
              className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
            >
              <span>
                #{r.position} · {renderEntityLabel(r)} · {r.divisionName} ·{" "}
                {renderSongLabel(r.songId)}
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
                    #{r.position} · {renderEntityLabel(r)} · {r.divisionName} ·{" "}
                    {renderSongLabel(r.songId)}
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
                    #{r.position} · {renderEntityLabel(r)} · {r.divisionName} ·{" "}
                    {renderSongLabel(r.songId)}
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

      <div className="flex items-center gap-3">
        <Button disabled={!canCheckIn} onClick={openCheckin}>
          Check in
        </Button>
        {!canCheckIn && session.has_active_checkin && (
          <span className="text-xs text-muted-foreground">
            Already in queue (division: {session.active_checkin_division ?? "?"})
          </span>
        )}
        {!canCheckIn && !checkinWindowOpen && (
          <span className="text-xs text-muted-foreground">
            {now < session.checkin_opens_at
              ? `Check-in opens ${formatTime(session.checkin_opens_at)}`
              : "Check-in closed"}
          </span>
        )}
        {!canCheckIn && checkinWindowOpen && songs.length === 0 && (
          <span className="text-xs text-muted-foreground">
            You have no songs uploaded — add a song first.
          </span>
        )}
        {!canCheckIn && checkinWindowOpen && divisionsList.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No divisions configured for this session.
          </span>
        )}
      </div>

      {checkinOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeCheckin}
        >
          <div
            className="rounded-lg border bg-background p-6 shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Check in</h2>
              <Button type="button" variant="ghost" size="sm" onClick={closeCheckin}>
                ✕
              </Button>
            </div>
            <form onSubmit={submitCheckin} className="space-y-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>Dancing as</label>
                <select
                  className={FIELD_INPUT_CLASS}
                  value={fEntity}
                  onChange={(e) => {
                    const v = e.target.value as "pair" | "solo";
                    setFEntity(v);
                    if (v === "solo") setFPairId("");
                  }}
                >
                  <option value="pair">Pair</option>
                  <option value="solo">Solo</option>
                </select>
              </div>

              {fEntity === "pair" && (
                <div>
                  <label className={FIELD_LABEL_CLASS}>Pair</label>
                  <select
                    className={FIELD_INPUT_CLASS}
                    value={fPairId}
                    onChange={(e) => setFPairId(e.target.value)}
                  >
                    <option value="">Select pair</option>
                    {pairs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                  {pairs.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      You have no leading pairs. Set one up under Partners first.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className={FIELD_LABEL_CLASS}>Division</label>
                <select
                  className={FIELD_INPUT_CLASS}
                  value={fDivision}
                  onChange={(e) => setFDivision(e.target.value)}
                >
                  <option value="">Select division</option>
                  {divisionsList.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={FIELD_LABEL_CLASS}>Song</label>
                <select
                  className={FIELD_INPUT_CLASS}
                  value={fSongId}
                  onChange={(e) => setFSongId(e.target.value)}
                >
                  <option value="">Select song</option>
                  {songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name ?? s.processed_filename ?? s.id}
                    </option>
                  ))}
                </select>
                {songs.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No songs found. Upload a song first.
                  </p>
                )}
              </div>

              <div>
                <label className={FIELD_LABEL_CLASS}>Notes (optional)</label>
                <textarea
                  className={FIELD_INPUT_CLASS}
                  rows={2}
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  placeholder="Any special instructions for the deejay"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}