import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
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

// Admin sections, in display order. Each one is its own URL — the
// dropdown trigger replaces what used to be a single "Admin" link.
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
 * Auth-state visibility:
 *   - Floor Trials → always
 *   - Partners, Songs → when signed in
 *   - Admin → when signed in AND role === "admin"
 *   - Right side: UserButton (signed in) / Sign in button (signed out)
 */
export default function NavBar() {
  const { isAdmin } = useAuthMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  // The dropdown trigger should look "active" whenever we're on any
  // admin page, since none of the individual admin URLs are the trigger
  // itself. NavLink's isActive is per-link, so we compute this manually.
  const isAdminRoute = location.pathname.startsWith("/admin");

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

  const adminDropdownTriggerClass = cn(
    "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isAdminRoute ? "text-primary" : "text-muted-foreground hover:text-foreground"
  );

  const adminDropdownItemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "block w-full rounded-sm px-2 py-1.5 text-sm transition-colors",
      isActive
        ? "bg-accent text-accent-foreground"
        : "text-foreground hover:bg-accent hover:text-accent-foreground"
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
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger className={adminDropdownTriggerClass}>
                    Admin
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[12rem]">
                    {ADMIN_ITEMS.map((item) => (
                      <DropdownMenuItem key={item.to} asChild>
                        <NavLink to={item.to} className={adminDropdownItemClass}>
                          {item.label}
                        </NavLink>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
              {isAdmin && (
                <>
                  {/* No dropdown on mobile — admin pages get a flat list
                      under an "Admin" header so they're all reachable
                      without a nested popover. */}
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
