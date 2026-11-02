import { Badge } from "@/components/ui/badge";

// Shared by the admin sections, so every section renders statuses and times
// the same way.

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

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}
