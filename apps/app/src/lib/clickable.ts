/**
 * Shared hover/affordance class strings for full-card and table-row click
 * targets. Centralized so the homepage cards, the FloorTrials cards, the
 * SessionsPage and EventsPage mobile cards, and every clickable TableRow
 * share the exact same hover treatment. The look is intentionally dramatic
 * — brand-tinted background and border, gentle lift on cards — so it's
 * obvious the surface is clickable without needing a separate "Open" button.
 *
 * Usage:
 *   <Link className={cn("rounded-xl border bg-card p-4", CLICKABLE_CARD_CLASS)}>
 *     <p className="group-hover:text-primary transition-colors">Title</p>
 *   </Link>
 *
 *   <TableRow className={CLICKABLE_ROW_CLASS} onClick={...}>
 *     <TableCell>...</TableCell>
 *   </TableRow>
 *
 * Tip: pair these with `group` so child text can react via `group-hover:`.
 * `CLICKABLE_CARD_CLASS` already includes `group`; `CLICKABLE_ROW_CLASS`
 * does too.
 */

/**
 * Full-card click target — wraps a Link or button-shaped surface.
 *
 * Hover effect:
 *   - background tinted with the brand primary at 10% alpha
 *   - border shifts to the brand primary at 50% alpha
 *   - card lifts 2px upward
 *   - shadow deepens from md → lg
 *   - smooth 200ms transition for everything at once
 *   - active (mousedown / tap): card returns to baseline so the press feels
 *     responsive and crisp
 */
export const CLICKABLE_CARD_CLASS =
  "group transition-all duration-200 cursor-pointer " +
  "hover:bg-primary/10 hover:border-primary/50 hover:shadow-lg " +
  "hover:-translate-y-0.5 active:translate-y-0 active:shadow-md " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Clickable <TableRow>. Tables don't transform gracefully (translate/scale
 * break the cell borders), so this is bg-tint only — but the brand-color
 * tint is still visibly different from shadcn's default `bg-muted/50` row
 * hover, so the row stands out the moment the cursor enters it.
 *
 * Use cn() (twMerge) when applying — TableRow's base class already includes
 * `hover:bg-muted/50`, and twMerge will let `hover:bg-primary/10` win.
 */
export const CLICKABLE_ROW_CLASS =
  "group cursor-pointer transition-colors duration-200 " +
  "hover:bg-primary/10";
