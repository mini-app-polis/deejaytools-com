import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Music History — public read-only search over the legacy-songs catalog.
 *
 * Lives at /music-history and is rendered inside the shared Layout (so the
 * NavBar comes from there, not from this page). The previous home for this
 * UI was the LandingPage hero, but the homepage was redesigned to a card
 * grid that links here instead — keeping the landing page focused on
 * orientation and pushing the form into a dedicated page.
 *
 * Wire-up: GET /v1/legacy-songs?q=&division= with a 350ms debounce on user
 * input. The endpoint is intentionally public (no Clerk JWT required) — see
 * apps/api/src/routes/legacy-songs.ts.
 */

const DIVISION_OPTIONS = [
  "Classic",
  "Showcase",
  "Rising Star Classic",
  "Rising Star Showcase",
  "Sophisticated",
  "Masters",
  "Teams",
  "ProAm LeaderAm",
  "ProAm FollowerAm",
  "NovInt Routines",
  "Juniors",
  "Young Adult",
  "Exhibition",
  "Superstar",
];

type LegacySong = {
  id: string;
  partnership: string;
  division: string | null;
  routine_name: string | null;
  descriptor: string | null;
  version: string | null;
  submitted_at: string | null;
};

type ApiList<T> = { data: T[] };

const apiBase = import.meta.env.VITE_API_URL ?? "";
const ALL_DIVISIONS = "__all__";

export default function MusicHistoryPage() {
  const [q, setQ] = useState("");
  const [division, setDivision] = useState(ALL_DIVISIONS);
  const [results, setResults] = useState<LegacySong[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!q.trim() && division === ALL_DIVISIONS) {
      setResults([]);
      setSearched(false);
      return;
    }
    const timer = setTimeout(() => {
      void doSearch(q.trim(), division === ALL_DIVISIONS ? "" : division);
    }, 350);
    return () => clearTimeout(timer);
  }, [q, division]);

  async function doSearch(query: string, div: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (div) params.set("division", div);
      const res = await fetch(`${apiBase}/v1/legacy-songs?${params.toString()}`);
      const json = (await res.json()) as ApiList<LegacySong>;
      setResults(json.data);
      setSearched(true);
    } catch {
      // Surface no results on error — the homepage card explains this is a
      // best-effort historical lookup, so a quiet empty state is fine.
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <p
          className="text-[10px] font-medium tracking-[0.18em] uppercase text-primary/60 mb-2"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          Music history
        </p>
        <h1 className="text-2xl sm:text-3xl font-light tracking-tight mb-1">
          Is your music on file?
        </h1>
        <p className="text-sm text-muted-foreground font-light">
          If you appear below, the DJ already has your music — no resubmission needed.
        </p>
      </div>

      {/* Search inputs */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <Input
          className="flex-1 bg-card border-white/[0.07] text-sm font-light placeholder:text-muted-foreground"
          placeholder="Search by partnership or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="sm:w-48">
          <Select value={division} onValueChange={setDivision}>
            <SelectTrigger className="bg-card border-white/[0.07] text-sm font-light w-full">
              <SelectValue placeholder="All divisions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DIVISIONS}>All divisions</SelectItem>
              {DIVISION_OPTIONS.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-5/6" />
          <Skeleton className="h-10 w-4/6" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 font-light">
          No results found. If you haven't submitted your music yet, reach out to the event DJ.
        </p>
      )}

      {!loading && results.length > 0 && (
        <div className="rounded-lg border border-white/[0.07] overflow-hidden">
          {/* Mobile: card-style rows */}
          <div className="sm:hidden divide-y divide-border">
            {results.map((s) => (
              <div key={s.id} className="px-4 py-3 space-y-0.5">
                <p className="text-sm font-medium text-foreground">{s.partnership}</p>
                <p className="text-xs text-muted-foreground font-light">
                  {[s.division, s.routine_name].filter(Boolean).join(" · ") || "—"}
                  {s.version && (
                    <span
                      className="ml-2 text-muted-foreground/50"
                      style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px" }}
                    >
                      v{s.version}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
          {/* Desktop: table */}
          <table className="hidden sm:table w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {["Partnership", "Division", "Routine", "Ver."].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left font-medium text-muted-foreground/60 text-xs tracking-widest uppercase"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((s) => (
                <tr key={s.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{s.partnership}</td>
                  <td className="px-4 py-3 text-muted-foreground font-light">{s.division ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground font-light">{s.routine_name ?? "—"}</td>
                  <td
                    className="px-4 py-3 text-muted-foreground/50 text-xs"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {s.version ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
