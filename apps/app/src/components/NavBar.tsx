import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthMe } from "@/hooks/useAuthMe";
import pkg from "../../../../package.json";

type NavItem = { to: string; label: string };

// Public: always shown (left side).
const PUBLIC_ITEMS: NavItem[] = [{ to: "/floor-trials", label: "Floor Trials" }];

// Signed-in only.
const SIGNED_IN_ITEMS: NavItem[] = [
  { to: "/my-content", label: "My Content" },
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
            <span
              className="text-[10px] text-muted-foreground"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              v{pkg.version}
            </span>
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

        {/* Right cluster: Contact, Admin (if admin), user menu / sign-in, hamburger */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1">
            <NavLink to="/feedback" className={desktopLinkClass}>
              Contact
            </NavLink>
            <SignedIn>
              {adminItem && (
                <NavLink to={adminItem.to} className={desktopLinkClass}>
                  {adminItem.label}
                </NavLink>
              )}
            </SignedIn>
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
