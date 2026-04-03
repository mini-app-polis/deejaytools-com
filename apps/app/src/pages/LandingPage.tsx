import { SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default function LandingPage() {
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [division, setDivision] = useState(ALL_DIVISIONS);
  const [results, setResults] = useState<LegacySong[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Debounced search
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
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b px-6 h-14 flex items-center justify-between">
        <span className="font-semibold text-sm">DeejayTools.com</span>
        <SignedOut>
          <SignInButton>
            <Button variant="outline" size="sm">Sign in</Button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <Button size="sm" onClick={() => navigate("/events")}>Go to app</Button>
        </SignedIn>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-16">

        {/* Hero */}
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">Floor trial tools for West Coast Swing</h1>
          <p className="text-muted-foreground leading-relaxed">
            DeejayTools helps DJs and event operators run smooth floor trial sessions —
            music management, check-in queues, and live slot tracking in one place.
          </p>
        </section>

        {/* Legacy music lookup */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Music lookup</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Search previously submitted routines. If your music is listed here, the DJ
              already has it on file — no upload needed.
            </p>
          </div>

          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="lookup-q">Partnership or routine name</Label>
                  <Input
                    id="lookup-q"
                    placeholder="e.g. Smith & Jones"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>
                <div className="sm:w-52 space-y-1.5">
                  <Label htmlFor="lookup-division">Division</Label>
                  <Select value={division} onValueChange={setDivision}>
                    <SelectTrigger id="lookup-division">
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

              {loading && (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                </div>
              )}

              {!loading && searched && (
                results.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    No results found. If you haven't submitted your music yet, you'll
                    need to do so before your floor trial.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partnership</TableHead>
                        <TableHead>Division</TableHead>
                        <TableHead>Routine</TableHead>
                        <TableHead>Version</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.partnership}</TableCell>
                          <TableCell>{s.division ?? "—"}</TableCell>
                          <TableCell>{s.routine_name ?? "—"}</TableCell>
                          <TableCell>{s.version ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              )}
            </CardContent>
          </Card>
        </section>

        {/* How floor trials work */}
        <section className="space-y-6">
          <h2 className="text-lg font-medium">How floor trials work</h2>

          <div className="space-y-5">
            <div className="space-y-1.5">
              <h3 className="text-sm font-medium">Before your session</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Make sure your music has been submitted and confirmed by the DJ. Use the
                lookup above to verify. Your music file should contain only your routine —
                no bow music. The DJ will start playback from the beginning of the file
                unless you note otherwise during check-in.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-medium">Check-in</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Check-in opens 30 minutes before the floor trial block starts. Submit the
                check-in form once per run — early submissions outside the window are
                automatically rejected. If you need a custom music cue or have special
                instructions, include them in your check-in submission.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-medium">Queue and priority</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Check-in order determines your place in the queue, but same-day routines
                get priority. Runs 1–3 of a same-day division are priority; the 4th run
                and beyond move to the standard queue. The queue display shows your
                current status — watch for any flags from the DJ.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-medium">During your run</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each couple gets roughly 5 minutes; teams get around 10. If something
                goes wrong before the halfway point, you may request an immediate restart.
                Past halfway, you'll be moved to the end of the queue. Once you complete
                a run, re-entry requires a new check-in submission.
              </p>
            </div>
          </div>
        </section>

        {/* Operator sign-in */}
        <section className="border-t pt-10 space-y-3">
          <h2 className="text-lg font-medium">For DJs and event operators</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sign in to manage events, floor trial sessions, music submissions, and
            live check-in queues.
          </p>
          <SignedOut>
            <SignInButton>
              <Button>Sign in to DeejayTools</Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Button onClick={() => navigate("/events")}>Go to the app</Button>
          </SignedIn>
        </section>

      </main>
    </div>
  );
}
