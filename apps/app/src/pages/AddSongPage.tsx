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
import { DIVISIONS, type ApiManagedPartnership } from "@deejaytools/schemas";
import type { AuthMe as MeResponse } from "@/hooks/useAuthMe";

const DIVISION_OPTIONS = DIVISIONS;

const SOLO_ALLOWED_DIVISIONS = new Set<string>(["Teams", "Exhibition", "My Division Is Not Listed", "Cabaret"]);

const SOLO_PARTNER_VALUE = "__solo__";
const UPLOAD_FOR_SELF = "__self__";

const apiBase = import.meta.env.VITE_API_URL ?? "";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

type UploadStage = "idle" | "uploading" | "processing" | "finishing";
type PageMode = "upload" | "claim";

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * True when the current browser is iOS Safari or any browser on iPadOS.
 *
 * Used to relax the file input's accept= attribute, because the iOS Files
 * app picker filters by its own rules that don't match the W3C accept=
 * semantics — MP3s frequently get greyed out under "On My iPhone" and in
 * third-party app sandboxes. Server-side magic-byte validation
 * (detectAudioFormat in apps/api) is the gate that keeps junk files out.
 *
 * iPadOS 13+ identifies as Mac in userAgent, so we also check for touch.
 */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ masquerades as Mac
  if (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document) {
    return true;
  }
  return false;
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

function managedPartnershipLabel(p: ApiManagedPartnership) {
  return `${p.leader_first_name} ${p.leader_last_name} & ${p.follower_first_name} ${p.follower_last_name} (managed)`;
}

function managedPartnershipSummary(p: ApiManagedPartnership) {
  return `Leader: ${p.leader_first_name} ${p.leader_last_name} · Follower: ${p.follower_first_name} ${p.follower_last_name}`;
}

export default function AddSongPage() {
  const api = useApiClient();
  const { getToken } = useAuth();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [managedPartnerships, setManagedPartnerships] = useState<ApiManagedPartnership[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Mode toggle ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<PageMode>("upload");

  // ── Upload form ────────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [division, setDivision] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [uploadFor, setUploadFor] = useState<string>(UPLOAD_FOR_SELF);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytesSent, setUploadBytesSent] = useState(0);

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
    Promise.all([
      api.get<Partner[]>("/v1/partners"),
      api.get<MeResponse>("/v1/auth/me"),
      api.get<ApiManagedPartnership[]>("/v1/managed-partnerships"),
    ])
      .then(([p, m, mp]) => {
        if (!cancelled) {
          setPartners(p);
          setMe(m);
          setManagedPartnerships(mp);
          // Default the partner selector to the first partner the user has,
          // since most uploads are partnered. Only set it on initial load
          // when nothing is selected yet — we don't want to override a
          // deliberate "No partner" choice if partners get refetched later.
          if (p.length > 0) {
            setSelectedPartnerId((current) => (current === "" ? p[0].id : current));
          }
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
    if (
      uploadFor === UPLOAD_FOR_SELF &&
      !SOLO_ALLOWED_DIVISIONS.has(division) &&
      !selectedPartnerId
    ) {
      toast.error("A partner is required for this division.");
      return;
    }

    setIsSubmitting(true);

    try {
      setUploadStage("uploading");
      setUploadProgress(10);
      setUploadBytesSent(0);

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
          if (uploadFor === UPLOAD_FOR_SELF) {
            form.set("partner_id", selectedPartnerId || "");
          } else {
            form.set("managed_partnership_id", uploadFor);
          }
          form.set("routine_name", routineName.trim() || "");
          form.set("personal_descriptor", descriptor.trim() || "");

          let token: string | null;
          try {
            token = await getToken();
          } catch {
            token = null;
          }
          if (!token) {
            throw new Error("Your session expired. Please sign in again and retry the upload.");
          }

          let res: Response;
          try {
            res = await fetch(`${apiBase}/v1/songs/upload/chunk`, {
              method: "POST",
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: form,
            });
          } catch (fetchErr) {
            const detail = fetchErr instanceof Error
              ? `${fetchErr.name}: ${fetchErr.message}`
              : String(fetchErr);
            lastErr = new Error(`Network error (${detail}) — check your connection and try again.`);
            continue;
          }

          if (!res.ok) {
            const json = await res.json().catch(() => null) as { error?: { message?: string } } | null;
            lastErr = new Error(json?.error?.message ?? `Upload failed (${res.status})`);
            if (res.status === 401) throw lastErr;
            // STUB(db): needs songs.managed_partnership_id + managed check-in entity — remove when schema lands
            if (res.status === 501) throw lastErr;
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
      // Re-apply the partner default after reset so the next upload also
      // starts on a partner instead of dropping back to "No partner".
      setSelectedPartnerId(partners.length > 0 ? partners[0].id : "");
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
      // Reset claim panel
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

  const hasFullName = Boolean(me?.first_name?.trim() && me?.last_name?.trim());
  const selectedManaged =
    uploadFor === UPLOAD_FOR_SELF
      ? null
      : managedPartnerships.find((p) => p.id === uploadFor) ?? null;
  const isManagedUpload = uploadFor !== UPLOAD_FOR_SELF;

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
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={[
            "rounded-lg border p-4 text-left transition-colors",
            mode === "upload"
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-card hover:bg-muted/50",
          ].join(" ")}
        >
          <p className={`font-semibold text-sm ${mode === "upload" ? "text-primary" : ""}`}>
            Upload new audio
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            You have a new audio file ready to submit.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode("claim")}
          className={[
            "rounded-lg border p-4 text-left transition-colors",
            mode === "claim"
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border bg-card hover:bg-muted/50",
          ].join(" ")}
        >
          <p className={`font-semibold text-sm ${mode === "claim" ? "text-primary" : ""}`}>
            Claim from history
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            You submitted this song before — add it from past records.
          </p>
        </button>
      </div>

      {/* ── Upload panel ── */}
      {mode === "upload" && (
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
            <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="song-upload-for">Uploading for</Label>
                <Select
                  key={formKey}
                  value={uploadFor}
                  onValueChange={setUploadFor}
                >
                  <SelectTrigger id="song-upload-for">
                    <SelectValue placeholder="Myself" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UPLOAD_FOR_SELF}>Myself</SelectItem>
                    {managedPartnerships.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {managedPartnershipLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {managedPartnerships.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Add managed partnerships on{" "}
                    <Link to="/my-profile" className="underline">
                      My Profile
                    </Link>
                    .
                  </p>
                )}
              </div>

              {!isManagedUpload && (
                hasFullName ? (
                  <p className="text-sm text-muted-foreground">
                    Uploading as:{" "}
                    <span className="font-medium text-foreground">
                      {me!.first_name} {me!.last_name}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    Set your first and last name on the{" "}
                    <Link to="/my-profile" className="underline font-medium">
                      My Profile
                    </Link>{" "}
                    page so we can label your uploads correctly.
                  </p>
                )
              )}

              {isManagedUpload && selectedManaged && (
                <p className="text-sm text-muted-foreground">
                  {managedPartnershipSummary(selectedManaged)}
                </p>
              )}

              {!isManagedUpload && (
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
                      <SelectValue placeholder="No partner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SOLO_PARTNER_VALUE}>No partner</SelectItem>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {partnerLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Add partners on the{" "}
                    <Link to="/my-profile" className="underline">
                      My Profile
                    </Link>{" "}
                    page.
                  </p>
                </div>
              )}

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
                  // iOS Files app picker is stricter than accept="audio/*"
                  // implies — MP3s in "On My iPhone" and third-party app
                  // sandboxes get greyed out even though they're valid audio.
                  // We omit the accept attribute on iOS so the picker shows
                  // every file, and rely on the server's magic-byte check
                  // (detectAudioFormat) to reject anything that isn't real
                  // audio. On desktop we keep the filter for UX.
                  accept={isIOS() ? undefined : "audio/*"}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">MP3, WAV, FLAC, or M4A — max 100 MB</p>
              </div>

              {/* Sticky-on-mobile submit so users on narrow viewports (where
                  the button would otherwise sit below the fold under the
                  file input) can always see and tap it. On sm+ this falls
                  back to a normal inline button. */}
              <div className="sticky bottom-0 z-10 -mx-6 border-t bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                  {isSubmitting ? "Uploading…" : "Upload song"}
                </Button>
              </div>
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
