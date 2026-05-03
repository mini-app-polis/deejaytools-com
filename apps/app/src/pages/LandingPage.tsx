import { SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import NavBar from "@/components/NavBar";
import { cn } from "@/lib/utils";
import { CLICKABLE_CARD_CLASS } from "@/lib/clickable";

/**
 * Public landing page.
 *
 * The page is deliberately thin: a short pitch in the hero, then a card
 * grid that points visitors at every real entry point on the site.
 *
 * Card kinds:
 *   - "public":  always navigates straight to the destination
 *   - "auth":    when signed in, behaves like "public"; when signed out,
 *                opens Clerk's sign-in modal and redirects to the
 *                destination on success — so a signed-out click on
 *                "My Content" doesn't bounce the user through the
 *                RequireAuth wrapper, it asks for credentials in place
 */

type PublicCard = {
  kind: "public";
  to: string;
  eyebrow: string;
  title: string;
  body: string;
};

type AuthCard = {
  kind: "auth";
  to: string;
  eyebrow: string;
  title: string;
  body: string;
};

type CardDef = PublicCard | AuthCard;

// Card order matches reading flow: learn → act → manage your stuff → tell us
// what's broken. The auth-gated card sits in the middle so the layout stays
// the same whether you're signed in or out.
const CARDS: CardDef[] = [
  {
    kind: "public",
    to: "/how-it-works",
    eyebrow: "Start here",
    title: "How Floor Trials Work",
    body: "What a floor trial is, how to submit music, what happens at the event, and how the queue is ordered.",
  },
  {
    kind: "public",
    to: "/floor-trials",
    eyebrow: "Now / next",
    title: "Active Floor Trials",
    body: "See active and upcoming sessions. Open one to check in and watch the live queue.",
  },
  {
    kind: "auth",
    to: "/my-content",
    eyebrow: "Sign in required",
    title: "My Content",
    body: "Manage your partners, songs, and see where you're currently checked in.",
  },
  {
    kind: "public",
    to: "/feedback",
    eyebrow: "Help us improve",
    title: "Feedback",
    body: "Report a bug, request a feature, or send the deejay team a note.",
  },
];

const CARD_BOX_CLASS = cn(
  "rounded-xl border border-white/[0.07] bg-card px-5 py-5 flex flex-col text-left",
  CLICKABLE_CARD_CLASS
);

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
            {CARDS.map((card) =>
              card.kind === "auth" ? (
                <AuthCardLink key={card.to} card={card} />
              ) : (
                <Link key={card.to} to={card.to} className={CARD_BOX_CLASS}>
                  <CardSurface card={card} />
                </Link>
              )
            )}
          </div>
        </section>

      </main>
    </div>
  );
}

/**
 * Card that renders as a normal Link when the user is signed in, and as a
 * Clerk SignInButton trigger when they're not. The visible content is
 * identical in both cases — only the click behavior differs.
 *
 * `forceRedirectUrl` + `signUpForceRedirectUrl` send the user back to
 * `card.to` after the modal closes successfully, so the click feels like
 * "this opened the page" with a one-step auth detour in the middle.
 */
function AuthCardLink({ card }: { card: AuthCard }) {
  return (
    <>
      <SignedIn>
        <Link to={card.to} className={CARD_BOX_CLASS}>
          <CardSurface card={card} />
        </Link>
      </SignedIn>
      <SignedOut>
        <SignInButton
          mode="modal"
          forceRedirectUrl={card.to}
          signUpForceRedirectUrl={card.to}
        >
          {/* The card is the click target. SignInButton attaches its handler
              to whatever you put inside it, so a `<button>` wrapping the
              same surface keeps keyboard + screen-reader semantics. */}
          <button type="button" className={CARD_BOX_CLASS}>
            <CardSurface card={card} />
          </button>
        </SignInButton>
      </SignedOut>
    </>
  );
}

function CardSurface({ card }: { card: CardDef }) {
  return (
    <>
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
    </>
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
