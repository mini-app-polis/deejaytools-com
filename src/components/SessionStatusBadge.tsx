import { Badge } from "@/components/ui/badge";

const LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  checkin_open: "Check-in open",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function SessionStatusBadge({ status }: { status: string }) {
  const label = LABELS[status] ?? status;
  switch (status) {
    case "scheduled":
      return <Badge variant="secondary">{label}</Badge>;
    case "checkin_open":
      return <Badge variant="default">{label}</Badge>;
    case "in_progress":
      return (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
          {label}
        </Badge>
      );
    case "cancelled":
      return <Badge variant="destructive">{label}</Badge>;
    default:
      return <Badge variant="outline">{label}</Badge>;
  }
}
