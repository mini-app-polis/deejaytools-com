import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { SignedIn, SignedOut, SignInButton, useAuth, useUser } from "@clerk/clerk-react";
import type { ApiSession, ApiQueueEntry, ApiLeadingPair, ApiSong } from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr, formatDateTimeShort } from "@/lib/sessionFormat";

function derivedStatus(s: ApiSession, now: number): string {
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

export default function ApiSessionPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApiClient();
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const [session, setSession] = useState<ApiSession | null>(null);
  const [active, setActive] = useState<ApiQueueEntry[]>([]);
  const [waiting, setWaiting] = useState<ApiQueueEntry[]>([]);
  const [pairs, setPairs] = useState<ApiLeadingPair[]>([]);
  const [songs, setSongs] = useState<ApiSong[]>([]);
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
    return api.get<ApiSession>(`/v1/sessions/${id}`).then(setSession);
  }, [api, id]);

  const loadQueue = useCallback(async () => {
    if (!id) return;
    const [a, w] = await Promise.all([
      api.get<ApiQueueEntry[]>(`/v1/queue/${id}/active`),
      api.get<ApiQueueEntry[]>(`/v1/queue/${id}/waiting`),
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
      api.get<ApiLeadingPair[]>("/v1/partners/leading-pairs"),
      api.get<ApiSong[]>("/v1/songs"),
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
    }, 60_000);
    return () => clearInterval(t);
  }, [id, loadQueue, loadSession]);

  // Session's division names
  const sessionDivisions = useMemo(
    () => (session?.divisions?.map((d) => d.division_name) ?? []).filter(Boolean),
    [session]
  );

  // Index pairs by partner_b_id for fast lookup
  const pairByPartnerId = useMemo(() => {
    const m = new Map<string, ApiLeadingPair>();
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


  const pairMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pairs) m.set(p.id, p.display_name);
    return m;
  }, [pairs]);

  const renderEntityLabel = (row: ApiQueueEntry): string => {
    // Prefer server-provided partnership label; fall back to the local pair
    // map (only useful for the current user's own pairs) and then to a generic
    // placeholder if no name data is available at all.
    if (row.entityLabel && row.entityLabel !== "—") return row.entityLabel;
    if (row.entityPairId) return pairMap.get(row.entityPairId) ?? row.entityLabel;
    return row.entityLabel;
  };


  // Sorted active queue (slot 1 first). The first item is "on deck right now"
  // and gets a visual highlight inside the Active card.
  const activeSorted = [...active].sort((a, b) => a.position - b.position);

  // Waiting splits into priority and non-priority based on the server-provided
  // subQueue field. Each has its own card.
  const priorityWaiting = waiting.filter((r) => r.subQueue === "priority");
  const standardWaiting = waiting.filter((r) => r.subQueue !== "priority");

  // Find the current user's own queue entry — either as a solo entity or as
  // user A in one of their pairs. Used to show their place in line above the
  // check-in button.
  const userQueueEntry = useMemo(() => {
    if (!user?.id) return null;
    const userPairIds = new Set(pairs.map((p) => p.id));
    return (
      [...active, ...waiting].find(
        (r) =>
          r.entitySoloUserId === user.id ||
          (r.entityPairId !== null && userPairIds.has(r.entityPairId))
      ) ?? null
    );
  }, [active, waiting, pairs, user?.id]);

  // Compute overall queue position counting active first, then priority, then
  // standard — so all priority entries land before any standard ones in the
  // overall ordering.
  const userQueuePosition = useMemo(() => {
    if (!userQueueEntry) return null;
    const isInActive = active.some(
      (r) => r.queueEntryId === userQueueEntry.queueEntryId
    );
    if (isInActive) {
      return { subQueue: "active" as const, overall: userQueueEntry.position };
    }
    if (userQueueEntry.subQueue === "priority") {
      return {
        subQueue: "priority" as const,
        overall: active.length + userQueueEntry.position,
      };
    }
    return {
      subQueue: "standard" as const,
      overall: active.length + priorityWaiting.length + userQueueEntry.position,
    };
  }, [userQueueEntry, active, priorityWaiting]);

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

  // Single source of truth for the check-in button + status text. Rendered at
  // both top (above the queues) and bottom (after the queues) so the action is
  // always reachable, with the same disabled-reason text in both places.
  const checkInBlock = (
    <>
      <SignedIn>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!canCheckIn} onClick={openCheckin} size="lg">
            Check in
          </Button>
          {userQueuePosition ? (
            // Found the user's actual queue entry — show their precise position.
            <p className="text-sm">
              <span className="font-medium">
                #{userQueuePosition.overall} in queue
              </span>
              <span className="text-muted-foreground">
                {" "}({userQueuePosition.subQueue}
                {session.active_checkin_division
                  ? `, ${session.active_checkin_division}`
                  : ""}
                )
              </span>
            </p>
          ) : session.has_active_checkin ? (
            // Server says the user has a check-in but we couldn't find the
            // exact entry locally (e.g. admin submitted on behalf of a synthetic
            // pair). Fall back to the simpler "already in queue" message.
            <p className="text-sm text-muted-foreground">
              Already in queue
              {session.active_checkin_division
                ? ` (division: ${session.active_checkin_division})`
                : ""}
            </p>
          ) : !canCheckIn && !checkinWindowOpen ? (
            <p className="text-sm text-muted-foreground">
              {now < session.checkin_opens_at
                ? `Check-in opens ${formatDateTimeShort(session.checkin_opens_at, session.event_timezone)}`
                : "Check-in closed"}
            </p>
          ) : !canCheckIn && checkinWindowOpen && songs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no songs uploaded —{" "}
              <Link to="/songs" className="underline">add a song first</Link>.
            </p>
          ) : null}
        </div>
      </SignedIn>
      <SignedOut>
        <div className="flex flex-wrap items-center gap-3">
          <SignInButton
            forceRedirectUrl={id ? `/sessions/${id}` : "/partners"}
            signUpForceRedirectUrl={id ? `/sessions/${id}` : "/partners"}
          >
            <Button size="lg">Sign in to check in</Button>
          </SignInButton>
          <p className="text-sm text-muted-foreground">
            Sign in to check in or upload a song.
          </p>
        </div>
      </SignedOut>
    </>
  );

  return (
    <div className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="px-0" asChild>
          <Link to={session.event_id ? `/events/${session.event_id}` : "/floor-trials"}>
            ← Back
          </Link>
        </Button>

        {/* Event name — rendered with the same size/font as the session title
            so it reads as a co-title rather than a small label. */}
        {session.event_name && (
          <h2 className="page-title text-2xl">{session.event_name}</h2>
        )}

        {/* Status badge on the LEFT of the title. */}
        <div className="flex items-center gap-3 flex-wrap">
          {derivedStatusBadge(derivedStatus(session, now))}
          <h1 className="page-title text-2xl">{formatSessionTitle(session, session.event_timezone)}</h1>
          {session.event_timezone && (
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground self-center">
              {formatTimezoneAbbr(session.event_timezone, session.floor_trial_starts_at)}
            </Badge>
          )}
        </div>

        {/* Open / Start / End times as color-coded badges:
            yellow = check-in opens, green = floor trial starts, red = ends.
            Text stays foreground/white; only the background and border carry
            the semantic color so the time itself is easy to read. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-yellow-500/40 bg-yellow-500/15 text-foreground font-normal"
          >
            <span className="opacity-70 mr-1">Open:</span>
            {formatTimeOnly(session.checkin_opens_at, session.event_timezone)}
          </Badge>
          <Badge
            variant="outline"
            className="border-emerald-500/40 bg-emerald-500/15 text-foreground font-normal"
          >
            <span className="opacity-70 mr-1">Start:</span>
            {formatTimeOnly(session.floor_trial_starts_at, session.event_timezone)}
          </Badge>
          <Badge
            variant="outline"
            className="border-red-500/40 bg-red-500/15 text-foreground font-normal"
          >
            <span className="opacity-70 mr-1">End:</span>
            {formatTimeOnly(session.floor_trial_ends_at, session.event_timezone)}
          </Badge>
        </div>

        {/* Priority and standard divisions for this session. */}
        {session.divisions && session.divisions.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {(() => {
              const priorityDivs = session.divisions
                .filter((d) => d.is_priority)
                .map((d) => d.division_name);
              const standardDivs = session.divisions
                .filter((d) => !d.is_priority)
                .map((d) => d.division_name);
              return (
                <>
                  {priorityDivs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-amber-500 dark:text-amber-400 font-medium uppercase tracking-wide mr-1">
                        Priority:
                      </span>
                      {priorityDivs.map((d) => (
                        <Badge
                          key={d}
                          variant="outline"
                          className="border-amber-500/30 text-amber-600 dark:text-amber-300 font-normal"
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {standardDivs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-sky-500 dark:text-sky-400 font-medium uppercase tracking-wide mr-1">
                        Standard:
                      </span>
                      {standardDivs.map((d) => (
                        <Badge
                          key={d}
                          variant="outline"
                          className="border-sky-500/30 text-sky-600 dark:text-sky-300 font-normal"
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Check-in action (top) ── */}
      {checkInBlock}

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
                <div key={r.queueEntryId} className="flex items-start gap-3">
                  <span className="text-sm font-medium tabular-nums shrink-0 pt-2 w-12 text-right">
                    {isSlotOne && <span className="text-primary mr-0.5">▶</span>}
                    #{r.position}
                  </span>
                  <div
                    className={
                      isSlotOne
                        ? "border border-primary/50 bg-primary/10 rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5"
                        : "border rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5"
                    }
                  >
                    <p className="font-medium">{renderEntityLabel(r)}</p>
                    <p className="text-muted-foreground truncate">
                      {r.divisionName}
                    </p>
                    {r.notes && (
                      <p className="text-xs text-muted-foreground italic">
                        Note: {r.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ── Priority + Standard queues — side by side when there's room ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-amber-500 dark:text-amber-400">Priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {priorityWaiting.length === 0 ? (
              <p className="text-sm text-muted-foreground">Priority queue is empty.</p>
            ) : (
              priorityWaiting.map((r, i) => (
                <div key={r.queueEntryId} className="flex items-start gap-3">
                  <span className="text-sm font-medium tabular-nums shrink-0 pt-2 w-12 text-right">
                    #{active.length + i + 1}
                  </span>
                  <div className="border rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5">
                    <p className="font-medium">{renderEntityLabel(r)}</p>
                    <p className="text-muted-foreground truncate">
                      {r.divisionName}
                    </p>
                    {r.notes && (
                      <p className="text-xs text-muted-foreground italic">
                        Note: {r.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-sky-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sky-500 dark:text-sky-400">Standard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {standardWaiting.length === 0 ? (
              <p className="text-sm text-muted-foreground">Standard queue is empty.</p>
            ) : (
              standardWaiting.map((r, i) => (
                <div key={r.queueEntryId} className="flex items-start gap-3">
                  <span className="text-sm font-medium tabular-nums shrink-0 pt-2 w-12 text-right">
                    #{active.length + priorityWaiting.length + i + 1}
                  </span>
                  <div className="border rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5">
                    <p className="font-medium">{renderEntityLabel(r)}</p>
                    <p className="text-muted-foreground truncate">
                      {r.divisionName}
                    </p>
                    {r.notes && (
                      <p className="text-xs text-muted-foreground italic">
                        Note: {r.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Check-in action (bottom) — same block as top ── */}
      {checkInBlock}

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
