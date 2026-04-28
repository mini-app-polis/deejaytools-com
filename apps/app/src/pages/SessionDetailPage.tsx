import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { SignedIn, SignedOut, SignInButton, useAuth, useUser } from "@clerk/clerk-react";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSessionTitle, formatTimeOnly } from "@/lib/sessionFormat";

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
  subQueue?: "priority" | "non_priority";
};

type LeadingPair = {
  id: string;
  partner_b_id: string | null;
  display_name: string;
};

type SongRow = {
  id: string;
  display_name: string | null;
  processed_filename: string | null;
  division: string | null;
  partner_id: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
};

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
  const { isSignedIn } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [active, setActive] = useState<QueueRow[]>([]);
  const [waiting, setWaiting] = useState<QueueRow[]>([]);
  const [pairs, setPairs] = useState<LeadingPair[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinOpen, setCheckinOpen] = useState(false);

  // Check-in form — song-first
  const [fSongId, setFSongId] = useState("");
  const [fDivision, setFDivision] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [now, setNow] = useState(Date.now());

  const loadSession = useCallback(() => {
    if (!id) return;
    return api.get<SessionDetail>(`/v1/sessions/${id}`).then(setSession);
  }, [api, id]);

  const loadQueue = useCallback(async () => {
    if (!id) return;
    const [a, w] = await Promise.all([
      api.get<QueueRow[]>(`/v1/queue/${id}/active`),
      api.get<QueueRow[]>(`/v1/queue/${id}/waiting`),
    ]);
    setActive(a);
    setWaiting(w);
  }, [api, id]);

  const loadExtras = useCallback(async () => {
    // /v1/partners/leading-pairs and /v1/songs both require auth — skip when
    // viewing as a signed-out visitor. The session info and queues stay visible.
    if (!isSignedIn) {
      setPairs([]);
      setSongs([]);
      return;
    }
    const [p, s] = await Promise.all([
      api.get<LeadingPair[]>("/v1/partners/leading-pairs"),
      api.get<SongRow[]>("/v1/songs"),
    ]);
    setPairs(p);
    setSongs(s);
  }, [api, isSignedIn]);

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

  // Session's division names
  const sessionDivisions = useMemo(
    () => (session?.divisions?.map((d) => d.division_name) ?? []).filter(Boolean),
    [session]
  );

  // Index pairs by partner_b_id for fast lookup
  const pairByPartnerId = useMemo(() => {
    const m = new Map<string, LeadingPair>();
    for (const p of pairs) {
      if (p.partner_b_id) m.set(p.partner_b_id, p);
    }
    return m;
  }, [pairs]);

  // Derived check-in context from the selected song
  const selectedSong = useMemo(
    () => songs.find((s) => s.id === fSongId) ?? null,
    [songs, fSongId]
  );

  const derivedPair = useMemo(() => {
    if (!selectedSong?.partner_id) return null;
    return pairByPartnerId.get(selectedSong.partner_id) ?? null;
  }, [selectedSong, pairByPartnerId]);

  const isSolo = !selectedSong?.partner_id;

  const divisionInSession = fDivision ? sessionDivisions.includes(fDivision) : false;

  // When a song is selected, auto-fill division from song if it matches session
  useEffect(() => {
    if (!selectedSong) return;
    const songDiv = selectedSong.division ?? "";
    if (songDiv && sessionDivisions.includes(songDiv)) {
      setFDivision(songDiv);
    } else if (songDiv) {
      // Song division not in this session — clear so user must pick
      setFDivision("");
    }
  }, [selectedSong, sessionDivisions]);

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

  // Sorted active queue (slot 1 first). The first item is "on deck right now"
  // and gets a visual highlight inside the Active card.
  const activeSorted = [...active].sort((a, b) => a.position - b.position);

  // Waiting splits into priority and non-priority based on the server-provided
  // subQueue field. Each has its own card.
  const priorityWaiting = waiting.filter((r) => r.subQueue === "priority");
  const standardWaiting = waiting.filter((r) => r.subQueue !== "priority");

  const checkinWindowOpen =
    !!session &&
    now >= session.checkin_opens_at &&
    now <= session.floor_trial_ends_at;

  const canCheckIn =
    !!session &&
    checkinWindowOpen &&
    session.has_active_checkin !== true &&
    songs.length > 0;

  const openCheckin = () => {
    setFSongId("");
    setFDivision("");
    setFNotes("");
    setCheckinOpen(true);
  };

  const closeCheckin = () => setCheckinOpen(false);

  const submitCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user?.id) return;

    if (!fSongId) {
      toast.error("Pick a song");
      return;
    }
    if (!fDivision) {
      toast.error("Pick a division");
      return;
    }
    setSubmitting(true);
    try {
      // If the song has a partner but no pair row exists yet, create it transparently
      let pairId: string | null = derivedPair?.id ?? null;
      if (!isSolo && !pairId && selectedSong?.partner_id) {
        const created = await api.post<{ id: string }>("/v1/pairs/find-or-create", {
          partner_id: selectedSong.partner_id,
        });
        pairId = created.id;
      }

      await api.post("/v1/checkins", {
        sessionId: id,
        divisionName: fDivision,
        entityPairId: !isSolo ? pairId : null,
        entitySoloUserId: isSolo ? user.id : null,
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
          <Link to={session.event_id ? `/events/${session.event_id}` : "/events"}>← Back</Link>
        </Button>
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="page-title text-2xl">{formatSessionTitle(session)}</h1>
            <p className="text-sm text-muted-foreground">
              Open {formatTimeOnly(session.checkin_opens_at)} · Floor trial{" "}
              {formatTimeOnly(session.floor_trial_starts_at)} –{" "}
              {formatTimeOnly(session.floor_trial_ends_at)}
            </p>
          </div>
          {derivedStatusBadge(derivedStatus(session, now))}
        </div>
      </div>

      {/* ── Active queue ── */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-primary">Active</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {activeSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one on deck.</p>
          ) : (
            activeSorted.map((r) => {
              const isSlotOne = r.position === 1;
              return (
                <div
                  key={r.queueEntryId}
                  className={
                    isSlotOne
                      ? "flex items-start gap-3 border border-primary/50 bg-primary/10 rounded-md px-3 py-2.5 text-sm"
                      : "flex items-start gap-3 border rounded-md px-3 py-2.5 text-sm"
                  }
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-medium">
                      {isSlotOne && <span className="text-primary mr-1.5">▶</span>}
                      #{r.position} · {renderEntityLabel(r)}
                    </p>
                    <p className="text-muted-foreground truncate">
                      {r.divisionName} · {renderSongLabel(r.songId)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ── Priority queue ── */}
      <Card className="border-amber-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-amber-500 dark:text-amber-400">Priority</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {priorityWaiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">Priority queue is empty.</p>
          ) : (
            priorityWaiting.map((r, i) => (
              <div
                key={r.queueEntryId}
                className="flex items-start gap-3 border rounded-md px-3 py-2.5 text-sm"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="font-medium">#{i + 1} · {renderEntityLabel(r)}</p>
                  <p className="text-muted-foreground truncate">
                    {r.divisionName} · {renderSongLabel(r.songId)}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Standard queue ── */}
      <Card className="border-sky-500/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sky-500 dark:text-sky-400">Standard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {standardWaiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">Standard queue is empty.</p>
          ) : (
            standardWaiting.map((r, i) => (
              <div
                key={r.queueEntryId}
                className="flex items-start gap-3 border rounded-md px-3 py-2.5 text-sm"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="font-medium">#{i + 1} · {renderEntityLabel(r)}</p>
                  <p className="text-muted-foreground truncate">
                    {r.divisionName} · {renderSongLabel(r.songId)}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <SignedIn>
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
                ? `Check-in opens at ${formatTimeOnly(session.checkin_opens_at)}`
                : "Check-in closed"}
            </p>
          )}
          {!canCheckIn && checkinWindowOpen && songs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              You have no songs uploaded —{" "}
              <Link to="/songs" className="underline">add a song first</Link>.
            </p>
          )}
        </div>
      </SignedIn>
      <SignedOut>
        <div className="space-y-2">
          <SignInButton
            forceRedirectUrl={id ? `/sessions/${id}` : "/partners"}
            signUpForceRedirectUrl={id ? `/sessions/${id}` : "/partners"}
          >
            <Button size="lg" className="w-full sm:w-auto">
              Sign in to check in
            </Button>
          </SignInButton>
          <p className="text-sm text-muted-foreground">
            You can browse this session as a visitor. Sign in to check in or upload a song.
          </p>
        </div>
      </SignedOut>

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
              {/* Song — drives everything else */}
              <div>
                <label className={FIELD_LABEL_CLASS}>Song</label>
                <select
                  className={FIELD_INPUT_CLASS}
                  value={fSongId}
                  onChange={(e) => setFSongId(e.target.value)}
                  autoFocus
                >
                  <option value="">Select a song…</option>
                  {songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name ?? s.processed_filename ?? s.id}
                      {s.division ? ` · ${s.division}` : ""}
                      {s.partner_first_name
                        ? ` · ${s.partner_first_name} ${s.partner_last_name ?? ""}`.trimEnd()
                        : " · Solo"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Confirmation card — shown once a song is selected */}
              {fSongId && selectedSong && (
                <div className="rounded-md border bg-muted/40 px-3 py-3 text-sm space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 shrink-0 pt-px">You</span>
                    <span className="font-medium">
                      {user?.fullName ?? user?.firstName ?? "You"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 shrink-0 pt-px">Partner</span>
                    <span className="font-medium">
                      {isSolo
                        ? <span className="text-muted-foreground italic">Solo</span>
                        : selectedSong.partner_first_name
                        ? `${selectedSong.partner_first_name} ${selectedSong.partner_last_name ?? ""}`.trimEnd()
                        : "—"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 shrink-0 pt-px">Song</span>
                    <span className="font-medium truncate">
                      {selectedSong.display_name ?? selectedSong.processed_filename ?? selectedSong.id}
                    </span>
                  </div>
                </div>
              )}

              {/* Division — auto-filled from song; user can override if needed */}
              <div>
                <label className={FIELD_LABEL_CLASS}>Division</label>
                <select
                  className={FIELD_INPUT_CLASS}
                  value={fDivision}
                  onChange={(e) => setFDivision(e.target.value)}
                >
                  <option value="">Select division…</option>
                  {sessionDivisions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                      {selectedSong?.division === d ? " ✓" : ""}
                    </option>
                  ))}
                </select>
                {selectedSong?.division && !divisionInSession && (
                  <p className="text-xs text-amber-600 mt-1">
                    Your song's division ({selectedSong.division}) isn't offered in this session.
                    Please pick the closest match above.
                  </p>
                )}
              </div>

              {/* Notes */}
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
                {submitting ? "Submitting…" : "Check in"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
