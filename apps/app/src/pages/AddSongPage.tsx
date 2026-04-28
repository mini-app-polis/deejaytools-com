import { useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
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
import type { AuthMe as MeResponse } from "@/hooks/useAuthMe";

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
  "My Division Is Not Listed",
] as const;

const SOLO_ALLOWED_DIVISIONS = new Set<string>(["Teams", "My Division Is Not Listed"]);

const SOLO_PARTNER_VALUE = "__solo__";

const apiBase = import.meta.env.VITE_API_URL ?? "";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

type UploadStage = "idle" | "uploading" | "processing" | "finishing";

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

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

export default function AddSongPage() {
  const api = useApiClient();
  const { getToken } = useAuth();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [division, setDivision] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytesSent, setUploadBytesSent] = useState(0);

  // ── Claim from history ────────────────────────────────────────────────────
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimPartnerId, setClaimPartnerId] = useState("");
  const [claimQuery, setClaimQuery] = useState("");
  const [claimResults, setClaimResults] = useState<LegacySong[]>([]);
  const [claimSearching, setClaimSearching] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<Partner[]>("/v1/partners"),
      api.get<MeResponse>("/v1/auth/me"),
    ])
      .then(([p, m]) => {
        if (!cancelled) {
          setPartners(p);
          setMe(m);
        }
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select an audio file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is too large. Please choose an audio file under 100 MB.");
      return;
    }
    if (!division) {
      toast.error("Please select a division.");
      return;
    }
    if (!SOLO_ALLOWED_DIVISIONS.has(division) && !selectedPartnerId) {
      toast.error("A partner is required for this division.");
      return;
    }

    setIsSubmitting(true);

    try {
      setUploadStage("uploading");
      setUploadProgress(10);
      setUploadBytesSent(0);

      const token = await getToken();
      const uploadId = crypto.randomUUID();
      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      const MAX_RETRIES = 3;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const isLast = i === totalChunks - 1;

        if (isLast) {
          setUploadStage("processing");
          setUploadProgress(i > 0 ? 90 : 50);
        }

        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }

          const form = new FormData();
          form.set("chunk", chunk, file.name);
          form.set("upload_id", uploadId);
          form.set("chunk_index", String(i));
          form.set("total_chunks", String(totalChunks));
          form.set("original_filename", file.name);
          form.set("mime_type", file.type || "audio/mpeg");
          form.set("division", division);
          form.set("partner_id", selectedPartnerId || "");
          form.set("routine_name", routineName.trim() || "");
          form.set("personal_descriptor", descriptor.trim() || "");

          let res: Response;
          try {
            res = await fetch(`${apiBase}/v1/songs/upload/chunk`, {
              method: "POST",
              headers: {
                Accept: "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: form,
            });
          } catch {
            lastErr = new Error("Network error — check your connection and try again.");
            continue;
          }

          if (!res.ok) {
            const json = await res.json().catch(() => null) as { error?: { message?: string } } | null;
            lastErr = new Error(json?.error?.message ?? `Upload failed (${res.status})`);
            continue;
          }

          lastErr = null;
          if (!isLast) {
            setUploadBytesSent(end);
            setUploadProgress(10 + Math.round((end / file.size) * 75));
          }
          break;
        }

        if (lastErr) throw lastErr;
      }

      setUploadStage("finishing");
      setUploadProgress(95);
      setUploadProgress(100);
      await new Promise((r) => setTimeout(r, 400));

      toast.success("Song uploaded successfully.");
      setFile(null);
      setDivision("");
      setRoutineName("");
      setDescriptor("");
      setSelectedPartnerId("");
      setUploadBytesSent(0);
      setFileInputKey((k) => k + 1);
      setFormKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadStage("idle");
      setUploadProgress(0);
      setUploadBytesSent(0);
      setIsSubmitting(false);
    }
  };

  // Debounced legacy-songs search whenever the dialog is open and the query changes.
  useEffect(() => {
    if (!claimDialogOpen) return;
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
  }, [claimDialogOpen, claimQuery, api]);

  const openClaimDialog = () => {
    setClaimPartnerId("");
    setClaimQuery("");
    setClaimResults([]);
    setClaimDialogOpen(true);
  };

  const handleClaim = async (legacyId: string) => {
    setClaimingId(legacyId);
    try {
      await api.post<Song>("/v1/songs/claim-legacy", {
        legacy_song_id: legacyId,
        partner_id: claimPartnerId || undefined,
      });
      toast.success("Song added from history");
      setClaimDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaimingId(null);
    }
  };

  const hasFullName = Boolean(me?.first_name?.trim() && me?.last_name?.trim());

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
          <Link to="/songs">← Back to My Songs</Link>
        </Button>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="page-title text-2xl">Add Song</h1>
          <Button variant="outline" onClick={openClaimDialog}>
            Claim from history
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a song</CardTitle>
          <CardDescription>
            Create your song record and upload one audio file in a single step.
            The file should contain only your routine — no bow music or
            intro buffer; the DJ starts playback at 0:00.{" "}
            <Link to="/how-it-works#submitting-music" className="text-primary hover:underline">
              File requirements →
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasFullName ? (
            <p className="text-sm text-muted-foreground">
              Uploading as:{" "}
              <span className="font-medium text-foreground">
                {me!.first_name} {me!.last_name}
              </span>
            </p>
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              Set your first and last name on the{" "}
              <Link to="/partners" className="underline font-medium">
                My Partners
              </Link>{" "}
              page so we can label your uploads correctly.
            </p>
          )}

          <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="song-partner">Partner</Label>
              <Select
                key={formKey}
                value={selectedPartnerId === "" ? SOLO_PARTNER_VALUE : selectedPartnerId}
                onValueChange={(v) =>
                  setSelectedPartnerId(v === SOLO_PARTNER_VALUE ? "" : v)
                }
              >
                <SelectTrigger id="song-partner">
                  <SelectValue placeholder="Solo / No partner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SOLO_PARTNER_VALUE}>Solo / No partner</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {partnerLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Add partners on the{" "}
                <Link to="/partners" className="underline">
                  My Partners
                </Link>{" "}
                page.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="song-division">Division</Label>
              <Select key={formKey} value={division || undefined} onValueChange={setDivision}>
                <SelectTrigger id="song-division">
                  <SelectValue placeholder="Select a division" />
                </SelectTrigger>
                <SelectContent>
                  {DIVISION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="song-routine">Routine / Song name</Label>
              <Input
                id="song-routine"
                value={routineName}
                onChange={(e) => setRoutineName(e.target.value)}
                placeholder="Optional — recommended"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="song-descriptor">Personal descriptor</Label>
              <Input
                id="song-descriptor"
                value={descriptor}
                onChange={(e) => setDescriptor(e.target.value)}
                placeholder="e.g. 98%, -2%, v3, 2026-02-01"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="song-file">Audio file</Label>
              <Input
                key={fileInputKey}
                id="song-file"
                type="file"
                accept="audio/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">MP3, WAV, FLAC, or M4A — max 100 MB</p>
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? "Uploading…" : "Upload song"}
            </Button>
            {uploadStage !== "idle" && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {uploadStage === "uploading" && file
                      ? `Uploading… ${formatMB(uploadBytesSent)} of ${formatMB(file.size)} MB`
                      : uploadStage === "processing"
                        ? "Processing your file… this may take a moment"
                        : "Saving…"}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ── Claim from history dialog ── */}
      {claimDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setClaimDialogOpen(false)}
        >
          <div
            className="rounded-t-2xl sm:rounded-lg border bg-background p-6 shadow-lg w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center -mt-2 mb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Claim from history</h2>
                <p className="text-xs text-muted-foreground">
                  Pick a partner, then a song you submitted in the past. It'll be added to
                  your songs so you can check in with it.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setClaimDialogOpen(false)}
              >
                ✕
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="claim-partner">Partner</Label>
              <Select
                value={claimPartnerId === "" ? SOLO_PARTNER_VALUE : claimPartnerId}
                onValueChange={(v) =>
                  setClaimPartnerId(v === SOLO_PARTNER_VALUE ? "" : v)
                }
              >
                <SelectTrigger id="claim-partner">
                  <SelectValue placeholder="Solo / No partner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SOLO_PARTNER_VALUE}>Solo / No partner</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {partnerLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Add partners on the{" "}
                <Link to="/partners" className="underline">
                  My Partners
                </Link>{" "}
                page if your partner isn't listed.
              </p>
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
                <p className="text-sm text-muted-foreground">
                  {claimQuery.trim()
                    ? "No matches. Try a different search."
                    : "Type a partnership or routine name to search."}
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {claimResults.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-lg border px-3 py-2 text-sm flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium">{row.partnership}</p>
                        <p className="text-xs text-muted-foreground">
                          {[row.division, row.routine_name, row.descriptor]
                            .filter(Boolean)
                            .join(" · ") || "No details"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleClaim(row.id)}
                        disabled={claimingId !== null}
                      >
                        {claimingId === row.id ? "Claiming…" : "Claim"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
