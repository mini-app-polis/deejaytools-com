import { UserButton } from "@clerk/clerk-react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuthMe } from "@/hooks/useAuthMe";
import pkg from "../../../../package.json";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "text-sm font-medium transition-colors hover:text-foreground/80",
    isActive ? "text-foreground" : "text-muted-foreground"
  );

export default function Layout() {
  const { isAdmin } = useAuthMe();

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            <span className="font-semibold text-sm">DeejayTools.com</span>
            <span className="text-xs text-muted-foreground">v{pkg.version}</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <NavLink to="/events" className={navClass}>
              Events
            </NavLink>
            <NavLink to="/sessions" className={navClass}>
              Sessions
            </NavLink>
            <NavLink to="/partners" className={navClass}>
              Partners
            </NavLink>
            <NavLink to="/songs" className={navClass}>
              Songs
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={navClass}>
                Admin
              </NavLink>
            )}
          </div>
        </div>
        <UserButton />
      </nav>
      <main className="p-4 md:p-6 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
