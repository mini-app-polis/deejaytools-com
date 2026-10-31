import { useMemo, useState } from "react";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeShort, formatSessionTitle } from "@/lib/sessionFormat";
import type { ApiEvent } from "@/schemas";

const RUNS_FETCH_LIMIT = 500;
const ALL = "__all__";

/**
 * The event's run history, newest first, by session and division. Always
 * filtered to this event (or one of its sessions): run history across every
 * event needs the global scope, which no event's staff holds.
 */
export default function RunHistorySection({ event }: { event: ApiEvent }) {
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list, { params: { eventId: event.id } });
  const sessions = sessionsQuery.data ?? [];
  const [sessionId, setSessionId] = useState<string>(ALL);
  const [division, setDivision] = useState<string>(ALL);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(RUNS_FETCH_LIMIT));
    if (sessionId !== ALL) params.set("session_id", sessionId);
    else params.set("event_id", event.id);
    return params.toString();
  }, [event.id, sessionId]);
  const runsQuery = useEndpointQuery(endpoints.runs.list, { params: { query } });
  const runs = runsQuery.data ?? null;

  // Another session's runs start with every division showing.
  const [divisionFor, setDivisionFor] = useState(query);
  if (divisionFor !== query) {
    setDivisionFor(query);
    setDivision(ALL);
  }

  const divisions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of runs ?? []) {
      const key = r.division_name?.trim() || "Unspecified";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [runs]);

  const visible = (runs ?? []).filter(
    (r) => division === ALL || (r.division_name?.trim() || "Unspecified") === division
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessionsQuery.error && !sessionsQuery.data && (
          <QueryError what="the sessions" error={sessionsQuery.error} onRetry={() => void sessionsQuery.refetch()} />
        )}
        {sessions.length > 0 && (
          <ChoiceGroup
            ariaLabel="Session"
            options={[
              { value: ALL, label: "All sessions" },
              ...sessions.map((s) => ({ value: s.id, label: formatSessionTitle(s, s.event_timezone ?? event.timezone) })),
            ]}
            value={sessionId}
            onChange={setSessionId}
          />
        )}
        {runsQuery.error && runs === null ? (
          <QueryError what="run history" error={runsQuery.error} onRetry={() => void runsQuery.refetch()} />
        ) : runs === null ? (
          <Skeleton className="h-24 w-full" />
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
        ) : (
          <>
            <ChoiceGroup
              ariaLabel="Division"
              options={[
                { value: ALL, label: `All (${runs.length})` },
                ...divisions.map(([d, n]) => ({ value: d, label: `${d} (${n})` })),
              ]}
              value={division}
              onChange={setDivision}
            />
            {runs.length === RUNS_FETCH_LIMIT && (
              <p className="text-xs text-muted-foreground">Showing the latest {RUNS_FETCH_LIMIT} runs.</p>
            )}
            <div className="space-y-2">
              {visible.map((r) => (
                <div key={r.id} className="rounded-lg bg-white/[0.06] px-4 py-3 text-sm space-y-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{r.entity_label}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTimeShort(r.completed_at, event.timezone)}
                    </span>
                  </div>
                  <p className="text-muted-foreground break-all">
                    {r.division_name || "Unspecified"} · {r.song_label}
                  </p>
                  {r.completed_by_label && (
                    <p className="text-xs text-muted-foreground">Completed by {r.completed_by_label}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
