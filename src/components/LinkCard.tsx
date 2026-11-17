import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CLICKABLE_CARD_CLASS } from "@/lib/clickable";
import { cn } from "@/lib/utils";

/**
 * The one clickable card layout, shared by the session, event and staff
 * event cards so they read alike on every page and stay short:
 *
 *   [badges ………………………]
 *   Title  [title aside]
 *   detail · detail                      →
 *
 * The whole card is the link (middle-click and "copy link" work); the arrow
 * in the bottom-right corner is its affordance. `h-full` with the last row
 * pushed down keeps the arrows level across a grid row.
 */
export default function LinkCard({
  to,
  badges,
  title,
  titleAside,
  details,
  className,
}: {
  to: string;
  /** Labels above the title (event, status); they truncate rather than wrap the card taller. */
  badges?: ReactNode;
  title: ReactNode;
  /** Beside the title, e.g. the timezone badge. */
  titleAside?: ReactNode;
  /** One or two short lines under the title. */
  details?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex h-full flex-col gap-1.5 rounded-lg border bg-card px-4 py-3 shadow-sm",
        CLICKABLE_CARD_CLASS,
        className
      )}
    >
      {badges && <div className="flex min-w-0 items-center gap-2 overflow-hidden">{badges}</div>}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium leading-snug transition-colors group-hover:text-primary">
        {title}
        {titleAside}
      </p>
      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-0.5 text-sm text-muted-foreground">{details}</div>
        <span
          aria-hidden="true"
          className="shrink-0 text-base font-medium leading-none text-primary transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </div>
    </Link>
  );
}
