import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
import PersonPicker from "@/components/staff/PersonPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Skeleton } from "@/components/ui/skeleton";
import { EVENT_ROLE_LABELS } from "@/lib/eventRoles";
import type { ApiEvent, ApiEventPerson, ApiEventStaff, EventStaffRole } from "@/schemas";

/**
 * The roles an event manager may grant and revoke. Event manager itself is
 * granted and revoked by an admin only, so it is never offered here.
 */
const GRANTABLE: readonly EventStaffRole[] = ["coordinator", "dj"];

function personLabel(s: ApiEventStaff): string {
  return [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || s.email;
}

/**
 * The event's staff, with grant and revoke for coordinator and DJ, through
 * the event's own staff routes.
 */
export default function EventStaffSection({ event }: { event: ApiEvent }) {
  const api = useApiClient();
  const [staff, setStaff] = useState<ApiEventStaff[] | null>(null);
  const [person, setPerson] = useState<ApiEventPerson | null>(null);
  const [role, setRole] = useState<EventStaffRole | "">("");
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(() => {
    call(api, endpoints.events.staff, { params: { id: event.id } })
      .then(setStaff)
      .catch((e: Error) => {
        setStaff((prev) => prev ?? []);
        toast.error(e.message);
      });
  }, [api, event.id]);

  useEffect(() => {
    load();
  }, [load]);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person) { toast.error("Choose a person"); return; }
    if (!role) { toast.error("Choose a role"); return; }
    setGranting(true);
    try {
      const row = await call(api, endpoints.events.grantStaff, {
        params: { id: event.id, userId: person.user_id, role },
      });
      toast.success(`${personLabel(row)} is now ${EVENT_ROLE_LABELS[row.role]}`);
      setPerson(null);
      setRole("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Grant failed");
    } finally {
      setGranting(false);
    }
  };

  const revoke = async (s: ApiEventStaff) => {
    const key = `${s.user_id}:${s.role}`;
    setRevoking(key);
    try {
      await call(api, endpoints.events.revokeStaff, {
        params: { id: event.id, userId: s.user_id, role: s.role },
      });
      toast.success(`Removed ${personLabel(s)} as ${EVENT_ROLE_LABELS[s.role]}`);
      setStaff((prev) => prev?.filter((x) => !(x.user_id === s.user_id && x.role === s.role)) ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {staff === null ? (
            <Skeleton className="h-24 w-full" />
          ) : staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is on this event&apos;s staff yet.</p>
          ) : (
            staff.map((s) => {
              const key = `${s.user_id}:${s.role}`;
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{personLabel(s)}</p>
                    <p className="text-xs text-muted-foreground">
                      {EVENT_ROLE_LABELS[s.role]} · {s.email}
                    </p>
                  </div>
                  {GRANTABLE.includes(s.role) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={revoking === key}
                      aria-label={`Remove ${personLabel(s)} as ${EVENT_ROLE_LABELS[s.role]}`}
                      onClick={() => void revoke(s)}
                    >
                      {revoking === key ? "Removing…" : "Remove"}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add staff</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void grant(e)} className="space-y-4 max-w-lg">
            <PersonPicker
              id="staff-grant-user"
              eventId={event.id}
              label="Person"
              value={person}
              onChange={setPerson}
              hint="To add someone new to the event, ask an admin."
            />
            <div className="space-y-1">
              <span className="block text-sm font-medium">Role</span>
              <ChoiceGroup
                ariaLabel="Role"
                options={GRANTABLE.map((r) => ({ value: r, label: EVENT_ROLE_LABELS[r] }))}
                value={role}
                onChange={setRole}
              />
              <p className="text-xs text-muted-foreground">An admin adds event managers.</p>
            </div>
            <Button type="submit" disabled={granting || !person || !role}>
              {granting ? "Adding…" : "Add to staff"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
