import { UserButton } from "@clerk/clerk-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuthMe } from "@/hooks/useAuthMe";
import pkg from "../../../../package.json";

const NAV_ITEMS = [
  { to: "/events", label: "Events" },
  { to: "/sessions", label: "Sessions" },
  { to: "/partners", label: "Partners" },
  { to: "/songs", label: "Songs" },
];

export default function Layout() {
  const { isAdmin } = useAuthMe();
  const [menuOpen, setMenuOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "text-sm font-normal transition-colors",
      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
    );

  const items = isAdmin ? [...NAV_ITEMS, { to: "/admin", label: "Admin" }] : NAV_ITEMS;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Wordmark */}
          <div className="flex flex-col leading-tight shrink-0">
            <span className="font-medium text-sm tracking-wide" style={{ fontFamily: "'DM Mono', monospace" }}>
              DeejayTools.com
            </span>
            <span className="text-xs text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>
              v{pkg.version}
            </span>
          </div>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-5 flex-1 ml-6">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </div>

          {/* Right: user + hamburger */}
          <div className="flex items-center gap-3">
            <UserButton />
            {/* Hamburger — mobile only */}
            <button
              className="sm:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              <span
                className={cn(
                  "block w-5 h-px bg-foreground transition-all duration-200",
                  menuOpen && "rotate-45 translate-y-[8px]"
                )}
              />
              <span
                className={cn(
                  "block w-5 h-px bg-foreground transition-all duration-200",
                  menuOpen && "opacity-0"
                )}
              />
              <span
                className={cn(
                  "block w-5 h-px bg-foreground transition-all duration-200",
                  menuOpen && "-rotate-45 -translate-y-[8px]"
                )}
              />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="sm:hidden border-t border-border bg-background">
            <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-1">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "px-3 py-2.5 rounded-md text-sm transition-colors",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
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
