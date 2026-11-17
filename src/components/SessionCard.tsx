import LinkCard from "@/components/LinkCard";
import SessionStatusBadge from "@/components/SessionStatusBadge";
import { Badge } from "@/components/ui/badge";
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr } from "@/lib/sessionFormat";
import type { ApiSession } from "@/schemas";

type SessionLike = Pick<
  ApiSession,
  "id" | "name" | "date" | "status" | "checkin_opens_at" | "floor_trial_starts_at" | "floor_trial_ends_at"
>;

/**
 * A floor-trial session as a card (LinkCard), the same on Floor Trials, the
 * event page and the sessions list: event and status, the session's day and
 * time with its timezone, and when check-in opens and the floor trial runs,
 * on one line.
 */
export default function SessionCard({
  session: s,
  eventName,
  eventTz,
}: {
  session: SessionLike;
  /** Shown as a badge where the page lists sessions from more than one event. */
  eventName?: string | null;
  eventTz: string | null;
}) {
  return (
    <LinkCard
      to={`/sessions/${s.id}`}
      badges={
        <>
          {eventName && (
            <Badge
              variant="outline"
              title={eventName}
              className="min-w-0 truncate border-primary/40 bg-primary/10 font-medium text-primary"
            >
              <span className="truncate">{eventName}</span>
            </Badge>
          )}
          <span className="shrink-0">
            <SessionStatusBadge status={s.status} />
          </span>
        </>
      }
      title={formatSessionTitle(s, eventTz)}
      titleAside={
        eventTz && (
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            {formatTimezoneAbbr(eventTz, s.floor_trial_starts_at)}
          </Badge>
        )
      }
      details={
        <p>
          Check-in {formatTimeOnly(s.checkin_opens_at, eventTz)} · Floor trial{" "}
          {formatTimeOnly(s.floor_trial_starts_at, eventTz)} – {formatTimeOnly(s.floor_trial_ends_at, eventTz)}
        </p>
      }
    />
  );
}
