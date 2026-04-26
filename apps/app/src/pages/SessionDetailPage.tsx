import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useUser } from "@clerk/clerk-react";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SessionDetail = {
  id: string;
  event_id: string | null;
  name: string;
  date: string | null;
  checkin_opens_at: number;
  floor_trial_starts_at: number;
  floor_trial_ends_at: number;
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
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
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
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [active, setActive] = useState<QueueRow[]>([]);
  const [pairs, setPairs] = useState<LeadingPair[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinOpen, setCheckinOpen] = useState(false);

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

  const loadQueue = useCallback(async () => {
    if (!id) return;
    const a = await api.get<QueueRow[]>(`/v1/queue/${id}/active`);
    setActive(a);
  }, [api, id]);

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
    Promise.all([loadSession(), loadQueue(), loadExtras()])
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id, loadExtras, loadQueue, loadSession]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => {
      setNow(Date.now());
      void Promise.all([loadQueue(), loadSession()]).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, [id, loadQueue, loadSession]);

  const divisionsList = useMemo(() => {
    const fromSession = session?.divisions?.map((d) => d.division_name) ?? [];
    return fromSession.filter((n) => n && n !== "Other");
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const first = divisionsList[0] ?? "";
    if (first && !fDivision) setFDivision(first);
  }, [session, divisionsList, fDivision]);

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
      await Promise.all([loadQueue(), loadSession()]);
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
            <h1 className="page-title text-2xl">{session.name}</h1>
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
            <div className="text-sm">
              <div className="font-medium">
                Slot 1 · {renderEntityLabel(slotOne)} · {slotOne.divisionName}
              </div>
              <div className="text-muted-foreground">
                {renderSongLabel(slotOne.songId)}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No one on deck (slot 1 empty).</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground">No upcoming slots.</p>
          )}
          {upcoming.map((r) => (
            <div
              key={r.queueEntryId}
              className="flex items-start gap-3 border rounded-md px-3 py-2.5 text-sm"
            >
              <div className="space-y-0.5 min-w-0">
                <p className="font-medium">#{r.position} · {renderEntityLabel(r)}</p>
                <p className="text-muted-foreground truncate">{r.divisionName} · {renderSongLabel(r.songId)}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Button
          disabled={!canCheckIn}
          onClick={openCheckin}
          size="lg"
          className="w-full sm:w-auto"
        >
          Check in
        </Button>
        {!canCheckIn && session.has_active_checkin && (
          <p className="text-sm text-muted-foreground">
            Already in queue (division: {session.active_checkin_division ?? "?"})
          </p>
        )}
        {!canCheckIn && !checkinWindowOpen && (
          <p className="text-sm text-muted-foreground">
            {now < session.checkin_opens_at
              ? `Check-in opens ${formatTime(session.checkin_opens_at)}`
              : "Check-in closed"}
          </p>
        )}
        {!canCheckIn && checkinWindowOpen && songs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You have no songs uploaded — <a href="/songs" className="underline">add a song first</a>.
          </p>
        )}
        {!canCheckIn && checkinWindowOpen && divisionsList.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No divisions configured for this session.
          </p>
        )}
      </div>

      {checkinOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={closeCheckin}
        >
          <div
            className="rounded-t-2xl sm:rounded-lg border bg-background p-6 shadow-lg w-full sm:max-w-lg max-h-[92vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center -mt-2 mb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

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

              <Button type="submit" disabled={submitting} size="lg" className="w-full">
                {submitting ? "Submitting..." : "Check in"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
