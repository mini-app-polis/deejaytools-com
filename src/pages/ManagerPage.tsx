import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { type ApiAdminEventSongSubmission, type ApiEventPerson } from "@/schemas";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import SongUploadForm from "@/components/SongUploadForm";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { toastFirstError } from "@/lib/formErrors";
import { formatSessionTitle } from "@/lib/sessionFormat";
import ManagerGuideSection from "@/components/manager/ManagerGuideSection";
import LiveQueueSection from "@/components/staff/LiveQueueSection";
import PersonPicker from "@/components/staff/PersonPicker";
import { cn } from "@/lib/utils";

const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

// A stable empty list while a query has no data, so memos over it hold.
const NO_ROWS: readonly never[] = [];

/** CheckIn For: the user is picked by search, then the session, song and division. */
const checkinForSchema = z.object({
  user: z
    .custom<ApiEventPerson | null>()
    .refine((u) => u !== null, "Select a user")
    .pipe(z.custom<ApiEventPerson>()),
  sessionId: z.string().min(1, "Select a session"),
  songId: z.string().min(1, "Select a song"),
  division: z.string().min(1, "Select a division"),
});
type CheckinForForm = z.input<typeof checkinForSchema>;
type CheckinForValues = z.output<typeof checkinForSchema>;

export const MANAGER_SECTIONS = ["active-sessions", "event-songs", "upload-for", "checkin-for", "guide"] as const;
export type ManagerSection = (typeof MANAGER_SECTIONS)[number];
const DEFAULT_MANAGER_SECTION: ManagerSection = "active-sessions";

function isManagerSection(s: string | undefined): s is ManagerSection {
  return !!s && (MANAGER_SECTIONS as readonly string[]).includes(s);
}

export default function ManagerPage() {
  const { section: rawSection } = useParams<{ section: string }>();
  const section: ManagerSection = isManagerSection(rawSection)
    ? rawSection
    : DEFAULT_MANAGER_SECTION;

  const sessionsQuery = useEndpointQuery(endpoints.sessions.list);
  const sessions = sessionsQuery.data ?? null;

  const [esEventId, setEsEventId] = useState("");
  const [esShowPast, setEsShowPast] = useState(false);
  const [esCollapsedDivisions, setEsCollapsedDivisions] = useState<Set<string>>(new Set());

  const toggleDivision = (division: string) =>
    setEsCollapsedDivisions((prev) => {
      const next = new Set(prev);
      if (next.has(division)) next.delete(division);
      else next.add(division);
      return next;
    });

  const {
    handleSubmit: cfValidate,
    reset: cfReset,
    setValue: cfSetValue,
    watch: cfWatch,
    formState: { isSubmitting: cfSubmitting },
  } = useForm<CheckinForForm, unknown, CheckinForValues>({
    resolver: zodResolver(checkinForSchema),
    defaultValues: { user: null, sessionId: "", songId: "", division: "" },
  });
  const cfSelectedUser = cfWatch("user");
  const cfSessionId = cfWatch("sessionId");
  const cfSongId = cfWatch("songId");
  const cfDivision = cfWatch("division");
  const setCfSongId = (id: string) => cfSetValue("songId", id);
  const setCfDivision = (d: string) => cfSetValue("division", d);

  // Kept here, not in the section, so a chosen session survives a tab switch.
  const [lqSessionId, setLqSessionId] = useState("");

  const [ufSelected, setUfSelected] = useState<ApiEventPerson | null>(null);

  const cfActiveSessions = (sessions ?? []).filter(
    (s) => s.status === "checkin_open" || s.status === "in_progress"
  );
  const cfSessionObj = sessions?.find((s) => s.id === cfSessionId) ?? null;
  const cfSessionDivisions = (cfSessionObj?.divisions ?? []).map((d) => d.division_name);

  const esEventsQuery = useEndpointQuery(endpoints.events.list, { enabled: section === "event-songs" });
  const esEvents = esEventsQuery.data ?? NO_ROWS;
  const esEventsLoading = esEventsQuery.isLoading;

  const esSubmissionsQuery = useEndpointQuery(endpoints.admin.eventSongSubmissions, {
    params: { eventId: esEventId },
    enabled: section === "event-songs" && !!esEventId,
  });
  const esSubmissions = esSubmissionsQuery.data ?? NO_ROWS;
  const esSubmissionsLoading = esSubmissionsQuery.isFetching;

  useEffect(() => {
    setEsCollapsedDivisions(new Set());
  }, [esEventId]);

  // A new user or session starts the song and division choice again.
  useEffect(() => {
    cfSetValue("songId", "");
    cfSetValue("division", "");
  }, [cfSelectedUser?.user_id, cfSessionId, cfSessionObj?.event_id, cfSetValue]);

  const cfEventId = cfSessionObj?.event_id ?? null;
  const cfSubmissionsQuery = useEndpointQuery(endpoints.admin.userEventSongSubmissions, {
    params: { id: cfSelectedUser?.user_id ?? "", eventId: cfEventId ?? "" },
    enabled: !!cfSelectedUser && !!cfSessionId && !!cfEventId,
  });
  // null until the user and session are chosen and their songs have loaded.
  const cfSubmissions =
    !cfSelectedUser || !cfSessionId ? null : !cfEventId ? [] : (cfSubmissionsQuery.data ?? null);

  const selectCfSong = (songId: string) => {
    setCfSongId(songId);
    const submission = cfSubmissions?.find((s) => s.song_id === songId);
    if (!submission) return;
    const d = submission.division ?? "";
    setCfDivision(cfSessionDivisions.includes(d) ? d : "");
  };

  const createCheckin = useEndpointMutation(endpoints.checkins.create, {
    invalidates: [endpoints.queue.activeStaff, endpoints.queue.priority, endpoints.queue.nonPriority],
  });

  const esVisibleEvents = useMemo(
    () =>
      esEvents
        .filter((ev) => esShowPast || ev.status !== "completed")
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

  const submitCheckinFor = async ({ user, sessionId, songId, division }: CheckinForValues) => {
    try {
      await createCheckin.mutateAsync({ body: {
        sessionId,
        songId,
        divisionName: division,
        on_behalf_of_user_id: user.user_id,
      } });
      toast.success(`Checked in ${user.display_name}`);
      setCfSongId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">Manager</h1>

      <Tabs value={section}>
        {/* ── Operations guide ── */}
        <TabsContent value="guide" className="mt-4">
          <ManagerGuideSection />
        </TabsContent>

        {/* ── Active Sessions ── */}
        <TabsContent value="active-sessions" className="mt-4 space-y-5">
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium text-foreground">New to the booth?</span>{" "}
              <span className="text-muted-foreground">
                Read the operations guide for button meanings and session setup.
              </span>
            </p>
            <Link
              to="/manager/guide"
              className="text-sm font-medium text-primary hover:underline shrink-0"
            >
              Open guide →
            </Link>
          </div>
          <LiveQueueSection
            today
            sessionId={lqSessionId}
            onSessionIdChange={setLqSessionId}
            selectorClassName="w-full sm:w-72"
          />
        </TabsContent>

        {/* ── Event Songs tab ── */}
        <TabsContent value="event-songs" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle>Event Songs</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
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
                          if (sel && sel.status === "completed") {
                            setEsEventId("");
                          }
                        }
                      }}
                    />
                    Show past events
                  </label>
                </div>
                {esEventsQuery.error && !esEventsQuery.data ? (
                  <QueryError what="events" error={esEventsQuery.error} onRetry={() => void esEventsQuery.refetch()} />
                ) : esEventsLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : esVisibleEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events to show.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                          <p className="font-medium text-sm line-clamp-2">{ev.name}</p>
                          <p className="text-xs text-muted-foreground">{ev.start_date}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {!esEventId ? (
                <p className="text-sm text-muted-foreground">Select an event to view submitted songs.</p>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {esEvents.find((ev) => ev.id === esEventId)?.name ?? "Submissions"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className={`space-y-6${esSubmissionsLoading ? " opacity-60" : ""}`}>
                    {esSubmissionsQuery.error && !esSubmissionsQuery.data ? (
                      <QueryError
                        what="submitted songs"
                        error={esSubmissionsQuery.error}
                        onRetry={() => void esSubmissionsQuery.refetch()}
                      />
                    ) : esSubmissionsLoading && esSubmissions.length === 0 ? (
                      <Skeleton className="h-24 w-full" />
                    ) : esSubmissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No songs submitted to this event yet.
                      </p>
                    ) : (
                      esSubmissionsByDivision.map(({ division, rows }) => {
                        const collapsed = esCollapsedDivisions.has(division);
                        return (
                          <section key={division} className="space-y-2">
                            <button
                              type="button"
                              onClick={() => toggleDivision(division)}
                              aria-expanded={!collapsed}
                              className="flex w-full items-center gap-2 text-left"
                            >
                              <span
                                className={cn(
                                  "text-[10px] text-muted-foreground transition-transform",
                                  collapsed ? "" : "rotate-90"
                                )}
                              >
                                ▶
                              </span>{" "}
                              <span className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                                {division}
                              </span>{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                {rows.length}
                              </span>
                            </button>
                            {!collapsed && (
                              <div className="space-y-2">
                                {rows.map((row) => (
                                  <div
                                    key={row.id}
                                    className="flex items-baseline justify-between gap-4 rounded-lg bg-white/[0.06] px-4 py-3 text-sm"
                                  >
                                    <span className="font-medium min-w-0 truncate">
                                      {row.partnership_label}
                                    </span>
                                    <span className="text-muted-foreground text-right shrink-0">
                                      {row.song_label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
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
                <div className="max-w-lg">
                  <PersonPicker
                    id="upload-for-user"
                    allUsers
                    label="User to upload for"
                    value={null}
                    onChange={setUfSelected}
                    autoFocus
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle>
                    Upload For: {ufSelected.display_name}
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setUfSelected(null)}>
                    Change user
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <SongUploadForm
                  variant="self"
                  onBehalf={{
                    userId: ufSelected.user_id,
                    label: ufSelected.email_masked
                      ? `${ufSelected.display_name} (${ufSelected.email_masked})`
                      : ufSelected.display_name,
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
                <div className="max-w-lg">
                  <PersonPicker
                    id="checkin-for-user"
                    allUsers
                    label="User to check in"
                    value={null}
                    onChange={(u) => cfSetValue("user", u)}
                    autoFocus
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle>
                    CheckIn For: {cfSelectedUser.display_name}
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cfReset()}
                  >
                    Change user
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={(e) => void cfValidate(submitCheckinFor, toastFirstError)(e)} className="space-y-4 max-w-lg">
                  <div>
                    <label className={FIELD_LABEL_CLASS}>Session</label>
                    <ChoiceGroup
                      ariaLabel="Session"
                      options={cfActiveSessions.map((s) => ({
                        value: s.id,
                        label: formatSessionTitle(s, s.event_timezone),
                      }))}
                      value={cfSessionId}
                      onChange={(id) => cfSetValue("sessionId", id)}
                    />
                  </div>

                  <div>
                    <label className={FIELD_LABEL_CLASS}>Song</label>
                    {cfSessionObj && !cfSessionObj.event_id ? (
                      <p className="text-sm text-muted-foreground">This session has no event</p>
                    ) : cfSubmissionsQuery.error && cfSubmissions === null ? (
                      <QueryError
                        what="this user's songs"
                        error={cfSubmissionsQuery.error}
                        onRetry={() => void cfSubmissionsQuery.refetch()}
                      />
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
                        onChange={selectCfSong}
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
