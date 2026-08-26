import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { SignedIn, SignedOut, SignInButton, useAuth, useUser } from "@clerk/clerk-react";
import type { ApiSession, ApiQueueEntry, ApiLeadingPair, ApiSong, ApiEventSongSubmission, ApiMyCheckin } from "@deejaytools/schemas";
import { useApiClient } from "@/api/client";
import { SessionInfoHeader } from "@/components/SessionInfoHeader";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeShort } from "@/lib/sessionFormat";
import { songPartnershipLabel } from "@/lib/entityLabel";

/**
 * Best human-readable label for a song, never falling back to the raw
 * original filename (which is meaningless noise in the UI).
 * Priority: processed filename → routine name → division → "Untitled song"
 */
function songLabel(s: ApiSong): string {
  if (s.processed_filename?.trim()) return s.processed_filename.trim();
  if (s.routine_name?.trim()) return s.routine_name.trim();
  if (s.division?.trim()) return `${s.division.trim()} song`;
  return "Untitled song";
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
  const [myCheckins, setMyCheckins] = useState<ApiMyCheckin[]>([]);
  const [eventSubmissions, setEventSubmissions] = useState<ApiEventSongSubmission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkinOpen, setCheckinOpen] = useState(false);

  // Check-in form — song-first
  const [fSongId, setFSongId] = useState("");
  const [fDivision, setFDivision] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [now, setNow] = useState(Date.now());

  const loadSession = useCallback(() => {
    if (!id) return Promise.resolve(undefined);
    return api.get<ApiSession>(`/v1/sessions/${id}`).then((s) => {
      setSession(s);
      return s;
    });
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

  const loadMyCheckins = useCallback(async () => {
    if (!isSignedIn) {
      setMyCheckins([]);
      return;
    }
    const mine = await api.get<ApiMyCheckin[]>("/v1/checkins/mine");
    setMyCheckins(mine);
  }, [api, isSignedIn]);

  const loadExtras = useCallback(
    async (eventId?: string | null) => {
      // /v1/partners/leading-pairs and /v1/songs both require auth — skip when
      // viewing as a signed-out visitor. The session info and queues stay visible.
      if (!isSignedIn) {
        setPairs([]);
        setSongs([]);
        setMyCheckins([]);
        setEventSubmissions(null);
        return;
      }

      const submissionsPromise =
        eventId != null
          ? api
              .get<ApiEventSongSubmission[]>(
                `/v1/event-song-submissions?event_id=${encodeURIComponent(eventId)}`
              )
              .catch(() => null)
          : Promise.resolve(null);

      const [p, s, subs, mine] = await Promise.all([
        api.get<ApiLeadingPair[]>("/v1/partners/leading-pairs"),
        api.get<ApiSong[]>("/v1/songs"),
        submissionsPromise,
        api.get<ApiMyCheckin[]>("/v1/checkins/mine"),
      ]);
      setPairs(p);
      setSongs(s);
      setEventSubmissions(subs);
      setMyCheckins(mine);
    },
    [api, isSignedIn]
  );

  const refresh = useCallback(() => {
    if (!id) return;
    setLoading(true);
    loadSession()
      .then((loadedSession) =>
        Promise.all([loadQueue(), loadExtras(loadedSession?.event_id ?? null)])
      )
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

  // Songs eligible for check-in — filtered to event submissions when known.
  const checkinSongs = useMemo(() => {
    if (!session?.event_id || eventSubmissions === null) {
      return songs;
    }
    const submittedSongIds = new Set(eventSubmissions.map((s) => s.song_id));
    return songs.filter((s) => submittedSongIds.has(s.id));
  }, [songs, session?.event_id, eventSubmissions]);

  const noEventSongs =
    !!session?.event_id && eventSubmissions !== null && checkinSongs.length === 0;

  // Derived check-in context from the selected song
  const selectedSong = useMemo(
    () => checkinSongs.find((s) => s.id === fSongId) ?? null,
    [checkinSongs, fSongId]
  );

  const derivedPair = useMemo(() => {
    if (!selectedSong?.partner_id) return null;
    return pairByPartnerId.get(selectedSong.partner_id) ?? null;
  }, [selectedSong, pairByPartnerId]);

  const isManaged = !!selectedSong?.managed_partnership_id;
  const isSolo = !selectedSong?.partner_id && !isManaged;

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

  // Ownership comes from /v1/checkins/mine, not the pairs list: leading-pairs is
  // the check-in entity PICKER and deliberately excludes placeholder partners
  // (team / solo / other), which would make every team and exhibition entry look
  // like someone else's.
  const myEntityIds = useMemo(() => {
    const s = new Set<string>();
    for (const ci of myCheckins) {
      if (ci.sessionId !== id) continue;
      if (ci.entityPairId) s.add(ci.entityPairId);
      if (ci.entitySoloUserId) s.add(ci.entitySoloUserId);
      if (ci.entityManagedPartnershipId) s.add(ci.entityManagedPartnershipId);
    }
    return s;
  }, [myCheckins, id]);

  // Find ALL of the current user's active queue entries — one per entity
  // (pair, solo, or managed partnership). A user with multiple partnerships can have several.
  const userQueueEntries = useMemo(() => {
    if (!user?.id) return [];
    return [...active, ...waiting].filter(
      (r) =>
        (r.entityPairId != null && myEntityIds.has(r.entityPairId)) ||
        (r.entityManagedPartnershipId != null &&
          myEntityIds.has(r.entityManagedPartnershipId)) ||
        r.entitySoloUserId === user.id
    );
  }, [active, waiting, myEntityIds, user?.id]);

  const inQueueEntityIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of userQueueEntries) {
      if (r.entityPairId) s.add(r.entityPairId);
      if (r.entitySoloUserId) s.add(r.entitySoloUserId);
      if (r.entityManagedPartnershipId) s.add(r.entityManagedPartnershipId);
    }
    return s;
  }, [userQueueEntries]);

  // True when the entity for the selected song is already in the queue —
  // used to warn the user and block submission.
  const selectedEntityInQueue = useMemo(() => {
    if (!fSongId || !selectedSong) return false;
    if (selectedSong.managed_partnership_id) {
      return inQueueEntityIds.has(selectedSong.managed_partnership_id);
    }
    if (isSolo) return inQueueEntityIds.has(user?.id ?? "");
    const pid = derivedPair?.id;
    if (pid) return inQueueEntityIds.has(pid);
    // Placeholder partner: pair isn't in leading-pairs — resolve via ownership set.
    if (selectedSong.partner_id) {
      for (const eid of myEntityIds) {
        if (!inQueueEntityIds.has(eid)) continue;
        const entry = userQueueEntries.find(
          (r) =>
            r.entityPairId === eid ||
            r.entityManagedPartnershipId === eid ||
            r.entitySoloUserId === eid
        );
        if (entry && songs.find((s) => s.id === entry.songId)?.partner_id === selectedSong.partner_id) {
          return true;
        }
      }
    }
    return false;
  }, [
    fSongId,
    selectedSong,
    isSolo,
    derivedPair?.id,
    inQueueEntityIds,
    myEntityIds,
    userQueueEntries,
    songs,
    user?.id,
  ]);


  const checkinWindowOpen =
    !!session &&
    now >= session.checkin_opens_at &&
    now <= session.floor_trial_ends_at;

  const canCheckIn =
    !!session &&
    checkinWindowOpen &&
    checkinSongs.length > 0;

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
      if (!isManaged && !pairId && selectedSong?.partner_id) {
        const created = await api.post<{ id: string }>("/v1/pairs/find-or-create", {
          partner_id: selectedSong.partner_id,
        });
        pairId = created.id;
      }

      // Exactly one entity field must be non-null or createCheckinBodySchema rejects the request.
      await api.post("/v1/checkins", {
        sessionId: id,
        divisionName: fDivision,
        entityPairId: !isManaged ? pairId : null,
        entityManagedPartnershipId: isManaged
          ? selectedSong!.managed_partnership_id
          : null,
        songId: fSongId,
        notes: fNotes.trim() || undefined,
      });
      toast.success("Checked in");
      setCheckinOpen(false);
      await Promise.all([loadQueue(), loadSession(), loadMyCheckins()]);
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
          {userQueueEntries.length > 0 ? (
            // Show one line per partnership currently in queue.
            <div className="flex flex-col gap-0.5">
              {userQueueEntries.map((entry) => {
                const pos = (() => {
                  const isInActive = active.some((r) => r.queueEntryId === entry.queueEntryId);
                  if (isInActive) return { subQueue: "active" as const, overall: entry.position };
                  if (entry.subQueue === "priority")
                    return { subQueue: "priority" as const, overall: active.length + entry.position };
                  return {
                    subQueue: "standard" as const,
                    overall: active.length + priorityWaiting.length + entry.position,
                  };
                })();
                return (
                  <p key={entry.queueEntryId} className="text-sm">
                    <span className="font-medium">#{pos.overall} in queue</span>
                    <span className="text-muted-foreground">
                      {" "}({pos.subQueue}
                      {entry.divisionName ? `, ${entry.divisionName}` : ""}
                      {userQueueEntries.length > 1 && entry.entityLabel && entry.entityLabel !== "—"
                        ? ` · ${entry.entityLabel}`
                        : ""}
                      )
                    </span>
                  </p>
                );
              })}
            </div>
          ) : !canCheckIn && !checkinWindowOpen ? (
            <p className="text-sm text-muted-foreground">
              {now < session.checkin_opens_at
                ? `Check-in opens ${formatDateTimeShort(session.checkin_opens_at, session.event_timezone)}`
                : "Check-in closed"}
            </p>
          ) : !canCheckIn && checkinWindowOpen && noEventSongs ? (
            <p className="text-sm text-muted-foreground">
              You haven&apos;t added any songs to this event yet.{" "}
              <Link to="/event-submissions" className="underline">
                Submit songs to this event
              </Link>
              .
            </p>
          ) : !canCheckIn && checkinWindowOpen && songs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no songs uploaded —{" "}
              <Link to="/songs/add" className="underline">add a song first</Link>.
            </p>
          ) : null}
        </div>
      </SignedIn>
      <SignedOut>
        <div className="flex flex-wrap items-center gap-3">
          <SignInButton
            forceRedirectUrl={id ? `/sessions/${id}` : "/my-content"}
            signUpForceRedirectUrl={id ? `/sessions/${id}` : "/my-content"}
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

        <SessionInfoHeader session={session} />
      </div>

      {/* ── Check-in action (top) ── */}
      {checkInBlock}

      <p className="text-xs text-muted-foreground -mt-2">
        <Link to="/how-it-works/the-queue" className="hover:underline">
          Learn more about the queue →
        </Link>
      </p>

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

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-lg font-semibold">Check in</h2>
                <Link
                  to="/how-it-works/checking-in"
                  className="text-xs text-muted-foreground hover:underline shrink-0"
                >
                  Why? →
                </Link>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={closeCheckin}>
                ✕
              </Button>
            </div>

            <form onSubmit={submitCheckin} className="space-y-4">
              {/* Song — drives everything else */}
              {noEventSongs ? (
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t added any songs to this event yet.{" "}
                  <Link to="/event-submissions" className="underline">
                    Submit songs to this event
                  </Link>
                  .{" "}
                  <Link
                    to="/how-it-works/troubleshooting"
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Why? →
                  </Link>
                </p>
              ) : (
                <div>
                  <label className={FIELD_LABEL_CLASS}>Song</label>
                  <ChoiceGroup
                    ariaLabel="Song"
                    options={checkinSongs.map((s) => ({
                      value: s.id,
                      label: songLabel(s),
                    }))}
                    value={fSongId}
                    onChange={setFSongId}
                  />
                </div>
              )}

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
                      {isManaged || !isSolo
                        ? songPartnershipLabel(selectedSong, user?.fullName ?? undefined) ?? "—"
                        : <span className="text-muted-foreground italic">Solo</span>}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 shrink-0 pt-px">Song</span>
                    <span className="font-medium break-all">
                      {songLabel(selectedSong)}
                    </span>
                  </div>
                  {selectedEntityInQueue && (
                    <p className="text-xs text-destructive pt-0.5">
                      This partnership is already in the queue. Pick a different song or withdraw your current entry first.{" "}
                      <Link
                        to="/how-it-works/troubleshooting"
                        className="underline font-normal text-destructive/90"
                      >
                        Why? →
                      </Link>
                    </p>
                  )}
                </div>
              )}

              {/* Division — auto-filled from song; user can override if needed */}
              <div>
                <label className={FIELD_LABEL_CLASS}>Division</label>
                <ChoiceGroup
                  ariaLabel="Division"
                  options={sessionDivisions.map((d) => ({ value: d, label: d }))}
                  value={fDivision}
                  onChange={setFDivision}
                />
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

              <Button
                type="submit"
                disabled={submitting || selectedEntityInQueue || noEventSongs}
                size="lg"
                className="w-full"
              >
                {submitting ? "Submitting…" : "Check in"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
