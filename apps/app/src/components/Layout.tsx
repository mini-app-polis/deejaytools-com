import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import AuthSync from "@/components/AuthSync";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthMe } from "@/hooks/useAuthMe";
import pkg from "../../../../package.json";

type NavItem = { to: string; label: string };

// Floor Trials is public — always shown.
const PUBLIC_ITEMS: NavItem[] = [
  { to: "/floor-trials", label: "Floor Trials" },
];

// Only shown to signed-in users.
const SIGNED_IN_ITEMS: NavItem[] = [
  { to: "/partners", label: "Partners" },
  { to: "/songs", label: "Songs" },
];

export default function Layout() {
  const { isAdmin } = useAuthMe();
  const [menuOpen, setMenuOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-full px-3 py-1.5 text-sm transition-colors",
      isActive
        ? "text-primary"
        : "text-muted-foreground hover:text-foreground"
    );

  // Build the nav based on auth state. The signed-in items are wrapped in
  // <SignedIn> at render time so they appear/disappear reactively without us
  // needing to re-derive a list.
  const adminItem: NavItem | null = isAdmin ? { to: "/admin", label: "Admin" } : null;

  return (
    <div className="min-h-screen bg-background">
      {/* AuthSync only fires when the user is signed in. Mounting it here keeps
          it out of the public-only landing page. */}
      <SignedIn>
        <AuthSync />
      </SignedIn>

      {/* Nav */}
      <nav className="border-b border-white/[0.07] bg-black/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Wordmark */}
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
              <NavLink key={item.to} to={item.to} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
            <SignedIn>
              {SIGNED_IN_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} className={linkClass}>
                  {item.label}
                </NavLink>
              ))}
              {adminItem && (
                <NavLink to={adminItem.to} className={linkClass}>
                  {adminItem.label}
                </NavLink>
              )}
            </SignedIn>
          </div>

          {/* Right: user menu OR sign-in button + hamburger */}
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
            {/* Hamburger — mobile only */}
            <button
              className="sm:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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
                  className={({ isActive }) =>
                    cn(
                      "px-4 py-3 rounded-xl text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )
                  }
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
                    className={({ isActive }) =>
                      cn(
                        "px-4 py-3 rounded-xl text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
                {adminItem && (
                  <NavLink
                    to={adminItem.to}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "px-4 py-3 rounded-xl text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                      )
                    }
                  >
                    {adminItem.label}
                  </NavLink>
                )}
              </SignedIn>
            </div>
          </div>
        )}
      </nav>

      {/* Page content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 w-full">
        <Outlet />
      </main>
    </div>
  );
}
