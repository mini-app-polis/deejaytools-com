import SessionFormDialog from "@/components/SessionFormDialog";
import type { ApiEvent, ApiSession } from "@/schemas";

/**
 * The admin Sessions page's create / edit dialog: the shared session form,
 * with the event picker. Mounted only while open.
 */
export default function AdminSessionDialog({
  editing,
  events,
  onClose,
}: {
  editing: ApiSession | null;
  events: ApiEvent[] | null;
  onClose: () => void;
}) {
  return <SessionFormDialog editing={editing} events={events} onClose={onClose} />;
}
