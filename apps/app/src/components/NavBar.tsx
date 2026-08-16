import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isProdHost } from "@/lib/env";
import { useAuthMe } from "@/hooks/useAuthMe";
import pkg from "../../../../package.json";

type NavItem = { to: string; label: string };

const PUBLIC_ITEMS: NavItem[] = [
  { to: "/floor-trials", label: "Floor Trials" },
];

const SIGNED_IN_ITEMS: NavItem[] = [
  { to: "/my-content", label: "My Content" },
  { to: "/my-profile", label: "My Profile" },
];

// Superuser (admin-only) sections. Test Inject moved to the Manager bar.
const SUPERUSER_ITEMS: NavItem[] = [
  { to: "/admin/events", label: "Events" },
  { to: "/admin/sessions", label: "Sessions" },
  { to: "/admin/songs", label: "Songs" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/runs", label: "Run History" },
  { to: "/admin/test-checkin", label: "Test Checkin" },
];

// Manager sections. Visible to managers and admins.
const MANAGER_ITEMS: NavItem[] = [
  { to: "/manager/active-sessions", label: "Active Sessions" },
  { to: "/manager/event-songs", label: "Event Songs" },
  { to: "/manager/upload-for", label: "Upload For" },
  { to: "/manager/checkin-for", label: "CheckIn For" },
  { to: "/manager/guide", label: "Guide" },
];

export default function NavBar() {
  const { isAdmin, isManager } = useAuthMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const showManagerBar = isAdmin || isManager;

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

  const subBarLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors",
      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <nav className="border-b border-white/[0.07] bg-black/50 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
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

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1">
            <NavLink to="/how-it-works" className={desktopLinkClass}>
              Help
            </NavLink>
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
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Superuser sub-bar — desktop, admins only */}
      <SignedIn>
        {isAdmin && (
          <div className="hidden sm:block border-t border-white/[0.07] bg-black/30">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-11 flex items-center gap-1 overflow-x-auto">
              <Badge variant="outline" className="mr-2 shrink-0 border-primary/40 text-primary">
                Superuser
              </Badge>
              {SUPERUSER_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} className={subBarLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </SignedIn>

      {/* Manager sub-bar — desktop, managers or admins */}
      <SignedIn>
        {showManagerBar && (
          <div className="hidden sm:block border-t border-white/[0.07] bg-black/20">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-11 flex items-center gap-1 overflow-x-auto">
              <Badge variant="secondary" className="mr-2 shrink-0">
                Manager
              </Badge>
              {MANAGER_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} className={subBarLinkClass}>
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
              <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={mobileLinkClass}>
                {item.label}
              </NavLink>
            ))}
            <SignedIn>
              {SIGNED_IN_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={mobileLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </SignedIn>
            <NavLink to="/how-it-works" onClick={() => setMenuOpen(false)} className={mobileLinkClass}>
              Help
            </NavLink>
            <NavLink to="/feedback" onClick={() => setMenuOpen(false)} className={mobileLinkClass}>
              Contact
            </NavLink>
            <SignedIn>
              {showManagerBar && (
                <>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                    Manager
                  </div>
                  {MANAGER_ITEMS.map((item) => (
                    <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={mobileLinkClass}>
                      {item.label}
                    </NavLink>
                  ))}
                </>
              )}
              {isAdmin && (
                <>
                  <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                    Superuser
                  </div>
                  {SUPERUSER_ITEMS.map((item) => (
                    <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={mobileLinkClass}>
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
