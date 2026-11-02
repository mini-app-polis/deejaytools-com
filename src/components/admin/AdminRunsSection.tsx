import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { formatTime } from "@/components/admin/adminShared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { formatSessionTitle } from "@/lib/sessionFormat";
import { compareSessionChrono } from "@/lib/chronoSort";

/**
 * The admin Run History section: event and session pickers, division and
 * partnership summary chips, and the newest-first run list. It renders its
 * own TabsContent so it stays mounted while another admin section is shown,
 * keeping its filters as they were when the admin comes back.
 */
export default function AdminRunsSection() {
  const RUNS_FETCH_LIMIT = 500;
  const RUNS_PARTNERSHIP_CHIP_LIMIT = 10;
  const [runsEventId, setRunsEventId] = useState("");
  const [runsShowFuture, setRunsShowFuture] = useState(false);
  const [runsSessionFilter, setRunsSessionFilter] = useState("");
  const [runsDivisionFilter, setRunsDivisionFilter] = useState<string | null>(null);
  const [runsPartnershipFilter, setRunsPartnershipFilter] = useState<string | null>(null);
  const [runsShowAllPartnerships, setRunsShowAllPartnerships] = useState(false);

  // The event and session pickers, and each run's session label, come from these lists.
  const eventsQuery = useEndpointQuery(endpoints.events.list);
  const events = eventsQuery.data ?? null;
  const loadingEvents = eventsQuery.isFetching;

  const sessionsQuery = useEndpointQuery(endpoints.sessions.list);
  const sessions = sessionsQuery.data ?? null;

  // A session filter wins over an event filter; with neither, every run.
  const runsQueryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(RUNS_FETCH_LIMIT));
    if (runsSessionFilter) {
      params.set("session_id", runsSessionFilter);
    } else if (runsEventId) {
      params.set("event_id", runsEventId);
    }
    return params.toString();
  }, [runsEventId, runsSessionFilter]);
  // The previous result stays on screen, dimmed, while a new filter loads.
  const runsQuery = useEndpointQuery(endpoints.runs.list, {
    params: { query: runsQueryString },
    placeholderData: keepPreviousData,
  });
  const runs = runsQuery.data ?? null;
  const runsLoading = runsQuery.isFetching;
  const runsHitLimit = runs?.length === RUNS_FETCH_LIMIT;

  // A new event or session filter starts with no division or partnership filter.
  const [runsFilteredFor, setRunsFilteredFor] = useState(runsQueryString);
  if (runsFilteredFor !== runsQueryString) {
    setRunsFilteredFor(runsQueryString);
    setRunsDivisionFilter(null);
    setRunsPartnershipFilter(null);
    setRunsShowAllPartnerships(false);
  }

  const runsVisibleEvents = useMemo(
    () =>
      (events ?? [])
        .filter((ev) => runsShowFuture || ev.status !== "upcoming")
        .slice()
        .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [events, runsShowFuture]
  );

  const runsFilteredSessions = useMemo(() => {
    const list = sessions ?? [];
    if (!runsEventId) return list;
    return list.filter((s) => s.event_id === runsEventId);
  }, [sessions, runsEventId]);

  // Summary chip counts always reflect the full fetched result set — not the
  // active division/partnership filter — so numbers stay stable while filtering.
  const runsDivisionSummary = useMemo(() => {
    if (!runs?.length) return [];
    const map = new Map<string, number>();
    for (const row of runs) {
      const key = row.division_name?.trim() || "Unspecified";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([division, count]) => ({ division, count }))
      .sort((a, b) => b.count - a.count || a.division.localeCompare(b.division));
  }, [runs]);

  const runsPartnershipSummary = useMemo(() => {
    if (!runs?.length) return [];
    const map = new Map<string, { label: string; count: number }>();
    for (const row of runs) {
      const key = row.entity_key;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        // Rows arrive newest-first; first label wins for this key.
        map.set(key, { label: row.entity_label, count: 1 });
      }
    }
    return [...map.entries()]
      .map(([key, { label, count }]) => ({ key, label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [runs]);

  const runsPartnershipHiddenCount = Math.max(
    0,
    runsPartnershipSummary.length - RUNS_PARTNERSHIP_CHIP_LIMIT
  );

  const runsPartnershipVisible = useMemo(() => {
    if (runsShowAllPartnerships) return runsPartnershipSummary;
    return runsPartnershipSummary.slice(0, RUNS_PARTNERSHIP_CHIP_LIMIT);
  }, [runsPartnershipSummary, runsShowAllPartnerships]);

  const runsActivePartnershipLabel = useMemo(() => {
    if (!runsPartnershipFilter || !runs) return null;
    return (
      runsPartnershipSummary.find((p) => p.key === runsPartnershipFilter)?.label ??
      runs.find((r) => r.entity_key === runsPartnershipFilter)?.entity_label ??
      runsPartnershipFilter
    );
  }, [runs, runsPartnershipFilter, runsPartnershipSummary]);

  const runsDisplayRows = useMemo(() => {
    if (!runs) return null;
    return runs.filter((row) => {
      const division = row.division_name?.trim() || "Unspecified";
      if (runsDivisionFilter && division !== runsDivisionFilter) return false;
      if (runsPartnershipFilter && row.entity_key !== runsPartnershipFilter) return false;
      return true;
    });
  }, [runs, runsDivisionFilter, runsPartnershipFilter]);

  const runsHasActiveFilters = runsDivisionFilter !== null || runsPartnershipFilter !== null;

  const clearRunsFilters = () => {
    setRunsDivisionFilter(null);
    setRunsPartnershipFilter(null);
  };

  return (
    <TabsContent value="runs" className="mt-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Run History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Label>Event</Label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={runsShowFuture}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setRunsShowFuture(next);
                    if (!next) {
                      const sel = events?.find((ev) => ev.id === runsEventId);
                      if (sel?.status === "upcoming") {
                        setRunsEventId("");
                        setRunsSessionFilter("");
                      }
                    }
                  }}
                />
                Show future events
              </label>
            </div>
            {loadingEvents ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRunsEventId("");
                    setRunsSessionFilter("");
                  }}
                  className={cn(
                    "w-full h-full rounded-lg border px-4 py-2 text-left transition-colors",
                    runsEventId === ""
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/50"
                  )}
                >
                  <p className="font-medium text-sm">All events</p>
                </button>
                {runsVisibleEvents.map((ev) => {
                  const active = ev.id === runsEventId;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => {
                        setRunsEventId(active ? "" : ev.id);
                        setRunsSessionFilter("");
                      }}
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

          <div className="space-y-2">
            <Label>Session</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRunsSessionFilter("")}
                className={cn(
                  "w-full h-full rounded-lg border px-4 py-2 text-left transition-colors",
                  runsSessionFilter === ""
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-muted/50"
                )}
              >
                <p className="font-medium text-sm">All sessions</p>
              </button>
              {runsEventId &&
                runsFilteredSessions
                  .slice()
                  .sort(compareSessionChrono)
                  .map((s) => {
                    const active = s.id === runsSessionFilter;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setRunsSessionFilter(active ? "" : s.id)}
                        className={cn(
                          "w-full h-full rounded-lg border px-4 py-2 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <p className="font-medium text-sm line-clamp-2">
                          {formatSessionTitle(s, s.event_timezone)}
                        </p>
                      </button>
                    );
                  })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                clearRunsFilters();
                setRunsShowAllPartnerships(false);
                void runsQuery.refetch();
              }}
              disabled={runsLoading}
            >
              {runsLoading ? "Refreshing…" : "Refresh"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {runs === null ? "" : `${runs.length} run${runs.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {runsHitLimit && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Showing the first {RUNS_FETCH_LIMIT} runs only — narrow by event or session to
              see more.
            </p>
          )}

          {runs && runs.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRunsDivisionFilter(null)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    runsDivisionFilter === null
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  All divisions ({runs.length})
                </button>
                {runsDivisionSummary.map(({ division, count }) => (
                  <button
                    key={division}
                    type="button"
                    onClick={() =>
                      setRunsDivisionFilter((prev) => (prev === division ? null : division))
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      runsDivisionFilter === division
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    {division} ({count})
                  </button>
                ))}
              </div>

              {runsPartnershipSummary.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRunsPartnershipFilter(null)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      runsPartnershipFilter === null
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    All partnerships ({runsPartnershipSummary.length})
                  </button>
                  {runsPartnershipVisible.map(({ key, label, count }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setRunsPartnershipFilter((prev) => (prev === key ? null : key))
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors max-w-full truncate",
                        runsPartnershipFilter === key
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      )}
                      title={label}
                    >
                      {label} ({count})
                    </button>
                  ))}
                  {!runsShowAllPartnerships && runsPartnershipHiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setRunsShowAllPartnerships(true)}
                      className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      Show all ({runsPartnershipHiddenCount})
                    </button>
                  )}
                </div>
              )}

              {runsHasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Filters:</span>
                  {runsDivisionFilter && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      Division: {runsDivisionFilter}
                    </span>
                  )}
                  {runsPartnershipFilter && runsActivePartnershipLabel && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      Partnership: {runsActivePartnershipLabel}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={clearRunsFilters}
                    className="text-xs text-primary hover:underline"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </>
          )}

          {runsQuery.error && !runs ? (
            <QueryError what="run history" error={runsQuery.error} onRetry={() => void runsQuery.refetch()} />
          ) : runs === null ? (
            <Skeleton className="h-32 w-full" />
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {runsSessionFilter
                ? `No runs recorded for ${
                    (() => {
                      const session = sessions?.find((s) => s.id === runsSessionFilter);
                      return session
                        ? formatSessionTitle(session, session.event_timezone)
                        : "this session";
                    })()
                  } yet.`
                : runsEventId
                  ? `No runs recorded for ${
                      events?.find((ev) => ev.id === runsEventId)?.name ?? "this event"
                    } yet.`
                  : "No runs recorded yet."}
            </p>
          ) : runsDisplayRows!.length === 0 ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                No runs match the active filter{runsHasActiveFilters ? "s" : ""}.
                {runsDivisionFilter && runsPartnershipFilter
                  ? ` Showing runs in ${runsDivisionFilter} for ${runsActivePartnershipLabel}.`
                  : runsDivisionFilter
                    ? ` Showing runs in ${runsDivisionFilter} only.`
                    : runsPartnershipFilter
                      ? ` Showing runs for ${runsActivePartnershipLabel} only.`
                      : ""}
              </p>
              {runsHasActiveFilters && (
                <button
                  type="button"
                  onClick={clearRunsFilters}
                  className="text-primary underline underline-offset-2 text-xs"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className={`space-y-2${runsLoading ? " opacity-60" : ""}`}>
              {runsDisplayRows!.map((row) => {
                const sessionRow = sessions?.find((s) => s.id === row.session_id);
                const runEventTz = row.event_id
                  ? (events?.find((e) => e.id === row.event_id)?.timezone ?? null)
                  : null;
                const sessionLabel = sessionRow
                  ? formatSessionTitle(sessionRow, sessionRow.event_timezone)
                  : row.session_floor_trial_starts_at
                    ? formatSessionTitle(
                        { floor_trial_starts_at: row.session_floor_trial_starts_at },
                        runEventTz
                      )
                    : "Unknown session";
                return (
                  <div
                    key={row.id}
                    className="rounded-lg border px-3 py-3 text-sm space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium">
                          {row.entity_label}
                          <span className="text-muted-foreground"> · {row.division_name}</span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.song_label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sessionLabel}
                          {row.event_name ? ` · ${row.event_name}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {formatTime(row.completed_at)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          by {row.completed_by_label}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
