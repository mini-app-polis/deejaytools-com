import { Navigate, useParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMe } from "@/hooks/useAuthMe";
import { holdsEventRole } from "@/lib/eventRoles";
import type { EventStaffRole } from "@/schemas";

/**
 * Gate around a per-event staff portal. Renders the route only when the
 * caller holds `role`, or a richer one, on the event in the `:eventId`
 * path segment; anyone else is sent to the landing page, as AdminGuard
 * does. The global admin role does not count: admins have the admin pages.
 *
 * This only decides what the app shows. The API authorizes every call the
 * portal makes on its own, against the same event.
 */
export default function EventRoleGuard({
  role,
  children,
}: {
  role: EventStaffRole;
  children: React.ReactNode;
}) {
  const { eventId } = useParams<{ eventId: string }>();
  const { me, loading, eventRoles } = useAuthMe();

  if (loading) {
    return (
      <div className="p-6 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full max-w-lg" />
      </div>
    );
  }

  if (!me || !eventId || !holdsEventRole(eventRoles, eventId, role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
