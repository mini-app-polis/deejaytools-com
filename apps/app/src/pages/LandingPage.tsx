import { Link } from "react-router-dom";
import NavBar from "@/components/NavBar";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_CLASS } from "@/lib/clickable";

/**
 * Public landing page.
 *
 * The page intentionally does very little: it orients first-time visitors
 * with a short pitch, points them at the four real entry points via a card
 * grid, and ends with a 4-step "how it works" reference. Auth-gated cards
 * (My Songs, My Partners) link straight to their routes — Clerk's
 * RequireAuth wrapper will redirect signed-out users to sign-in.
 *
 * Earlier iterations bundled the legacy-songs search and an Operator CTA
 * here. The search now lives at /music-history and the CTA collapsed into
 * the shared NavBar's Sign in button.
 */

const STEPS = [
  {
    num: "01",
    title: "Submit your music",
    body: "File should contain only your routine — no bow music. DJ starts from the top unless you note a cue during check-in.",
  },
  {
    num: "02",
    title: "Check in",
    body: "Opens 30 min before the session. Submit once per run. Include any special instructions in the form.",
  },
  {
    num: "03",
    title: "Watch the queue",
    body: "Same-day runs 1–3 get priority. Run 4+ moves to standard queue. Watch the live display for your name.",
  },
  {
    num: "04",
    title: "Run your routine",
    body: "~5 min per couple, ~10 for teams. Restart available if you're under halfway through. Re-queue with a new check-in.",
  },
];

type CardDef = {
  to: string;
  eyebrow: string;
  title: string;
  body: string;
};

// Cards render in this order. Floor Trials first because it's the in-the-
// moment action; the two signed-in cards trail because most visitors land
// here in a checked-out state.
const CARDS: CardDef[] = [
  {
    to: "/floor-trials",
    eyebrow: "Now / next",
    title: "Floor Trials",
    body: "See active and upcoming sessions. Open one to check in and watch the live queue.",
  },
  {
    to: "/music-history",
    eyebrow: "Past submissions",
    title: "Music history",
    body: "Search the catalog of submitted music to confirm yours is on file.",
  },
  {
    to: "/songs",
    eyebrow: "Signed in",
    title: "My Songs",
    body: "Manage the music files you've submitted for your routines.",
  },
  {
    to: "/partners",
    eyebrow: "Signed in",
    title: "My Partners",
    body: "Add and manage the partners you check in with.",
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
        <section className="py-10 sm:py-14 border-b border-white/[0.07]">
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

        {/* How it works */}
        <section className="py-10 sm:py-14">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="text-xl sm:text-2xl font-light tracking-tight mb-1">
            Floor trial process
          </h2>
          <p className="text-sm text-muted-foreground mb-8 font-light">
            The short version — everything you need to know to run.
          </p>

          <div className="divide-y divide-border">
            {STEPS.map((step) => (
              <div key={step.num} className="py-5 grid grid-cols-[40px_1fr] gap-4 items-start">
                <span
                  className="text-xs font-medium text-primary/50 pt-0.5 tabular-nums"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  {step.num}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">{step.title}</p>
                  <p className="text-sm text-muted-foreground font-light leading-relaxed">{step.body}</p>
                </div>
              </div>
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
