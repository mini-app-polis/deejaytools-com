import { useRef, useState } from "react";
import { toast } from "sonner";
import { call, endpoints, type Transport } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApiQueueEntry } from "@/schemas";

export type QueueActionEndpoint =
  | typeof endpoints.queue.complete
  | typeof endpoints.queue.incomplete
  | typeof endpoints.queue.moveDown
  | typeof endpoints.queue.withdraw;

/**
 * Runs the live queue's actions one at a time. While an action and the
 * reload after it are in flight, `busy` is true and further actions are
 * ignored, so a double tap on Move down moves one place, not two. Withdraw
 * goes through `requestWithdraw` and only runs once confirmed.
 */
export function useQueueActions(api: Transport, reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [pendingWithdraw, setPendingWithdraw] = useState<ApiQueueEntry | null>(null);

  const run = async (ep: QueueActionEndpoint, queueEntryId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await call(api, ep as typeof endpoints.queue.complete, { body: { queueEntryId } });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const confirmWithdraw = async () => {
    if (!pendingWithdraw) return;
    await run(endpoints.queue.withdraw, pendingWithdraw.queueEntryId);
    setPendingWithdraw(null);
  };

  return {
    busy,
    run,
    pendingWithdraw,
    requestWithdraw: (row: ApiQueueEntry) => setPendingWithdraw(row),
    cancelWithdraw: () => setPendingWithdraw(null),
    confirmWithdraw,
  };
}

/** Asks before a queue entry is withdrawn: there is no undo. */
export function WithdrawEntryDialog({
  entry,
  label,
  busy,
  onCancel,
  onConfirm,
}: {
  entry: ApiQueueEntry | null;
  label: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open: boolean) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw from the queue?</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{label}</span>
            {entry ? ` (${entry.divisionName})` : ""} will be removed from the queue. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? "Withdrawing…" : "Withdraw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
