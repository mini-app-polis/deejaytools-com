/**
 * The bottom-right arrow on a clickable card (the session cards on the
 * event page and Floor Trials). The whole card is the link; this is its
 * affordance. Pushed to the bottom so it lines up across a row of cards
 * whose titles wrap to different heights.
 */
export default function CardArrow() {
  return (
    <span
      aria-hidden="true"
      className="mt-auto self-end pt-1 text-base font-medium text-primary transition-transform group-hover:translate-x-0.5"
    >
      →
    </span>
  );
}
