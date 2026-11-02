import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiQueueEntry } from "@/schemas";

/**
 * The session's queues: Active (slot 1 first, highlighted as on deck), then
 * Priority and Standard side by side when there's room, numbered as one line.
 */
export default function SessionQueues({
  activeSorted,
  priorityWaiting,
  standardWaiting,
  renderEntityLabel,
}: {
  activeSorted: readonly ApiQueueEntry[];
  priorityWaiting: readonly ApiQueueEntry[];
  standardWaiting: readonly ApiQueueEntry[];
  renderEntityLabel: (row: ApiQueueEntry) => string;
}) {
  return (
    <>
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
                    #{activeSorted.length + i + 1}
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
                    #{activeSorted.length + priorityWaiting.length + i + 1}
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
    </>
  );
}
