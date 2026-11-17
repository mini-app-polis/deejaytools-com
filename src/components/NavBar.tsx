import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import {
  rolesHeld,
  staffBarRole,
  staffPagePath,
  staffPagesForRole,
  type StaffBarChoice,
} from "@/lib/staffPages";
import type { EventStaffRole } from "@/schemas";
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

// Last in the Event staff bar, for every staff role: the operations guide.
const GUIDE_ITEM: NavItem = { to: "/guide", label: "Guide" };

// Stamped at build time by vite.config.ts. Empty when the sha could not be
// resolved (no git, no CF_PAGES_COMMIT_SHA), in which case we show the version.
const buildSha = import.meta.env.VITE_COMMIT_SHA ?? "";

export default function NavBar() {
  const { isAdmin, eventRoles, realIsAdmin, viewAs } = useAuthMe();
  // The Event staff bar, for anyone holding a staff role on any event: a
  // User choice and the roles held, one of them selected, and the staff
  // pages the selected role opens (none for User). Each page picks one of
  // the caller's events, as admin pages do. Staff start on User; an admin
  // starts on their richest role, and an admin viewing as a role is on it.
  const heldRoles = rolesHeld(eventRoles);
  const [chosenRole, chooseRole] = useStaffBarChoice();
  const staffRole = viewAs
    ? staffBarRole(eventRoles, null, heldRoles.at(-1) ?? null)
    : staffBarRole(eventRoles, chosenRole, realIsAdmin ? (heldRoles.at(-1) ?? null) : null);
  const staffLinks: NavItem[] = staffRole
    ? [
        ...staffPagesForRole(staffRole).map((p) => ({ to: staffPagePath(p.slug), label: p.label })),
        GUIDE_ITEM,
      ]
    : [];
  const showStaffBar = heldRoles.length > 0;
  // While viewing as a role, the bar shows only that role: the view-as row
  // is where it is switched.
  const offerUser = !viewAs;
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
  const headerRef = useRef<HTMLElement>(null);

  // The header's height as --app-header-height on the page, kept current as
  // its bars come and go, so a page's own sticky bar (the event page's
  // title) can sit just under it.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--app-header-height", `${el.offsetHeight}px`);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
    <header ref={headerRef} className="border-b border-white/[0.07] bg-black/50 backdrop-blur-md sticky top-0 z-40">
      <SignedIn>{realIsAdmin && <ViewAsRow view={viewAs} />}</SignedIn>
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
        {showStaffBar && (
          <nav aria-label="Event staff" className="hidden sm:block border-t border-white/[0.07] bg-black/30">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-11 py-1.5 flex flex-wrap items-center gap-1">
              <StaffRolePicker
                held={heldRoles}
                selected={staffRole}
                offerUser={offerUser}
                onSelect={chooseRole}
                className="mr-2"
              />
              {staffRole && (
                <NavLink to={MY_EVENTS_ITEM.to} end className={subBarLinkClass}>
                  {MY_EVENTS_ITEM.label}
                </NavLink>
              )}
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
            {showStaffBar && (
              <>
                <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Event staff
                </div>
                <StaffRolePicker
                  held={heldRoles}
                  selected={staffRole}
                  offerUser={offerUser}
                  onSelect={chooseRole}
                  className="px-4 pb-1"
                />
                {staffRole && (
                  <NavLink to={MY_EVENTS_ITEM.to} end onClick={() => setMenuOpen(false)} className={mobileLinkClass}>
                    {MY_EVENTS_ITEM.label}
                  </NavLink>
                )}
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

const VIEW_AS_LABELS: Record<ViewAsRole, string> = { ...EVENT_ROLE_LABELS, dancer: "User" };

const STAFF_ROLE_KEY = "deejaytools.staffBarRole";

/**
 * The choice made in the Event staff bar (a staff role, or User), kept in
 * this browser (localStorage) so it lasts across pages and visits. Storage
 * that fails leaves it in memory only. A role the caller no longer holds is
 * ignored (staffBarRole). Nothing chosen yet is the User view for staff.
 */
function useStaffBarChoice(): [StaffBarChoice | null, (choice: StaffBarChoice) => void] {
  const [role, setRole] = useState<StaffBarChoice | null>(() => {
    try {
      const raw = localStorage.getItem(STAFF_ROLE_KEY);
      if (raw === "user") return "user";
      return raw && raw in EVENT_ROLE_LABELS ? (raw as EventStaffRole) : null;
    } catch {
      return null;
    }
  });
  const choose = (next: StaffBarChoice) => {
    setRole(next);
    try {
      localStorage.setItem(STAFF_ROLE_KEY, next);
    } catch {
      // Kept in memory for this page load only.
    }
  };
  return [role, choose];
}

/**
 * At the start of the Event staff bar: User and the staff roles the caller
 * holds, as buttons, the selected one pressed; the bar shows the selected
 * role's pages, and none for User. Without the User choice (an admin
 * viewing as a role) a single role is a plain badge.
 */
function StaffRolePicker({
  held,
  selected,
  offerUser,
  onSelect,
  className,
}: {
  held: readonly EventStaffRole[];
  selected: EventStaffRole | null;
  offerUser: boolean;
  onSelect: (choice: StaffBarChoice) => void;
  className?: string;
}) {
  if (!offerUser && held.length <= 1) {
    return (
      <div className={className}>
        <Badge variant="outline" className="shrink-0 border-primary/40 text-primary">
          {selected ? EVENT_ROLE_LABELS[selected] : ""}
        </Badge>
      </div>
    );
  }
  const choices: { key: StaffBarChoice; label: string; active: boolean }[] = [
    ...(offerUser ? [{ key: "user" as const, label: VIEW_AS_LABELS.dancer, active: selected === null }] : []),
    ...held.map((role) => ({ key: role, label: EVENT_ROLE_LABELS[role], active: role === selected })),
  ];
  return (
    <div role="group" aria-label="Staff role" className={cn("flex flex-wrap items-center gap-1", className)}>
      {choices.map(({ key, label, active }) => {
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-white/10 text-muted-foreground hover:text-foreground"
            )}
            onClick={() => onSelect(key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Start, switch or end a view-as, landing on the page that role would see in place of this one. */
function useStartViewAs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (view: ViewAs | null) => {
    setViewAs(view);
    if (!view) return;
    const to = viewAsDestination(pathname, view);
    if (to !== pathname) navigate(to);
  };
}

/**
 * Admins only, always at the top of the header, on every page and on phones
 * too, in the same place whether or not a view is on: view the whole site
 * (menus, bars, pages) as one of the staff roles, held on every event, or as
 * a dancer, or go back to the admin's own view. No event is picked here: each
 * staff page picks its event, as the admin pages do. Shown in amber while a
 * view is on, so it is never mistaken for the admin's own.
 */
function ViewAsRow({ view }: { view: ViewAs | null }) {
  const start = useStartViewAs();
  const current = view?.role ?? null;
  const choices: { key: string; label: string; view: ViewAs | null }[] = [
    { key: "admin", label: "Admin", view: null },
    ...VIEW_AS_ROLES.map((role) => ({ key: role, label: VIEW_AS_LABELS[role], view: { role } })),
  ];
  return (
    <nav
      aria-label="View as"
      className={cn(
        "border-b",
        view ? "border-amber-500/30 bg-amber-500/15" : "border-white/[0.07] bg-black/10"
      )}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-10 py-1 flex flex-wrap items-center gap-1 text-sm">
        <span className={cn("mr-1 whitespace-nowrap", view ? "font-medium text-amber-200" : "text-muted-foreground")}>
          {view ? "Viewing as" : "View the site as"}
        </span>
        {choices.map((c) => {
          const active = (c.view?.role ?? null) === current;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              className={cn(
                "rounded-full px-3 py-1 whitespace-nowrap transition-colors",
                active
                  ? view
                    ? "bg-amber-400/20 text-amber-50"
                    : "bg-primary/10 text-primary"
                  : view
                    ? "text-amber-100/80 hover:text-amber-50"
                    : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                if (!active) start(c.view);
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
