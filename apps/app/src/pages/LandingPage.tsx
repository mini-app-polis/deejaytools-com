import { Link } from "react-router-dom";
import NavBar from "@/components/NavBar";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_CLASS } from "@/lib/clickable";

/**
 * Public landing page.
 *
 * The page is deliberately thin: a short pitch in the hero, then a card
 * grid that points visitors at every real entry point on the site. There's
 * no inline how-it-works section anymore — that material moved to its own
 * /how-it-works page (linked from one of the cards) where each step has
 * room to actually be useful instead of a one-line summary.
 *
 * Auth-gated cards (My Content) link straight to their routes;
 * Clerk's RequireAuth wrapper redirects signed-out users to sign-in.
 */

type CardDef = {
  to: string;
  eyebrow: string;
  title: string;
  body: string;
};

// Card order — the long-form guide leads, then the in-the-moment action,
// then the user's own data, then the read-only catalog. This top-down
// reading order matches how a competitor would naturally use the site:
// learn, then act, then look up.
const CARDS: CardDef[] = [
  {
    to: "/how-it-works",
    eyebrow: "Start here",
    title: "How Floor Trials Work",
    body: "What a floor trial is, how to submit music, what happens at the event, and how the queue is ordered.",
  },
  {
    to: "/floor-trials",
    eyebrow: "Now / next",
    title: "Active Floor Trials",
    body: "See active and upcoming sessions. Open one to check in and watch the live queue.",
  },
  {
    to: "/my-content",
    eyebrow: "Signed in",
    title: "My Content",
    body: "Manage your partners, songs, and see where you're currently checked in.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">

        {/* Hero */}
        <section className="py-14 sm:py-20 border-b border-white/[0.07]">
          <p
            className="text-[10px] font-medium tracking-[0.18em] uppercase text-primary mb-5"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            West Coast Swing · Floor Trials
          </p>
          <h1
            className="text-4xl sm:text-6xl font-black italic leading-[0.95] tracking-tight mb-6"
            style={{ fontFamily: "'Fraunces', ui-serif, serif", fontVariationSettings: "'opsz' 72" }}
          >
            Music management<br />
            <span className="text-muted-foreground">for competitors</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md font-light">
            Look up your submitted music, learn how floor trials work,
            and check in when it's time to run.
          </p>
        </section>

        {/* Card grid — main entry points */}
        <section className="py-10 sm:py-14">
          <SectionLabel>Where do you want to go?</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CARDS.map((card) => (
              <Link
                key={card.to}
                to={card.to}
                className={cn(
                  "rounded-xl border border-white/[0.07] bg-card px-5 py-5 flex flex-col",
                  CLICKABLE_CARD_CLASS
                )}
              >
                <p
                  className="text-[10px] font-medium tracking-[0.18em] uppercase text-primary/60 mb-3"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  {card.eyebrow}
                </p>
                <p className="text-base font-medium text-foreground mb-1 transition-colors group-hover:text-primary">
                  {card.title}
                </p>
                <p className="text-sm text-muted-foreground font-light leading-relaxed flex-1">
                  {card.body}
                </p>
                <p
                  className="mt-4 text-xs text-muted-foreground/60 transition-colors group-hover:text-primary"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  → open
                </p>
              </Link>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span
        className="text-[10px] font-medium tracking-[0.18em] uppercase text-primary/60 shrink-0"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {children}
      </span>
      <div className="flex-1 h-px bg-white/[0.07]" />
    </div>
  );
}
