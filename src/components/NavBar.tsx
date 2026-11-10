import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ADMIN_SECTION_LABELS, ADMIN_SECTIONS } from "@/lib/adminSections";
import { MANAGER_SECTION_LABELS, MANAGER_SECTIONS } from "@/lib/managerSections";
import { cn } from "@/lib/utils";
import { isProdHost } from "@/lib/env";
import { useApiVersion } from "@/hooks/useApiVersion";
import { useAuthMe } from "@/hooks/useAuthMe";
import { EVENT_ROLE_LABELS } from "@/lib/eventRoles";
import { viewAsDestination } from "@/lib/adminViewAs";
import { setViewAs, VIEW_AS_ROLES, type ViewAs, type ViewAsRole } from "@/lib/viewAs";
import { rolesHeld, staffPagePath, staffPagesFor } from "@/lib/staffPages";
import pkg from "../../package.json";

type NavItem = { to: string; label: string };

const PUBLIC_ITEMS: NavItem[] = [
  { to: "/events", label: "Events" },
  { to: "/floor-trials", label: "Floor Trials" },
];

const SIGNED_IN_ITEMS: NavItem[] = [
  { to: "/my-content", label: "My Content" },
  { to: "/my-profile", label: "My Profile" },
];

// Every admin page, admin then manager sections, in the Admin bar: admins only.
const ADMIN_ITEMS: NavItem[] = [
  ...ADMIN_SECTIONS.map((s) => ({ to: `/admin/${s}`, label: ADMIN_SECTION_LABELS[s] })),
  ...MANAGER_SECTIONS.map((s) => ({ to: `/manager/${s}`, label: MANAGER_SECTION_LABELS[s] })),
];

// First in the Event staff bar: every event the caller is on the staff of.
const MY_EVENTS_ITEM: NavItem = { to: "/my-events", label: "My events" };

// Stamped at build time by vite.config.ts. Empty when the sha could not be
// resolved (no git, no CF_PAGES_COMMIT_SHA), in which case we show the version.
const buildSha = import.meta.env.VITE_COMMIT_SHA ?? "";

export default function NavBar() {
  const { isAdmin, eventRoles, realIsAdmin, viewAs } = useAuthMe();
  // The Event staff bar: the roles held on any event, and the staff pages
  // they open; each page picks one of the caller's events, as admin pages do.
  const staffRoles = rolesHeld(eventRoles).map((r) => EVENT_ROLE_LABELS[r]);
  const staffLinks: NavItem[] = staffPagesFor(eventRoles).map((p) => ({ to: staffPagePath(p.slug), label: p.label }));
  // Dev and preview hosts show the commit instead of the semver version: the
  // version only moves on release, so it cannot identify a dev build.
  const showSha = !isProdHost() && buildSha !== "";
  // The API's version beside the site's, by the same rule: the commit on dev
  // and preview hosts, the release version in production. Left out until it
  // loads, and whenever the API cannot say.
  const api = useApiVersion();
  const apiShortSha = api?.commit ? api.commit.slice(0, 7) : "";
  const apiLabel = api
    ? !isProdHost() && apiShortSha
      ? `api #${apiShortSha}`
      : `api v${api.version}`
    : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  // Escape closes the open mobile menu and puts focus back on its toggle.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuToggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

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
    <header className="border-b border-white/[0.07] bg-black/50 backdrop-blur-md sticky top-0 z-40">
      <SignedIn>{realIsAdmin && viewAs && <ViewAsBanner view={viewAs} />}</SignedIn>
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
                title={buildSha ? `v${pkg.version} · ${buildSha}` : `v${pkg.version}`}
              >
                {showSha ? `#${buildSha}` : `v${pkg.version}`}
              </span>
              {apiLabel && (
                <span
                  className="text-[10px] text-muted-foreground"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                  title={
                    apiShortSha
                      ? `api v${api?.version} · ${apiShortSha}`
                      : `api v${api?.version}`
                  }
                >
                  · {apiLabel}
                </span>
              )}
              {!isProdHost() && (
                <span className="rounded bg-amber-500/20 text-amber-500 text-[10px] px-1.5 py-0.5 font-medium">
                  DEV
                </span>
              )}
            </div>
          </div>
        </a>

        {/* Desktop nav */}
        <nav aria-label="Main" className="hidden sm:flex items-center gap-1 flex-1 ml-6">
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
        </nav>

        <div className="flex items-center gap-3">
          <nav aria-label="Help and contact" className="hidden sm:flex items-center gap-1">
            <NavLink to="/how-it-works" className={desktopLinkClass}>
              Help
            </NavLink>
            <NavLink to="/feedback" className={desktopLinkClass}>
              Contact
            </NavLink>
          </nav>
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
            ref={menuToggleRef}
            type="button"
            className="sm:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            {menuOpen ? (
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Event staff bar — desktop: the roles the caller holds, and the staff pages they open */}
      <SignedIn>
        {staffLinks.length > 0 && (
          <nav aria-label="Event staff" className="hidden sm:block border-t border-white/[0.07] bg-black/30">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-11 py-1.5 flex flex-wrap items-center gap-1">
              <Badge variant="outline" className="mr-2 shrink-0 border-primary/40 text-primary">
                {staffRoles.join(" · ")}
              </Badge>
              <NavLink to={MY_EVENTS_ITEM.to} end className={subBarLinkClass}>
                {MY_EVENTS_ITEM.label}
              </NavLink>
              {staffLinks.map((item) => (
                <NavLink key={item.to} to={item.to} className={subBarLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </SignedIn>

      {/* Admin bar — desktop, admins only: every admin page */}
      <SignedIn>
        {isAdmin && (
          <nav aria-label="Admin" className="hidden sm:block border-t border-white/[0.07] bg-black/20">
            {/* Wraps rather than scrolls, so no admin page is hidden off the edge. */}
            <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-11 py-1.5 flex flex-wrap items-center gap-1">
              <Badge variant="secondary" className="mr-2 shrink-0">
                Admin
              </Badge>
              {ADMIN_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} className={subBarLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
        {isAdmin && <ViewAsPicker />}
      </SignedIn>

      {/* Mobile menu — in the DOM while closed too, so the toggle's aria-controls always points at it */}
      <nav id="mobile-menu" aria-label="Menu" hidden={!menuOpen} className="sm:hidden border-t border-white/[0.07] bg-background">
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
            {staffLinks.length > 0 && (
              <>
                <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Event staff · {staffRoles.join(" · ")}
                </div>
                <NavLink to={MY_EVENTS_ITEM.to} end onClick={() => setMenuOpen(false)} className={mobileLinkClass}>
                  {MY_EVENTS_ITEM.label}
                </NavLink>
                {staffLinks.map((item) => (
                  <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={mobileLinkClass}>
                    {item.label}
                  </NavLink>
                ))}
              </>
            )}
            {isAdmin && (
              <>
                <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Admin
                </div>
                {ADMIN_ITEMS.map((item) => (
                  <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={mobileLinkClass}>
                    {item.label}
                  </NavLink>
                ))}
              </>
            )}
          </SignedIn>
        </div>
      </nav>
    </header>
  );
}

const VIEW_AS_LABELS: Record<ViewAsRole, string> = { ...EVENT_ROLE_LABELS, dancer: "Dancer" };

/** Start or switch a view-as, landing on the page that role would see in place of this one. */
function useStartViewAs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (view: ViewAs) => {
    setViewAs(view);
    const to = viewAsDestination(pathname, view);
    if (to !== pathname) navigate(to);
  };
}

/**
 * Admins only, under the Admin bar: view the whole site (menus, bars, pages)
 * as one of the staff roles, held on every event, or as a dancer. No event is
 * picked here: each staff page picks its event, as the admin pages do.
 */
function ViewAsPicker() {
  const start = useStartViewAs();
  return (
    <nav aria-label="View as" className="hidden sm:block border-t border-white/[0.07] bg-black/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-10 py-1 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground whitespace-nowrap">View the site as</span>
        {VIEW_AS_ROLES.map((role) => (
          <button
            key={role}
            type="button"
            className="rounded-full px-3 py-1 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => start({ role })}
          >
            {VIEW_AS_LABELS[role]}
          </button>
        ))}
      </div>
    </nav>
  );
}

/**
 * Admins only, while viewing as someone else: always on top, on every page
 * and on phones too, so the way back is never hidden. Switches role in place
 * or exits.
 */
function ViewAsBanner({ view }: { view: ViewAs }) {
  const start = useStartViewAs();

  return (
    <div role="region" aria-label="Viewing as" className="border-b border-amber-500/30 bg-amber-500/15">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-9 py-1 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-amber-200">
          Viewing as {VIEW_AS_LABELS[view.role]}
        </span>
        <span className="text-amber-200/70">switch to</span>
        {VIEW_AS_ROLES.filter((r) => r !== view.role).map((role) => (
          <button
            key={role}
            type="button"
            className="rounded-full px-2 py-0.5 text-amber-100/80 hover:text-amber-50"
            onClick={() => start({ role })}
          >
            {VIEW_AS_LABELS[role]}
          </button>
        ))}
        <Button size="sm" variant="outline" className="ml-auto h-7 border-amber-400/50 text-amber-100" onClick={() => setViewAs(null)}>
          Exit view
        </Button>
      </div>
    </div>
  );
}
