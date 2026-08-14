import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import SongUploadForm from "@/components/SongUploadForm";
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

type PageMode = "upload_self" | "upload_managed" | "claim";

type Partner = {
  id: string;
  first_name: string;
  last_name: string;
  partner_role: "leader" | "follower";
};

type LegacySong = {
  id: string;
  partnership: string;
  division: string | null;
  routine_name: string | null;
  descriptor: string | null;
  version: string | null;
  submitted_at: string | null;
};

type Song = {
  id: string;
  partner_id: string | null;
  processed_filename: string | null;
  division: string | null;
  routine_name: string | null;
  personal_descriptor: string | null;
  created_at: number;
};

function partnerLabel(p: Partner) {
  return `${p.first_name} ${p.last_name}`.trim();
}

type ModeCardProps = {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
};

function ModeCard({ active, title, description, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border p-4 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card hover:bg-muted/50",
      ].join(" ")}
    >
      <p className={`font-semibold text-sm ${active ? "text-primary" : ""}`}>{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </button>
  );
}

export default function AddSongPage() {
  const api = useApiClient();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Mode toggle ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<PageMode>("upload_self");

  // ── Claim from history ────────────────────────────────────────────────────
  const [claimPartnerId, setClaimPartnerId] = useState("");
  const [claimPartnerError, setClaimPartnerError] = useState(false);
  const [claimQuery, setClaimQuery] = useState("");
  const [claimResults, setClaimResults] = useState<LegacySong[]>([]);
  const [claimSearching, setClaimSearching] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<Partner[]>("/v1/partners")
      .then((p) => {
        if (!cancelled) setPartners(p);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Debounced legacy-songs search whenever the claim panel is active.
  useEffect(() => {
    if (mode !== "claim") return;
    const t = setTimeout(async () => {
      setClaimSearching(true);
      try {
        const params = new URLSearchParams();
        if (claimQuery.trim()) params.set("q", claimQuery.trim());
        const path = `/v1/legacy-songs${params.toString() ? `?${params.toString()}` : ""}`;
        const data = await api.get<LegacySong[]>(path);
        setClaimResults(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Search failed");
      } finally {
        setClaimSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [mode, claimQuery, api]);

  const requestClaim = (legacyId: string) => {
    if (!claimPartnerId) {
      setClaimPartnerError(true);
      return;
    }
    setPendingClaimId(legacyId);
  };

  const handleClaim = async (legacyId: string) => {
    setClaimingId(legacyId);
    try {
      await api.post<Song>("/v1/songs/claim-legacy", {
        legacy_song_id: legacyId,
        partner_id: claimPartnerId,
      });
      toast.success("Song added from history");
      setClaimQuery("");
      setClaimResults([]);
      setClaimPartnerId("");
      setPendingClaimId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Claim failed");
      setPendingClaimId(null);
    } finally {
      setClaimingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="px-0 mb-2" asChild>
          <Link to="/my-content?tab=songs">← Back to My Content</Link>
        </Button>
        <h1 className="page-title text-2xl">Add Song</h1>
      </div>

      {/* ── Mode toggle ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ModeCard
          active={mode === "upload_self"}
          title="Upload for myself"
          description="You're one of the dancers."
          onClick={() => setMode("upload_self")}
        />
        <ModeCard
          active={mode === "upload_managed"}
          title="Upload for a managed partnership"
          description="Upload on behalf of a partnership you manage."
          onClick={() => setMode("upload_managed")}
        />
        <ModeCard
          active={mode === "claim"}
          title="Claim from history"
          description="You submitted this song before — add it from past records."
          onClick={() => setMode("claim")}
        />
      </div>

      {/* ── Upload for myself ── */}
      {mode === "upload_self" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload a song</CardTitle>
            <CardDescription>
              Select your audio file, fill in the details below, and hit Upload.
              The file should contain only your routine — no bow music or intro
              buffer; the DJ starts playback at 0:00.{" "}
              <Link to="/how-it-works#submitting-music" className="text-primary hover:underline">
                File requirements →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SongUploadForm variant="self" />
          </CardContent>
        </Card>
      )}

      {/* ── Upload for a managed partnership ── */}
      {mode === "upload_managed" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload for a managed partnership</CardTitle>
            <CardDescription>
              Upload a song on behalf of a partnership you manage. The file should
              contain only the routine — no bow music or intro buffer; the DJ starts
              playback at 0:00.{" "}
              <Link to="/how-it-works#submitting-music" className="text-primary hover:underline">
                File requirements →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SongUploadForm variant="managed" />
          </CardContent>
        </Card>
      )}

      {/* ── Claim from history panel ── */}
      {mode === "claim" && (
        <Card>
          <CardHeader>
            <CardTitle>Claim from history</CardTitle>
            <CardDescription>
              Search for a song you've submitted before and add it to your library.
              No audio file needed — we'll pull the details from the original submission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="claim-partner">
                Partner <span className="text-destructive">*</span>
              </Label>
              <Select
                value={claimPartnerId}
                onValueChange={(v) => {
                  setClaimPartnerId(v);
                  setClaimPartnerError(false);
                }}
              >
                <SelectTrigger
                  id="claim-partner"
                  className={claimPartnerError ? "border-destructive ring-destructive" : ""}
                >
                  <SelectValue placeholder="Select a partner" />
                </SelectTrigger>
                <SelectContent>
                  {partners.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No partners yet.
                    </div>
                  ) : (
                    partners.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {partnerLabel(p)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {claimPartnerError ? (
                <p className="text-xs text-destructive">A partner is required to claim a song.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  <Link to="/my-profile" className="underline">
                    Add a partner
                  </Link>{" "}
                  if they're not listed.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="claim-search">Search past songs</Label>
              <Input
                id="claim-search"
                value={claimQuery}
                onChange={(e) => setClaimQuery(e.target.value)}
                placeholder="Search by partnership or routine name…"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              {claimSearching ? (
                <Skeleton className="h-32 w-full" />
              ) : claimResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  {claimQuery.trim()
                    ? "No matches. Try a different search."
                    : "Type a partnership or routine name to search."}
                </p>
              ) : (
                <div className="space-y-2">
                  {claimResults.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-medium">{row.partnership}</p>
                          <p className="text-xs text-muted-foreground">
                            {[row.division, row.routine_name, row.descriptor]
                              .filter(Boolean)
                              .join(" · ") || "No details"}
                          </p>
                        </div>
                        {pendingClaimId !== row.id && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => requestClaim(row.id)}
                            disabled={claimingId !== null}
                          >
                            Claim
                          </Button>
                        )}
                      </div>
                      {pendingClaimId === row.id && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                          <span className="text-xs text-muted-foreground flex-1">
                            Add this song to your library?
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleClaim(row.id)}
                            disabled={claimingId === row.id}
                          >
                            {claimingId === row.id ? "Claiming…" : "Confirm"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setPendingClaimId(null)}
                            disabled={claimingId === row.id}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
