import { useEffect, useMemo, useState } from "react";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { SessionInfoHeader } from "@/components/SessionInfoHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { useQueueActions, WithdrawEntryDialog } from "@/components/staff/queueActions";
import { useAuthMe } from "@/hooks/useAuthMe";
import { useLiveQueues } from "@/hooks/useLiveQueues";
import { richestEventRole } from "@/lib/eventRoles";
import { compareSessionChrono } from "@/lib/chronoSort";
import { formatSessionTitle } from "@/lib/sessionFormat";
import { cn } from "@/lib/utils";
import type { ApiEvent, ApiQueueEntry, ApiSession } from "@/schemas";

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

/**
 * The live floor-trial queue for one of the event's sessions: the active
 * slots and both waiting queues, with run complete, run incomplete, move
 * down and withdraw. Each entry shows its song label; a DJ also sees the
 * song's processed filename. Every action names a queue entry of this event's
 * session, which the API resolves to the event before deciding.
 */
export default function LiveQueueSection({ event }: { event: ApiEvent }) {
  // A DJ finds the song's file in the event's Drive folder by its processed
  // filename, so DJs see it under the song; other staff see the label only.
  const { eventRoles } = useAuthMe();
  const showFilename = richestEventRole(eventRoles, event.id) === "dj";
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list, { params: { eventId: event.id } });
  const sessions = sessionsQuery.data ?? null;
  const [sessionId, setSessionId] = useState("");
  const {
    active,
    priority,
    nonPriority: standard,
    loading,
    updatedAt,
    refreshFailed,
    loadError,
    refresh,
  } = useLiveQueues(sessionId);
  const [now, setNow] = useState(() => Date.now());

  // One session running now: open it straight away.
  useEffect(() => {
    const live = sessions?.filter(isLive) ?? [];
    if (live.length === 1) setSessionId((cur) => cur || live[0]!.id);
  }, [sessions]);

  // The "Updated 5s ago" clock.
  useEffect(() => {
    if (!sessionId) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [sessionId]);

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

  const actions = useQueueActions();

  const renderRow = (row: ApiQueueEntry, list: readonly ApiQueueEntry[], isActiveQueue: boolean) => {
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
          {showFilename && row.songProcessedFilename && (
            <p className="text-xs text-muted-foreground break-all font-mono">{row.songProcessedFilename}</p>
          )}
          {row.notes && <p className="text-xs text-muted-foreground italic">Note: {row.notes}</p>}
          <div className="flex gap-2 flex-wrap pt-2 border-t border-border/40 mt-1.5">
            {isActiveQueue && (
              <>
                <Button size="sm" disabled={actions.busy} onClick={() => void actions.run(endpoints.queue.complete, row.queueEntryId)}>
                  Run complete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actions.busy}
                  onClick={() => void actions.run(endpoints.queue.incomplete, row.queueEntryId)}
                >
                  Run incomplete
                </Button>
              </>
            )}
            {!isLast && (
              <Button
                size="sm"
                variant="outline"
                disabled={actions.busy}
                onClick={() => void actions.run(endpoints.queue.moveDown, row.queueEntryId)}
              >
                Move down
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={actions.busy}
              onClick={() => actions.requestWithdraw(row)}
            >
              Withdraw
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderList = (list: readonly ApiQueueEntry[], empty: string, isActiveQueue = false) =>
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
        {sessionsQuery.error && !sessions ? (
          <QueryError what="sessions" error={sessionsQuery.error} onRetry={() => void sessionsQuery.refetch()} />
        ) : sessions === null ? null : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">This event has no sessions yet.</p>
        ) : (
          <ChoiceGroup ariaLabel="Session" options={options} value={sessionId} onChange={setSessionId} />
        )}
        {sessionId && (
          <button
            type="button"
            onClick={() => void refresh()}
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

      {sessionId && loadError && (
        <QueryError what="the queues" error={loadError} onRetry={() => void refresh()} />
      )}

      {sessionId && !loadError && (
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

      <WithdrawEntryDialog
        entry={actions.pendingWithdraw}
        label={actions.pendingWithdraw?.entityLabel ?? ""}
        busy={actions.busy}
        onCancel={actions.cancelWithdraw}
        onConfirm={() => void actions.confirmWithdraw()}
      />
    </div>
  );
}
