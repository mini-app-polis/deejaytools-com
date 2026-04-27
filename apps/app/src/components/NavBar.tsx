import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthMe } from "@/hooks/useAuthMe";
import pkg from "../../../../package.json";

type NavItem = { to: string; label: string };

// Public: always shown.
const PUBLIC_ITEMS: NavItem[] = [{ to: "/floor-trials", label: "Floor Trials" }];

// Signed-in only.
const SIGNED_IN_ITEMS: NavItem[] = [
  { to: "/partners", label: "Partners" },
  { to: "/songs", label: "Songs" },
];

/**
 * Shared top navigation. Used by both the public LandingPage and the
 * authenticated-app Layout so the bar looks identical regardless of route.
 *
 * Auth-state visibility:
 *   - Floor Trials → always
 *   - Partners, Songs → when signed in
 *   - Admin → when signed in AND role === "admin"
 *   - Right side: UserButton (signed in) / Sign in button (signed out)
 */
export default function NavBar() {
  const { isAdmin } = useAuthMe();
  const [menuOpen, setMenuOpen] = useState(false);

  const adminItem: NavItem | null = isAdmin ? { to: "/admin", label: "Admin" } : null;

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

  return (
    <nav className="border-b border-white/[0.07] bg-black/50 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Wordmark — links to root. */}
        <a href="/" className="flex flex-col leading-tight shrink-0 group">
          <span
            className="font-medium text-sm tracking-wide text-foreground transition-colors group-hover:text-primary"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            DeejayTools.com
          </span>
          <span
            className="text-[10px] text-muted-foreground"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            v{pkg.version}
          </span>
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
            {adminItem && (
              <NavLink to={adminItem.to} className={desktopLinkClass}>
                {adminItem.label}
              </NavLink>
            )}
          </SignedIn>
        </div>

        {/* Right cluster: user menu / sign-in + hamburger */}
        <div className="flex items-center gap-3">
          <SignedIn>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <SignInButton forceRedirectUrl="/partners" signUpForceRedirectUrl="/partners">
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
              {adminItem && (
                <NavLink
                  to={adminItem.to}
                  onClick={() => setMenuOpen(false)}
                  className={mobileLinkClass}
                >
                  {adminItem.label}
                </NavLink>
              )}
            </SignedIn>
          </div>
        </div>
      )}
    </nav>
  );
}
