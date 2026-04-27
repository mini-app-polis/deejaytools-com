import { SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "@/components/NavBar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

const STEPS = [
  {
    num: "01",
    title: "Submit your music",
    body: "File should contain only your routine — no bow music. DJ starts from the top unless you note a cue during check-in.",
  },
  {
    num: "02",
    title: "Check in",
    body: "Opens 30 min before the session. Submit once per run. Include any special instructions in the form.",
  },
  {
    num: "03",
    title: "Watch the queue",
    body: "Same-day runs 1–3 get priority. Run 4+ moves to standard queue. Watch the live display for your name.",
  },
  {
    num: "04",
    title: "Run your routine",
    body: "~5 min per couple, ~10 for teams. Restart available if you're under halfway through. Re-queue with a new check-in.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

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
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">

      <NavBar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">

        {/* Hero */}
        <section className="py-14 sm:py-20 border-b border-white/[0.07]">
          <p
            className="text-[10px] font-medium tracking-[0.18em] uppercase text-primary mb-5"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            West Coast Swing · Floor Trials
          </p>
          <h1
            className="text-4xl sm:text-6xl font-black italic leading-[0.95] tracking-tight mb-6"
            style={{ fontFamily: "'Fraunces', ui-serif, serif", fontVariationSettings: "'opsz' 72" }}
          >
            Music management<br />
            <span className="text-muted-foreground">for competitors</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md font-light">
            Look up your submitted music, learn how floor trials work,
            and check in when it's time to run.
          </p>
        </section>

        {/* Music lookup */}
        <section className="py-10 sm:py-14 border-b border-white/[0.07]">
          <SectionLabel>Music lookup</SectionLabel>
          <h2 className="text-xl sm:text-2xl font-light tracking-tight mb-1">
            Is your music on file?
          </h2>
          <p className="text-sm text-muted-foreground mb-6 font-light">
            If you appear below, the DJ already has your music — no resubmission needed.
          </p>

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
        </section>

        {/* How it works */}
        <section className="py-10 sm:py-14 border-b border-white/[0.07]">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="text-xl sm:text-2xl font-light tracking-tight mb-1">
            Floor trial process
          </h2>
          <p className="text-sm text-muted-foreground mb-8 font-light">
            The short version — everything you need to know to run.
          </p>

          <div className="divide-y divide-border">
            {STEPS.map((step) => (
              <div key={step.num} className="py-5 grid grid-cols-[40px_1fr] gap-4 items-start">
                <span
                  className="text-xs font-medium text-primary/50 pt-0.5 tabular-nums"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  {step.num}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">{step.title}</p>
                  <p className="text-sm text-muted-foreground font-light leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Operator CTA */}
        <section className="py-10 sm:py-14">
          <div className="rounded-xl border border-white/[0.07] bg-card px-6 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-base font-medium text-foreground mb-1">
                For DJs &amp; event operators
              </h2>
              <p className="text-sm text-muted-foreground font-light">
                Manage events, sessions, music, and live check-in queues.
              </p>
            </div>
            <div className="shrink-0">
              <SignedOut>
                <SignInButton forceRedirectUrl="/partners" signUpForceRedirectUrl="/partners">
                  <Button>Sign in to DeejayTools</Button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <Button onClick={() => navigate("/partners")}>Go to app</Button>
              </SignedIn>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className="text-[10px] font-medium tracking-[0.18em] uppercase text-primary/60 shrink-0"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {children}
      </span>
      <div className="flex-1 h-px bg-white/[0.07]" />
    </div>
  );
}
