import { useState } from "react";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import PersonPicker from "@/components/staff/PersonPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiEvent, ApiEventPerson, ApiEventStaff, EventStaffRole } from "@/schemas";

/** The role this dialog grants and revokes: only an admin may. */
const MANAGER: EventStaffRole = "event-manager";

function personLabel(s: ApiEventStaff): string {
  return [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || s.email;
}

/**
 * An event's managers, for an admin: grant and revoke the event-manager role
 * through the event's staff routes. Any user can be picked, connected to the
 * event or not. Coordinators and DJs are left to the event manager's portal.
 */
export default function AdminEventManagersDialog({
  event,
  onClose,
}: {
  event: ApiEvent;
  onClose: () => void;
}) {
  const staffQuery = useEndpointQuery(endpoints.events.staff, { params: { id: event.id } });
  const managers = staffQuery.data?.filter((s) => s.role === MANAGER) ?? null;
  // A grant or revoke may be the caller's own, which changes their portals.
  const invalidates = [endpoints.events.staff, endpoints.auth.me];
  const grantStaff = useEndpointMutation(endpoints.events.grantStaff, { invalidates });
  const revokeStaff = useEndpointMutation(endpoints.events.revokeStaff, { invalidates });
  const [person, setPerson] = useState<ApiEventPerson | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const grant = async () => {
    if (!person) return;
    try {
      const row = await grantStaff.mutateAsync({
        params: { id: event.id, userId: person.user_id, role: MANAGER },
      });
      toast.success(`${personLabel(row)} is now an event manager`);
      setPerson(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Grant failed");
    }
  };

  const revoke = async (s: ApiEventStaff) => {
    setRevoking(s.user_id);
    try {
      await revokeStaff.mutateAsync({ params: { id: event.id, userId: s.user_id, role: MANAGER } });
      toast.success(`Removed ${personLabel(s)} as event manager`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Event managers</DialogTitle>
          <DialogDescription>{event.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {staffQuery.error && managers === null ? (
            <QueryError what="the managers" error={staffQuery.error} onRetry={() => void staffQuery.refetch()} />
          ) : managers === null ? (
            <Skeleton className="h-16 w-full" />
          ) : managers.length === 0 ? (
            <p className="text-sm text-muted-foreground">This event has no managers yet.</p>
          ) : (
            managers.map((s) => (
              <div
                key={s.user_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{personLabel(s)}</p>
                  <p className="text-xs text-muted-foreground">{s.email}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={revoking === s.user_id}
                  aria-label={`Remove ${personLabel(s)} as event manager`}
                  onClick={() => void revoke(s)}
                >
                  {revoking === s.user_id ? "Removing…" : "Remove"}
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3 border-t pt-4">
          <PersonPicker
            id="admin-manager-grant-user"
            allUsers
            label="Add an event manager"
            value={person}
            onChange={setPerson}
          />
          <Button disabled={!person || grantStaff.isPending} onClick={() => void grant()}>
            {grantStaff.isPending ? "Adding…" : "Make event manager"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
