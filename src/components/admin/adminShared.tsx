import { Badge } from "@/components/ui/badge";

// Shared by the admin sections, so every section renders statuses, times
// and form fields the same way.

export function eventStatusBadge(status: string) {
  switch (status) {
    case "upcoming":
      return <Badge variant="default">{status}</Badge>;
    case "active":
      return (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
          {status}
        </Badge>
      );
    case "completed":
      return <Badge variant="secondary">{status}</Badge>;
    case "cancelled":
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function sessionStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return <Badge variant="secondary">{status}</Badge>;
    case "checkin_open":
      return <Badge variant="default">{status}</Badge>;
    case "in_progress":
      return (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
          {status}
        </Badge>
      );
    case "completed":
      return <Badge variant="outline">{status}</Badge>;
    case "cancelled":
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export const FIELD_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
export const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";
