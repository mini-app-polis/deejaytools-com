import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
import { SessionInfoHeader } from "@/components/SessionInfoHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { compareSessionChrono } from "@/lib/chronoSort";
import { formatSessionTitle } from "@/lib/sessionFormat";
import { cn } from "@/lib/utils";
import type { ApiEvent, ApiQueueEntry, ApiSession } from "@/schemas";

/** How often the queues refresh on their own while a session is open. */
const POLL_MS = 8000;

function isLive(s: ApiSession): boolean {
  return s.status === "checkin_open" || s.status === "in_progress";
}

function formatAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

type QueueAction =
  | typeof endpoints.queue.complete
  | typeof endpoints.queue.incomplete
  | typeof endpoints.queue.moveDown
  | typeof endpoints.queue.withdraw;

/**
 * The live floor-trial queue for one of the event's sessions: the active
 * slots and both waiting queues, with run complete, run incomplete, move
 * down and withdraw. Every action names a queue entry of this event's
 * session, which the API resolves to the event before deciding.
 */
export default function LiveQueueSection({ event }: { event: ApiEvent }) {
  const api = useApiClient();
  const [sessions, setSessions] = useState<ApiSession[] | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [active, setActive] = useState<ApiQueueEntry[]>([]);
  const [priority, setPriority] = useState<ApiQueueEntry[]>([]);
  const [standard, setStandard] = useState<ApiQueueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  useEffect(() => {
    let cancelled = false;
    call(api, endpoints.sessions.list, { params: { eventId: event.id } })
      .then((rows) => {
        if (cancelled) return;
        setSessions(rows);
        // One session running now: open it straight away.
        const live = rows.filter(isLive);
        if (live.length === 1) setSessionId((cur) => cur || live[0]!.id);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setSessions([]);
        toast.error(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api, event.id]);

  const loadQueues = useCallback(
    async (id: string, silent = false) => {
      if (!id) return;
      if (!silent) setLoading(true);
      try {
        const [a, p, n] = await Promise.all([
          call(api, endpoints.queue.active, { params: { sessionId: id } }),
          call(api, endpoints.queue.priority, { params: { sessionId: id } }),
          call(api, endpoints.queue.nonPriority, { params: { sessionId: id } }),
        ]);
        if (sessionRef.current !== id) return;
        setActive(a);
        setPriority(p);
        setStandard(n);
        setUpdatedAt(Date.now());
        setRefreshFailed(false);
      } catch (e) {
        setRefreshFailed(true);
        if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load queues");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    if (!sessionId) return;
    setUpdatedAt(null);
    setRefreshFailed(false);
    void loadQueues(sessionId);
    const poll = setInterval(() => void loadQueues(sessionId, true), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [sessionId, loadQueues]);

  const options = useMemo(
    () =>
      (sessions ?? [])
        .slice()
        .sort((a, b) => compareSessionChrono(a, b))
        .map((s) => ({
          value: s.id,
          label:
            formatSessionTitle(s, s.event_timezone ?? event.timezone) +
            (s.status === "completed" || s.status === "cancelled" ? ` (${s.status})` : ""),
        })),
    [sessions, event.timezone]
  );

  const session = sessions?.find((s) => s.id === sessionId) ?? null;

  const act = async (ep: QueueAction, queueEntryId: string) => {
    try {
      await call(api, ep as typeof endpoints.queue.complete, { body: { queueEntryId } });
      await loadQueues(sessionRef.current);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const renderRow = (row: ApiQueueEntry, list: ApiQueueEntry[], isActiveQueue: boolean) => {
    const isSlotOne = isActiveQueue && row.position === 1;
    const isLast = row.position === list.length;
    return (
      <div key={row.queueEntryId} className="flex items-start gap-3">
        <span className="text-sm font-medium tabular-nums shrink-0 pt-2 w-12 text-right">
          {isSlotOne && <span className="text-primary mr-0.5">▶</span>}#{row.position}
        </span>
        <div
          className={cn(
            "border rounded-md px-3 py-2.5 text-sm flex-1 min-w-0 space-y-0.5",
            isSlotOne && "border-primary/50 bg-primary/10"
          )}
        >
          <p className="font-medium">{row.entityLabel}</p>
          <p className="text-muted-foreground truncate">
            {row.divisionName} · {row.songDisplayName ?? row.songId ?? "—"}
          </p>
          {row.songProcessedFilename && (
            <p className="text-xs text-muted-foreground break-all font-mono">{row.songProcessedFilename}</p>
          )}
          {row.notes && <p className="text-xs text-muted-foreground italic">Note: {row.notes}</p>}
          <div className="flex gap-2 flex-wrap pt-2 border-t border-border/40 mt-1.5">
            {isActiveQueue && (
              <>
                <Button size="sm" onClick={() => void act(endpoints.queue.complete, row.queueEntryId)}>
                  Run complete
                </Button>
                <Button size="sm" variant="outline" onClick={() => void act(endpoints.queue.incomplete, row.queueEntryId)}>
                  Run incomplete
                </Button>
              </>
            )}
            {!isLast && (
              <Button size="sm" variant="outline" onClick={() => void act(endpoints.queue.moveDown, row.queueEntryId)}>
                Move down
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => void act(endpoints.queue.withdraw, row.queueEntryId)}
            >
              Withdraw
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderList = (list: ApiQueueEntry[], empty: string, isActiveQueue = false) =>
    list.length === 0 ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : (
      list
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((row) => renderRow(row, list, isActiveQueue))
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {sessions === null ? null : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">This event has no sessions yet.</p>
        ) : (
          <ChoiceGroup ariaLabel="Session" options={options} value={sessionId} onChange={setSessionId} />
        )}
        {sessionId && (
          <button
            type="button"
            onClick={() => void loadQueues(sessionId)}
            disabled={loading}
            title="Refresh now"
            className={cn(
              "text-xs transition-colors hover:underline disabled:opacity-60",
              refreshFailed ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"
            )}
          >
            {loading
              ? "Refreshing…"
              : refreshFailed
                ? "Couldn't refresh — tap to retry"
                : updatedAt !== null
                  ? `Updated ${formatAgo(now - updatedAt)}`
                  : "Updating…"}
          </button>
        )}
      </div>

      {sessions !== null && options.length > 0 && !sessionId && (
        <p className="text-sm text-muted-foreground">Choose a session above to manage its queue.</p>
      )}

      {sessionId && (
        <div className={cn("space-y-4", loading && "opacity-60")}>
          {session && <SessionInfoHeader session={session} showTitle={false} />}
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-primary">Active</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {active.length} slot{active.length !== 1 ? "s" : ""} · Fills automatically
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">{renderList(active, "No one on deck.", true)}</CardContent>
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-amber-500/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-amber-500 dark:text-amber-400">Priority</CardTitle>
                  <span className="text-xs text-muted-foreground">{priority.length} waiting</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">{renderList(priority, "Priority queue is empty.")}</CardContent>
            </Card>
            <Card className="border-sky-500/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sky-500 dark:text-sky-400">Standard</CardTitle>
                  <span className="text-xs text-muted-foreground">{standard.length} waiting</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">{renderList(standard, "Standard queue is empty.")}</CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
