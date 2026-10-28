import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTimeShort, formatSessionTitle } from "@/lib/sessionFormat";
import type { ApiEvent, ApiRun, ApiSession } from "@/schemas";

const RUNS_FETCH_LIMIT = 500;
const ALL = "__all__";

/**
 * The event's run history, newest first, by session and division. Always
 * filtered to this event (or one of its sessions): run history across every
 * event needs the global scope, which no event's staff holds.
 */
export default function RunHistorySection({ event }: { event: ApiEvent }) {
  const api = useApiClient();
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [sessionId, setSessionId] = useState<string>(ALL);
  const [division, setDivision] = useState<string>(ALL);
  const [runs, setRuns] = useState<ApiRun[] | null>(null);

  useEffect(() => {
    call(api, endpoints.sessions.list, { params: { eventId: event.id } })
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [api, event.id]);

  useEffect(() => {
    let cancelled = false;
    setRuns(null);
    const params = new URLSearchParams();
    params.set("limit", String(RUNS_FETCH_LIMIT));
    if (sessionId !== ALL) params.set("session_id", sessionId);
    else params.set("event_id", event.id);
    call(api, endpoints.runs.list, { params: { query: params.toString() } })
      .then((rows) => {
        if (cancelled) return;
        setRuns(rows);
        setDivision(ALL);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setRuns([]);
        toast.error(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api, event.id, sessionId]);

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
        {runs === null ? (
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
