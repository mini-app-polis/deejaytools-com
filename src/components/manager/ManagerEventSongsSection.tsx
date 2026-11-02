import { useEffect, useMemo, useState } from "react";
import { type ApiAdminEventSongSubmission } from "@/schemas";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// A stable empty list while a query has no data, so memos over it hold.
const NO_ROWS: readonly never[] = [];

/**
 * The manager Event Songs section: pick an event, see its submitted songs
 * grouped by division. It renders its own TabsContent so it stays mounted
 * while another manager section is shown, keeping the chosen event; `open`
 * holds its queries back until the section is opened.
 */
export default function ManagerEventSongsSection({ open }: { open: boolean }) {
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

  const esEventsQuery = useEndpointQuery(endpoints.events.list, { enabled: open });
  const esEvents = esEventsQuery.data ?? NO_ROWS;
  const esEventsLoading = esEventsQuery.isLoading;

  const esSubmissionsQuery = useEndpointQuery(endpoints.admin.eventSongSubmissions, {
    params: { eventId: esEventId },
    enabled: open && !!esEventId,
  });
  const esSubmissions = esSubmissionsQuery.data ?? NO_ROWS;
  const esSubmissionsLoading = esSubmissionsQuery.isFetching;

  useEffect(() => {
    setEsCollapsedDivisions(new Set());
  }, [esEventId]);

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

  return (
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
  );
}
