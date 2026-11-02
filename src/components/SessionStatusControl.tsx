import { useState } from "react";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation } from "@/api/queries";
import type { KeyedEndpoint } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SessionStatusSchema, type ApiSession } from "@/schemas";

type SessionStatus = (typeof SessionStatusSchema.options)[number];
const STATUS_OPTIONS = SessionStatusSchema.options;

/**
 * Set a session's status. Picking a status in the select changes nothing on
 * its own — moving through it with the keyboard sends no request; Apply
 * sends it, and cancelling asks first. Used by the staff portal and the
 * admin page.
 */
export default function SessionStatusControl({
  session,
  label,
  invalidates,
  disabled = false,
}: {
  session: ApiSession;
  /** What the session is called on screen, for the control's accessible names. */
  label: string;
  /** The reads a status change refreshes. */
  invalidates: readonly KeyedEndpoint<never>[];
  disabled?: boolean;
}) {
  const setStatus = useEndpointMutation(endpoints.sessions.setStatus, { invalidates });
  const [draft, setDraft] = useState<SessionStatus>(session.status);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // A status saved elsewhere (or by Apply) resets the pick to it.
  const [shown, setShown] = useState(session.status);
  if (shown !== session.status) {
    setShown(session.status);
    setDraft(session.status);
  }

  const busy = setStatus.isPending;
  const changed = draft !== session.status;

  const send = async (status: SessionStatus) => {
    try {
      await setStatus.mutateAsync({ params: { id: session.id }, body: { status } });
      toast.success("Status updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to set status");
    }
  };

  const apply = () => {
    if (!changed) return;
    if (draft === "cancelled") {
      setConfirmCancel(true);
      return;
    }
    void send(draft);
  };

  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Status</span>
        <select
          aria-label={`Status of ${label}`}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={draft}
          disabled={disabled || busy}
          onChange={(e) => setDraft(e.target.value as SessionStatus)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="sm"
        variant="secondary"
        aria-label={`Apply status of ${label}`}
        disabled={disabled || busy || !changed}
        onClick={apply}
      >
        {busy ? "Applying…" : "Apply"}
      </Button>

      <Dialog open={confirmCancel} onOpenChange={(open: boolean) => { if (!open) setConfirmCancel(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this session?</DialogTitle>
            <DialogDescription>
              <span className="font-medium">{label}</span>
              <br />
              It will show as cancelled everywhere it is listed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep session
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmCancel(false);
                void send("cancelled");
              }}
            >
              Cancel session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
