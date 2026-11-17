import { useMemo, useState } from "react";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useDivisions } from "@/hooks/useDivisions";
import { formatSongLength } from "@/lib/songLength";
import { classicRoundLabel } from "@/lib/submissionRounds";
import { isOpenEvent, type ApiAdminEventSongSubmission, type ApiEvent } from "@/schemas";

const ALL = "__all__";
const UNSPECIFIED = "Unspecified";

function divisionOf(row: ApiAdminEventSongSubmission): string {
  return row.division?.trim() || UNSPECIFIED;
}

/** Known divisions in display order, then any others by name, then Unspecified. */
function compareDivisions(order: readonly string[], a: string, b: string): number {
  if (a === UNSPECIFIED) return 1;
  if (b === UNSPECIFIED) return -1;
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b);
}

/**
 * The event's song submissions, read-only, filterable by division: each
 * song's label, its length and who it belongs to. A length the API has not
 * read yet shows as a dash. Reads the event-scoped
 * GET /v1/events/:id/song-submissions, which the event's coordinator, DJ and
 * event manager may all call.
 */
export default function EventSubmissionsSection({ event }: { event: ApiEvent }) {
  const rowsQuery = useEndpointQuery(endpoints.events.songSubmissions, { params: { id: event.id } });
  const rows = rowsQuery.data ?? null;
  const [division, setDivision] = useState<string>(ALL);
  const { divisions: divisionOrder } = useDivisions();
  const roundsAllowed = isOpenEvent(event.name);

  const groups = useMemo(() => {
    const map = new Map<string, ApiAdminEventSongSubmission[]>();
    for (const row of rows ?? []) {
      const key = divisionOf(row);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.keys()].sort((a, b) => compareDivisions(divisionOrder, a, b)).map((d) => ({ division: d, rows: map.get(d)! }));
  }, [rows, divisionOrder]);

  const visible = division === ALL ? groups : groups.filter((g) => g.division === division);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submissions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rowsQuery.error && rows === null ? (
          <QueryError what="the submissions" error={rowsQuery.error} onRetry={() => void rowsQuery.refetch()} />
        ) : rows === null ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No songs submitted to this event yet.</p>
        ) : (
          <>
            <ChoiceGroup
              ariaLabel="Division"
              options={[
                { value: ALL, label: `All (${rows.length})` },
                ...groups.map((g) => ({ value: g.division, label: `${g.division} (${g.rows.length})` })),
              ]}
              value={division}
              onChange={setDivision}
            />
            {visible.map((g) => (
              <section key={g.division} className="space-y-2">
                <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                  {g.division} <span className="text-xs font-normal">{g.rows.length}</span>
                </h3>
                {g.rows.map((row) => {
                  const round = classicRoundLabel(row, roundsAllowed);
                  const length = formatSongLength(row.duration_ms);
                  return (
                    <div
                      key={row.id}
                      className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4 rounded-lg bg-white/[0.06] px-4 py-3 text-sm"
                    >
                      <span className="font-medium min-w-0 truncate">{row.partnership_label}</span>
                      <span className="flex items-baseline gap-3 sm:justify-end min-w-0">
                        <span className="text-muted-foreground sm:text-right break-all min-w-0">
                          {row.song_label}
                          {round && <span className="block text-xs font-medium text-foreground">{round}</span>}
                        </span>
                        {length ? (
                          <span className="shrink-0 tabular-nums font-medium" aria-label={`Length ${length}`}>
                            {length}
                          </span>
                        ) : (
                          <span className="shrink-0 text-muted-foreground" aria-label="Length not known yet" title="Length not known yet">
                            —
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </section>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
