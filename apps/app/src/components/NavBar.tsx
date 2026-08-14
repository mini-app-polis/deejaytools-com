import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isProdHost } from "@/lib/env";
import { useAuthMe } from "@/hooks/useAuthMe";
import pkg from "../../../../package.json";

type NavItem = { to: string; label: string };

// Public: always shown (left side).
const PUBLIC_ITEMS: NavItem[] = [{ to: "/floor-trials", label: "Floor Trials" }];

// Signed-in only.
const SIGNED_IN_ITEMS: NavItem[] = [
  { to: "/my-content", label: "My Content" },
  { to: "/my-profile", label: "My Profile" },
];

// Admin sections, in display order. Rendered as a dedicated admin sub-navbar
// (desktop) and as a flat list in the mobile menu.
const ADMIN_ITEMS: NavItem[] = [
  { to: "/admin/events", label: "Events" },
  { to: "/admin/sessions", label: "Sessions" },
  { to: "/admin/queue", label: "Live Queue" },
  { to: "/admin/runs", label: "Run History" },
  { to: "/admin/inject", label: "Test Inject" },
  { to: "/admin/songs", label: "Songs" },
  { to: "/admin/event-songs", label: "Event Songs" },
  { to: "/admin/users", label: "Users" },
];

/**
 * Shared top navigation. Used by both the public LandingPage and the
 * authenticated-app Layout so the bar looks identical regardless of route.
 *
 * Admins additionally get a second sticky bar below the main one containing
 * the admin sections (desktop only). On mobile those live in the hamburger.
 */
export default function NavBar() {
  const { isAdmin } = useAuthMe();
  const [menuOpen, setMenuOpen] = useState(false);

  const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-full px-3 py-1.5 text-sm transition-colors",
      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
    );

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "px-4 py-3 rounded-xl text-sm transition-colors",
      isActive
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
    );

  const adminBarLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors",
      isActive
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground"
    );

  return (
    <nav className="border-b border-white/[0.07] bg-black/50 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo — links to root. The square DJT icon plus a wordmark. */}
        <a href="/" className="flex items-center gap-2 shrink-0 group">
          <picture>
            <source srcSet="/assets/icons/icon-192x192.webp" type="image/webp" />
            <img
              src="/assets/icons/icon-192x192.png"
              alt="DeejayTools"
              className="h-9 w-9 object-contain transition-opacity group-hover:opacity-80"
            />
          </picture>
          <div className="flex flex-col leading-tight">
            <span
              className="font-medium text-sm tracking-wide text-foreground transition-colors group-hover:text-primary"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              DeejayTools.com
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] text-muted-foreground"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                v{pkg.version}
              </span>
              {!isProdHost() && (
                <span className="rounded bg-amber-500/20 text-amber-500 text-[10px] px-1.5 py-0.5 font-medium">
                  DEV
                </span>
              )}
            </div>
          </div>
        </a>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1 flex-1 ml-6">
          {PUBLIC_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={desktopLinkClass}>
              {item.label}
            </NavLink>
          ))}
          <SignedIn>
            {SIGNED_IN_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={desktopLinkClass}>
                {item.label}
              </NavLink>
            ))}
          </SignedIn>
        </div>

        {/* Right cluster: Contact, user menu / sign-in, hamburger */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1">
            <NavLink to="/feedback" className={desktopLinkClass}>
              Contact
            </NavLink>
          </div>
          <SignedIn>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <SignInButton forceRedirectUrl="/my-content" signUpForceRedirectUrl="/my-content">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </SignInButton>
          </SignedOut>
          <button
            className="sm:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                <path
                  d="M3 5h14M3 10h14M3 15h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Admin sub-navbar — desktop only, admins only. Sticks with the main
          nav since the whole <nav> is sticky. Horizontally scrollable if the
          links overflow. */}
      <SignedIn>
        {isAdmin && (
          <div className="hidden sm:block border-t border-white/[0.07] bg-black/30">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-11 flex items-center gap-1 overflow-x-auto">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 mr-2 shrink-0">
                Admin
              </span>
              {ADMIN_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} className={adminBarLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </SignedIn>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-white/[0.07] bg-background">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-1">
            {PUBLIC_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={mobileLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
            <SignedIn>
              {SIGNED_IN_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={mobileLinkClass}
                >
                  {item.label}
                </NavLink>
              ))}
            </SignedIn>
            <NavLink
              to="/feedback"
              onClick={() => setMenuOpen(false)}
              className={mobileLinkClass}
            >
              Contact
            </NavLink>
            <SignedIn>
              {isAdmin && (
                <>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                    Admin
                  </div>
                  {ADMIN_ITEMS.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className={mobileLinkClass}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </>
              )}
            </SignedIn>
          </div>
        </div>
      )}
    </nav>
  );
}
