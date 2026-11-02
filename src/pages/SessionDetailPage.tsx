import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth, useUser } from "@clerk/clerk-react";
import type { ApiLeadingPair, ApiQueueEntry } from "@/schemas";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { SessionInfoHeader } from "@/components/SessionInfoHeader";
import SessionCheckinAction from "@/components/session/SessionCheckinAction";
import SessionCheckinDialog, {
  EMPTY_CHECKIN,
  checkinSchema,
  type CheckinForm,
} from "@/components/session/SessionCheckinDialog";
import SessionQueues from "@/components/session/SessionQueues";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toastFirstError } from "@/lib/formErrors";

/** How often the queues and the session refresh on their own. */
const QUEUE_POLL_MS = 60_000;

// A stable empty list while a query has no data, so memos over it hold.
const NO_ROWS: readonly never[] = [];
/** The longest the check-in clock goes without a tick. */
const CLOCK_MAX_WAIT_MS = 60_000;

export default function ApiSessionPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const [checkinOpen, setCheckinOpen] = useState(false);

  // Check-in form — song-first
  const form = useForm<CheckinForm>({ resolver: zodResolver(checkinSchema), defaultValues: EMPTY_CHECKIN });
  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting: submitting },
  } = form;
  const fSongId = watch("songId");
  const fDivision = watch("division");

  const [now, setNow] = useState(Date.now());

  // The session and its queues are public and refresh on their own.
  // Polling starts at a random offset, so pages opened together (a reload
  // burst, a trial starting) don't poll in lockstep afterwards.
  const [pollOn, setPollOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPollOn(true), Math.random() * QUEUE_POLL_MS);
    return () => clearTimeout(t);
  }, []);
  const refetchInterval: number | false = pollOn ? QUEUE_POLL_MS : false;
  const polled = { params: { sessionId: id ?? "" }, enabled: !!id, refetchInterval };
  const sessionQuery = useEndpointQuery(endpoints.sessions.get, {
    params: { id: id ?? "" },
    enabled: !!id,
    refetchInterval,
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
  // Pairs, songs and event submissions only feed the check-in form, so they
  // load when it opens.
  const signedIn = !!isSignedIn;
  const formData = signedIn && checkinOpen;
  const pairsQuery = useEndpointQuery(endpoints.partners.leadingPairs, { enabled: formData });
  const songsQuery = useEndpointQuery(endpoints.songs.list, { enabled: formData });
  const myCheckinsQuery = useEndpointQuery(endpoints.checkins.mine, { enabled: signedIn });
  const eventId = session?.event_id ?? null;
  const submissionsQuery = useEndpointQuery(endpoints.eventSongSubmissions.list, {
    params: { eventId: eventId ?? "" },
    enabled: formData && eventId !== null,
  });
  const pairs = (signedIn && pairsQuery.data) || NO_ROWS;
  const songs = (signedIn && songsQuery.data) || NO_ROWS;
  const myCheckins = (signedIn && myCheckinsQuery.data) || NO_ROWS;
  // null when unknown, including when they fail to load: the picker then offers
  // every song and the API decides.
  const eventSubmissions = (signedIn && eventId !== null && submissionsQuery.data) || null;
  const formLoading = [pairsQuery, songsQuery, submissionsQuery].some((q) => q.isLoading);
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
    checkinWindowOpen;

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
    <SessionCheckinAction
      id={id}
      session={session}
      now={now}
      canCheckIn={canCheckIn}
      checkinWindowOpen={checkinWindowOpen}
      openCheckin={openCheckin}
      userQueueEntries={userQueueEntries}
      active={active}
      priorityWaiting={priorityWaiting}
      partnerCheckedInEntityIds={partnerCheckedInEntityIds}
    />
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

      <SessionQueues
        activeSorted={activeSorted}
        priorityWaiting={priorityWaiting}
        standardWaiting={standardWaiting}
        renderEntityLabel={renderEntityLabel}
      />

      {/* ── Check-in action (bottom) — same block as top ── */}
      {checkInBlock}

      {checkinOpen && (
        <SessionCheckinDialog
          form={form}
          onSubmit={(e) => void handleSubmit(submitCheckin, refuseCheckin)(e)}
          onClose={closeCheckin}
          submitting={submitting}
          formLoading={formLoading}
          noEventSongs={noEventSongs}
          noSongs={songsQuery.isSuccess && songs.length === 0}
          submitSongsHref={submitSongsHref}
          checkinSongs={checkinSongs}
          selectedSong={selectedSong}
          dancerName={user?.fullName ?? user?.firstName ?? "You"}
          isManaged={isManaged}
          isSolo={isSolo}
          selectedEntityInQueue={selectedEntityInQueue}
          selectedEntityCheckedInByPartner={selectedEntityCheckedInByPartner}
          sessionDivisions={sessionDivisions}
          divisionInSession={divisionInSession}
        />
      )}
    </div>
  );
}
