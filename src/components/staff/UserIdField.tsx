import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Where the event's staff name the person they act for or add to the staff.
 * The admin pages pick people from a user search, but that search is
 * admin-only and no event-scoped lookup exists, so staff enter a user id.
 */
export default function UserIdField({
  id,
  value,
  onChange,
  label = "Dancer's user id",
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="user_…"
        autoComplete="off"
      />
      <p className="text-xs text-muted-foreground">
        Finding someone by name needs the admin user search, so an organizer looks the id up.
      </p>
    </div>
  );
}
