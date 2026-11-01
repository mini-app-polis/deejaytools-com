import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { SignedIn, SignedOut, SignInButton, useAuth, useUser } from "@clerk/clerk-react";
import type { ApiLeadingPair, ApiQueueEntry } from "@/schemas";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { SessionInfoHeader } from "@/components/SessionInfoHeader";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toastFirstError } from "@/lib/formErrors";
import { formatDateTimeShort } from "@/lib/sessionFormat";
import { songLabel } from "@/lib/songLabel";

const FIELD_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

/** How often the queues and the session refresh on their own. */
const QUEUE_POLL_MS = 60_000;

// A stable empty list while a query has no data, so memos over it hold.
const NO_ROWS: readonly never[] = [];
/** The longest the check-in clock goes without a tick. */
const CLOCK_MAX_WAIT_MS = 60_000;

const checkinSchema = z.object({
  songId: z.string().min(1, "Pick a song"),
  division: z.string().min(1, "Pick a division"),
  notes: z.string(),
});
type CheckinForm = z.infer<typeof checkinSchema>;
const EMPTY_CHECKIN: CheckinForm = { songId: "", division: "", notes: "" };

export default function ApiSessionPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const [checkinOpen, setCheckinOpen] = useState(false);

  // Check-in form — song-first
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting: submitting },
  } = useForm<CheckinForm>({ resolver: zodResolver(checkinSchema), defaultValues: EMPTY_CHECKIN });
  const fSongId = watch("songId");
  const fDivision = watch("division");

  const [now, setNow] = useState(Date.now());

  // The session and its queues are public and refresh on their own.
  const polled = { params: { sessionId: id ?? "" }, enabled: !!id, refetchInterval: QUEUE_POLL_MS };
  const sessionQuery = useEndpointQuery(endpoints.sessions.get, {
    params: { id: id ?? "" },
    enabled: !!id,
    refetchInterval: QUEUE_POLL_MS,
  });
  const activeQuery = useEndpointQuery(endpoints.queue.active, polled);
  const waitingQuery = useEndpointQuery(endpoints.queue.waiting, polled);
  const session = sessionQuery.data ?? null;
  const active = activeQuery.data ?? NO_ROWS;
  const waiting = waitingQuery.data ?? NO_ROWS;
  const polledQueries = [sessionQuery, activeQuery, waitingQuery];
  const loading = polledQueries.some((q) => q.isLoading);
  // A failed refresh leaves what was loaded on screen and says so.
  const pollFailed = polledQueries.some((q) => q.isError && q.data !== undefined);
  const poll = () => polledQueries.forEach((q) => void q.refetch());

  // /v1/partners/leading-pairs, /v1/songs and /v1/checkins/mine all require
  // auth — skipped for a signed-out visitor. The session info and queues stay visible.
  const signedIn = !!isSignedIn;
  const pairsQuery = useEndpointQuery(endpoints.partners.leadingPairs, { enabled: signedIn });
  const songsQuery = useEndpointQuery(endpoints.songs.list, { enabled: signedIn });
  const myCheckinsQuery = useEndpointQuery(endpoints.checkins.mine, { enabled: signedIn });
  const eventId = session?.event_id ?? null;
  const submissionsQuery = useEndpointQuery(endpoints.eventSongSubmissions.list, {
    params: { eventId: eventId ?? "" },
    enabled: signedIn && eventId !== null,
  });
  const pairs = (signedIn && pairsQuery.data) || NO_ROWS;
  const songs = (signedIn && songsQuery.data) || NO_ROWS;
  const myCheckins = (signedIn && myCheckinsQuery.data) || NO_ROWS;
  // null when unknown, including when they fail to load: the picker then offers
  // every song and the API decides.
  const eventSubmissions = (signedIn && eventId !== null && submissionsQuery.data) || null;
  const yourDataQueries = [pairsQuery, songsQuery, myCheckinsQuery];
  const yourDataError = signedIn
    ? (yourDataQueries.find((q) => q.error && q.data === undefined)?.error ?? null)
    : null;

  const createPair = useEndpointMutation(endpoints.pairs.findOrCreate, {
    invalidates: [endpoints.partners.leadingPairs],
  });
  const createCheckin = useEndpointMutation(endpoints.checkins.create, {
    invalidates: [endpoints.queue.active, endpoints.queue.waiting, endpoints.sessions.get, endpoints.checkins.mine],
  });

  // The clock behind the check-in window. It ticks at the window's next edge
  // (check-in opening, or the floor trial ending), so Check in turns on or off
  // as that moment passes, and at least every CLOCK_MAX_WAIT_MS otherwise. A
  // tab coming back into view catches up at once, since browsers delay timers
  // in hidden tabs.
  const opensAt = session?.checkin_opens_at;
  const endsAt = session?.floor_trial_ends_at;
  useEffect(() => {
    const edge = [opensAt, endsAt === undefined ? undefined : endsAt + 1].find(
      (t): t is number => t !== undefined && t > now
    );
    const wait = edge === undefined ? CLOCK_MAX_WAIT_MS : Math.min(edge - now, CLOCK_MAX_WAIT_MS);
    const t = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(t);
  }, [now, opensAt, endsAt]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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

  // Where "Submit songs to this event" goes: this session's event page, falling
  // back to the picker for event-less sessions.
  const submitSongsHref = session?.event_id
    ? `/event-submissions/${session.event_id}`
    : "/event-submissions";

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
      setValue("division", songDiv);
    } else if (songDiv) {
      // Song division not in this session — clear so user must pick
      setValue("division", "");
    }
  }, [selectedSong, sessionDivisions, setValue]);


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

  // Entities the caller's linked partner checked in: the caller sees them in
  // /v1/checkins/mine but cannot withdraw them.
  const partnerCheckedInEntityIds = useMemo(() => {
    const s = new Set<string>();
    for (const ci of myCheckins) {
      if (ci.sessionId !== id || ci.canWithdraw) continue;
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

  // The entity for the selected song when it is already in the queue (null
  // otherwise) — the page then warns the user and blocks submission.
  const selectedQueuedEntityId = useMemo((): string | null => {
    if (!fSongId || !selectedSong) return null;
    const queued = (eid: string | null | undefined) =>
      eid && inQueueEntityIds.has(eid) ? eid : null;
    if (selectedSong.managed_partnership_id) {
      return queued(selectedSong.managed_partnership_id);
    }
    if (isSolo) return queued(user?.id);
    const pid = derivedPair?.id;
    if (pid) return queued(pid);
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
          return eid;
        }
      }
    }
    return null;
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
  const selectedEntityInQueue = selectedQueuedEntityId != null;
  const selectedEntityCheckedInByPartner =
    selectedQueuedEntityId != null && partnerCheckedInEntityIds.has(selectedQueuedEntityId);


  const checkinWindowOpen =
    !!session &&
    now >= session.checkin_opens_at &&
    now <= session.floor_trial_ends_at;

  const canCheckIn =
    !!session &&
    checkinWindowOpen &&
    checkinSongs.length > 0;

  const openCheckin = () => {
    reset(EMPTY_CHECKIN);
    setCheckinOpen(true);
  };

  const closeCheckin = () => setCheckinOpen(false);

  // Without a session id or a signed-in dancer the form says nothing.
  const refuseCheckin = (errors: FieldErrors<CheckinForm>) => {
    if (id && user?.id) toastFirstError(errors);
  };

  const submitCheckin = async ({ songId, division, notes }: CheckinForm) => {
    if (!id || !user?.id) return;
    try {
      // If the song has a partner but no pair row exists yet, create it transparently
      let pairId: string | null = derivedPair?.id ?? null;
      if (!isManaged && !pairId && selectedSong?.partner_id) {
        const created = await createPair.mutateAsync({ body: {
          partner_id: selectedSong.partner_id,
        } });
        pairId = created.id;
      }

      // Exactly one entity field must be non-null or createCheckinBodySchema rejects the request.
      await createCheckin.mutateAsync({ body: {
        sessionId: id,
        divisionName: division,
        entityPairId: !isManaged ? pairId : null,
        entityManagedPartnershipId: isManaged
          ? selectedSong!.managed_partnership_id
          : null,
        songId,
        notes: notes.trim() || undefined,
      } });
      toast.success("Checked in");
      setCheckinOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Check-in failed";
      if (msg.includes("already has a live")) {
        toast.error("You're already in the queue for this session.");
      } else {
        toast.error(msg);
      }
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
    // An ApiError carries the HTTP status; a 404 is an answer, not a failure.
    const notFound = (sessionQuery.error as { status?: number } | null)?.status === 404;
    if (sessionQuery.error && !notFound) {
      return <QueryError what="the session" error={sessionQuery.error} onRetry={() => void sessionQuery.refetch()} />;
    }
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
                    {((entry.entityPairId != null &&
                      partnerCheckedInEntityIds.has(entry.entityPairId)) ||
                      (entry.entityManagedPartnershipId != null &&
                        partnerCheckedInEntityIds.has(entry.entityManagedPartnershipId))) && (
                      <span className="text-muted-foreground"> · checked in by your partner</span>
                    )}
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
              <Link to={submitSongsHref} className="underline">
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

      {yourDataError && (
        <QueryError
          what="your songs and check-ins"
          error={yourDataError}
          onRetry={() => yourDataQueries.forEach((q) => q.error && void q.refetch())}
        />
      )}

      {pollFailed && (
        <p role="status" className="text-sm text-amber-600 dark:text-amber-400 -mt-2">
          Couldn&apos;t refresh the queue; it may be out of date. Trying again shortly.{" "}
          <button type="button" className="underline hover:no-underline" onClick={poll}>
            Retry now
          </button>
        </p>
      )}

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
              <Button type="button" variant="ghost" size="sm" aria-label="Close" onClick={closeCheckin}>
                ✕
              </Button>
            </div>

            <form onSubmit={(e) => void handleSubmit(submitCheckin, refuseCheckin)(e)} className="space-y-4">
              {/* Song — drives everything else */}
              {noEventSongs ? (
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t added any songs to this event yet.{" "}
                  <Link to={submitSongsHref} className="underline">
                    Submit songs to this event
                  </Link>
                  .{" "}
                  <Link
                    to="/how-it-works/troubleshooting"
                    className="text-xs text-muted-foreground underline underline-offset-2"
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
                    onChange={(v) => setValue("songId", v)}
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
                        ? selectedSong.partnership_label?.trim() || "—"
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
                      {selectedEntityCheckedInByPartner
                        ? "Your partner already checked this partnership in. Pick a different song."
                        : "This partnership is already in the queue. Pick a different song or withdraw your current entry first."}{" "}
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
                  onChange={(v) => setValue("division", v)}
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
                <label htmlFor="checkin-notes" className={FIELD_LABEL_CLASS}>Notes (optional)</label>
                <textarea
                  id="checkin-notes"
                  className={FIELD_INPUT_CLASS}
                  rows={2}
                  {...register("notes")}
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
