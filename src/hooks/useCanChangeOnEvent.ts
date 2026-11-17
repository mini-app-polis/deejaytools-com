import { useAuthMe } from "@/hooks/useAuthMe";
import { holdsAnyRoleOn } from "@/lib/eventRoles";
import type { EventStaffRole } from "@/schemas";

/**
 * Whether the caller may change something on `eventId` that only `editors`
 * (and admins) change: an admin may on every event; anyone else when they
 * hold one of `editors` there. An admin viewing the site as a role gets that
 * role's answer (useAuthMe). The API decides every change again.
 */
export function useCanChangeOnEvent(eventId: string, editors: readonly EventStaffRole[]): boolean {
  const { isAdmin, eventRoles } = useAuthMe();
  return isAdmin || holdsAnyRoleOn(eventRoles, eventId, editors);
}
