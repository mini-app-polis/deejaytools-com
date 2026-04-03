import { SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const css = `
  .lp-root {
    min-height: 100vh;
    background: #0a0a0a;
    color: #f0ede8;
    font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif;
  }

  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

  .lp-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2rem;
    height: 56px;
    border-bottom: 1px solid rgba(240,237,232,0.08);
    position: sticky;
    top: 0;
    background: rgba(10,10,10,0.9);
    backdrop-filter: blur(12px);
    z-index: 50;
  }

  .lp-wordmark {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: #f0ede8;
  }

  .lp-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    padding: 7px 16px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
    letter-spacing: 0.01em;
  }

  .lp-btn-ghost {
    background: transparent;
    color: rgba(240,237,232,0.6);
    border: 1px solid rgba(240,237,232,0.15);
  }

  .lp-btn-ghost:hover {
    color: #f0ede8;
    border-color: rgba(240,237,232,0.35);
    background: rgba(240,237,232,0.05);
  }

  .lp-btn-primary {
    background: #f0ede8;
    color: #0a0a0a;
  }

  .lp-btn-primary:hover {
    background: #fff;
  }

  .lp-main {
    max-width: 780px;
    margin: 0 auto;
    padding: 0 2rem 8rem;
  }

  .lp-hero {
    padding: 6rem 0 5rem;
    border-bottom: 1px solid rgba(240,237,232,0.08);
  }

  .lp-eyebrow {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(240,237,232,0.35);
    margin-bottom: 1.25rem;
  }

  .lp-h1 {
    font-size: clamp(2rem, 5vw, 3.25rem);
    font-weight: 300;
    line-height: 1.1;
    letter-spacing: -0.025em;
    margin: 0 0 1.5rem;
    color: #f0ede8;
  }

  .lp-h1 em {
    font-style: normal;
    color: rgba(240,237,232,0.4);
  }

  .lp-lead {
    font-size: 15px;
    font-weight: 300;
    line-height: 1.7;
    color: rgba(240,237,232,0.55);
    max-width: 520px;
    margin: 0;
  }

  .lp-section {
    padding: 4rem 0;
    border-bottom: 1px solid rgba(240,237,232,0.08);
  }

  .lp-section:last-child {
    border-bottom: none;
  }

  .lp-section-label {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(240,237,232,0.3);
    margin-bottom: 1.75rem;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .lp-section-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(240,237,232,0.08);
  }

  .lp-h2 {
    font-size: 1.5rem;
    font-weight: 400;
    letter-spacing: -0.015em;
    color: #f0ede8;
    margin: 0 0 0.5rem;
  }

  .lp-sub {
    font-size: 13.5px;
    font-weight: 300;
    color: rgba(240,237,232,0.45);
    line-height: 1.6;
    margin: 0 0 2rem;
  }

  /* Search */
  .lp-search-row {
    display: flex;
    gap: 10px;
    margin-bottom: 1.5rem;
  }

  .lp-input-wrap {
    flex: 1;
  }

  .lp-input {
    width: 100%;
    box-sizing: border-box;
    background: rgba(240,237,232,0.04);
    border: 1px solid rgba(240,237,232,0.1);
    border-radius: 6px;
    padding: 10px 14px;
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    font-weight: 300;
    color: #f0ede8;
    outline: none;
    transition: border-color 0.15s ease;
    height: 40px;
  }

  .lp-input::placeholder {
    color: rgba(240,237,232,0.2);
  }

  .lp-input:focus {
    border-color: rgba(240,237,232,0.3);
    background: rgba(240,237,232,0.06);
  }

  .lp-select-wrap {
    width: 200px;
    flex-shrink: 0;
  }

  /* Results table */
  .lp-table-wrap {
    border: 1px solid rgba(240,237,232,0.08);
    border-radius: 8px;
    overflow: hidden;
  }

  .lp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
  }

  .lp-table thead tr {
    border-bottom: 1px solid rgba(240,237,232,0.08);
  }

  .lp-table th {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(240,237,232,0.25);
    padding: 10px 16px;
    text-align: left;
  }

  .lp-table td {
    padding: 11px 16px;
    color: rgba(240,237,232,0.75);
    font-weight: 300;
    border-bottom: 1px solid rgba(240,237,232,0.05);
  }

  .lp-table tr:last-child td {
    border-bottom: none;
  }

  .lp-table td.lp-td-primary {
    color: #f0ede8;
    font-weight: 400;
  }

  .lp-table td.lp-td-mono {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: rgba(240,237,232,0.4);
  }

  .lp-table tbody tr:hover td {
    background: rgba(240,237,232,0.02);
  }

  .lp-empty {
    font-size: 13.5px;
    font-weight: 300;
    color: rgba(240,237,232,0.3);
    padding: 2rem 0;
  }

  .lp-shimmer {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .lp-shimmer-row {
    height: 40px;
    background: linear-gradient(90deg, rgba(240,237,232,0.03) 25%, rgba(240,237,232,0.07) 50%, rgba(240,237,232,0.03) 75%);
    background-size: 200% 100%;
    border-radius: 4px;
    animation: shimmer 1.4s infinite;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* Steps */
  .lp-steps {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .lp-step {
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: 0 1.5rem;
    padding: 1.75rem 0;
    border-bottom: 1px solid rgba(240,237,232,0.06);
  }

  .lp-step:last-child {
    border-bottom: none;
  }

  .lp-step-num {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    color: rgba(240,237,232,0.2);
    padding-top: 3px;
    letter-spacing: 0.06em;
  }

  .lp-step-title {
    font-size: 14px;
    font-weight: 500;
    color: #f0ede8;
    margin: 0 0 0.4rem;
    letter-spacing: -0.01em;
  }

  .lp-step-body {
    font-size: 13.5px;
    font-weight: 300;
    color: rgba(240,237,232,0.45);
    line-height: 1.7;
    margin: 0;
  }

  /* Operator CTA */
  .lp-cta-box {
    background: rgba(240,237,232,0.03);
    border: 1px solid rgba(240,237,232,0.08);
    border-radius: 10px;
    padding: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .lp-cta-text h2 {
    font-size: 1rem;
    font-weight: 500;
    color: #f0ede8;
    margin: 0 0 0.4rem;
    letter-spacing: -0.01em;
  }

  .lp-cta-text p {
    font-size: 13.5px;
    font-weight: 300;
    color: rgba(240,237,232,0.4);
    margin: 0;
    line-height: 1.6;
  }

  @media (max-width: 600px) {
    .lp-search-row { flex-direction: column; }
    .lp-select-wrap { width: 100%; }
    .lp-hero { padding: 3.5rem 0 3rem; }
    .lp-cta-box { flex-direction: column; align-items: flex-start; }
  }
`;

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
    <>
      <style>{css}</style>
      <div className="lp-root">

        {/* Nav */}
        <nav className="lp-nav">
          <span className="lp-wordmark">DeejayTools.com</span>
          <SignedOut>
            <SignInButton>
              <button className="lp-btn lp-btn-ghost">Sign in</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <button className="lp-btn lp-btn-primary" onClick={() => navigate("/events")}>
              Go to app
            </button>
          </SignedIn>
        </nav>

        <main className="lp-main">

          {/* Hero */}
          <section className="lp-hero">
            <p className="lp-eyebrow">West Coast Swing · Floor Trials</p>
            <h1 className="lp-h1">
              Music management<br />
              <em>for competitors &amp; DJs</em>
            </h1>
            <p className="lp-lead">
              Look up your submitted music, learn how floor trials work,
              and check in when it's time to run.
            </p>
          </section>

          {/* Music lookup */}
          <section className="lp-section">
            <p className="lp-section-label">Music lookup</p>
            <h2 className="lp-h2">Is your music on file?</h2>
            <p className="lp-sub">
              Search previously submitted routines. If your partnership appears below,
              the DJ already has your music — no resubmission needed.
            </p>

            <div className="lp-search-row">
              <div className="lp-input-wrap">
                <input
                  className="lp-input"
                  placeholder="Search by partnership or name…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="lp-select-wrap">
                <Select value={division} onValueChange={setDivision}>
                  <SelectTrigger
                    style={{
                      background: "rgba(240,237,232,0.04)",
                      border: "1px solid rgba(240,237,232,0.10)",
                      borderRadius: "6px",
                      color: division === ALL_DIVISIONS ? "rgba(240,237,232,0.25)" : "#f0ede8",
                      fontSize: "14px",
                      fontWeight: 300,
                      height: "40px",
                    }}
                  >
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
              <div className="lp-shimmer">
                <div className="lp-shimmer-row" />
                <div className="lp-shimmer-row" style={{ width: "85%" }} />
                <div className="lp-shimmer-row" style={{ width: "70%" }} />
              </div>
            )}

            {!loading && searched && results.length === 0 && (
              <p className="lp-empty">
                No results found. If you haven't submitted your music yet,
                reach out to the event DJ.
              </p>
            )}

            {!loading && results.length > 0 && (
              <div className="lp-table-wrap">
                <table className="lp-table">
                  <thead>
                    <tr>
                      <th>Partnership</th>
                      <th>Division</th>
                      <th>Routine</th>
                      <th>Ver.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((s) => (
                      <tr key={s.id}>
                        <td className="lp-td-primary">{s.partnership}</td>
                        <td>{s.division ?? "—"}</td>
                        <td>{s.routine_name ?? "—"}</td>
                        <td className="lp-td-mono">{s.version ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* How it works */}
          <section className="lp-section">
            <p className="lp-section-label">How it works</p>
            <h2 className="lp-h2">Floor trial process</h2>
            <p className="lp-sub">
              What to expect from music submission through your run.
            </p>

            <div className="lp-steps">
              <div className="lp-step">
                <span className="lp-step-num">01</span>
                <div>
                  <p className="lp-step-title">Submit your music</p>
                  <p className="lp-step-body">
                    Your file should contain only your routine — no bow music. The DJ starts
                    playback from the top of the file. Use the lookup above to confirm your
                    submission was received. If you need a specific cue point, note it during check-in.
                  </p>
                </div>
              </div>
              <div className="lp-step">
                <span className="lp-step-num">02</span>
                <div>
                  <p className="lp-step-title">Check in</p>
                  <p className="lp-step-body">
                    Check-in opens 30 minutes before the floor trial block. Submit the form
                    once per run — submissions outside the window are automatically rejected.
                    Include any special instructions in the form.
                  </p>
                </div>
              </div>
              <div className="lp-step">
                <span className="lp-step-num">03</span>
                <div>
                  <p className="lp-step-title">Watch the queue</p>
                  <p className="lp-step-body">
                    Same-day routines get priority for runs 1–3. The 4th run and beyond move
                    to the standard queue. Check the live status display for your position
                    and watch for any flags from the DJ.
                  </p>
                </div>
              </div>
              <div className="lp-step">
                <span className="lp-step-num">04</span>
                <div>
                  <p className="lp-step-title">Run your routine</p>
                  <p className="lp-step-body">
                    Couples get roughly 5 minutes; teams get about 10. If something goes wrong
                    before the halfway point, you may request an immediate restart. Past halfway,
                    you'll be moved to the end of the queue. To run again, submit a new check-in.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Operator CTA */}
          <section className="lp-section">
            <div className="lp-cta-box">
              <div className="lp-cta-text">
                <h2>For DJs &amp; event operators</h2>
                <p>
                  Manage events, sessions, music submissions,
                  and live check-in queues.
                </p>
              </div>
              <SignedOut>
                <SignInButton>
                  <button className="lp-btn lp-btn-primary">Sign in</button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <button className="lp-btn lp-btn-primary" onClick={() => navigate("/events")}>
                  Go to app
                </button>
              </SignedIn>
            </div>
          </section>

        </main>
      </div>
    </>
  );
}