import { useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DIVISIONS, type ApiManagedPartnership } from "@deejaytools/schemas";
import type { AuthMe as MeResponse } from "@/hooks/useAuthMe";

const DIVISION_OPTIONS = DIVISIONS;
const SOLO_ALLOWED_DIVISIONS = new Set<string>(["Teams", "Exhibition", "My Division Is Not Listed", "Cabaret"]);
const SOLO_PARTNER_VALUE = "__solo__";
const apiBase = import.meta.env.VITE_API_URL ?? "";
const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

type UploadStage = "idle" | "uploading" | "processing" | "finishing";
type Partner = { id: string; first_name: string; last_name: string; partner_role: "leader" | "follower" };

function formatMB(bytes: number): string { return (bytes / (1024 * 1024)).toFixed(1); }
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document) return true;
  return false;
}
function partnerLabel(p: Partner) { return `${p.first_name} ${p.last_name}`.trim(); }
function managedPartnershipLabel(p: ApiManagedPartnership) {
  return `${p.leader_first_name} ${p.leader_last_name} & ${p.follower_first_name} ${p.follower_last_name}`;
}
function managedPartnershipSummary(p: ApiManagedPartnership) {
  return `Leader: ${p.leader_first_name} ${p.leader_last_name} · Follower: ${p.follower_first_name} ${p.follower_last_name}`;
}

export type SongUploadFormProps = {
  /** "self" = partner/solo upload; "managed" = upload for a managed partnership. */
  variant: "self" | "managed";
  /** When set, an admin uploads on behalf of this existing user (variant must be "self").
      Loads the target user's partners and sends on_behalf_of_user_id. */
  onBehalf?: { userId: string; label: string };
  /** Optional callback after a successful upload (e.g. to keep the picked user). */
  onUploaded?: () => void;
};

export default function SongUploadForm({ variant, onBehalf, onUploaded }: SongUploadFormProps) {
  const api = useApiClient();
  const { getToken } = useAuth();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [managedPartnerships, setManagedPartnerships] = useState<ApiManagedPartnership[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [division, setDivision] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedManagedPartnershipId, setSelectedManagedPartnershipId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytesSent, setUploadBytesSent] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const partnersPath = onBehalf ? `/v1/admin/users/${onBehalf.userId}/partners` : "/v1/partners";
    Promise.all([
      api.get<Partner[]>(partnersPath),
      onBehalf ? Promise.resolve(null) : api.get<MeResponse>("/v1/auth/me"),
      variant === "managed" && !onBehalf
        ? api.get<ApiManagedPartnership[]>("/v1/managed-partnerships").catch(() => [])
        : Promise.resolve([] as ApiManagedPartnership[]),
    ])
      .then(([p, m, mp]) => {
        if (cancelled) return;
        setPartners(p);
        setMe(m);
        setManagedPartnerships(mp);
        if (p.length > 0) setSelectedPartnerId((cur) => (cur === "" ? p[0].id : cur));
        if (mp.length > 0) setSelectedManagedPartnershipId((cur) => (cur === "" ? mp[0].id : cur));
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, variant, onBehalf?.userId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { toast.error("Please select an audio file."); return; }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is too large. Please choose an audio file under 100 MB.");
      return;
    }
    if (!division) { toast.error("Please select a division."); return; }
    if (variant === "self") {
      if (!SOLO_ALLOWED_DIVISIONS.has(division) && !selectedPartnerId) {
        toast.error("A partner is required for this division.");
        return;
      }
    } else {
      if (!selectedManagedPartnershipId) {
        toast.error("Please select a managed partnership.");
        return;
      }
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
        if (isLast) { setUploadStage("processing"); setUploadProgress(i > 0 ? 90 : 50); }

        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));

          const form = new FormData();
          form.set("chunk", chunk, file.name);
          form.set("upload_id", uploadId);
          form.set("chunk_index", String(i));
          form.set("total_chunks", String(totalChunks));
          form.set("original_filename", file.name);
          form.set("mime_type", file.type || "audio/mpeg");
          form.set("division", division);
          if (variant === "self") {
            form.set("partner_id", selectedPartnerId || "");
          } else {
            form.set("managed_partnership_id", selectedManagedPartnershipId);
          }
          if (onBehalf) form.set("on_behalf_of_user_id", onBehalf.userId);
          form.set("routine_name", routineName.trim() || "");
          form.set("personal_descriptor", descriptor.trim() || "");

          let token: string | null;
          try { token = await getToken(); } catch { token = null; }
          if (!token) throw new Error("Your session expired. Please sign in again and retry the upload.");

          let res: Response;
          try {
            res = await fetch(`${apiBase}/v1/songs/upload/chunk`, {
              method: "POST",
              headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
              body: form,
            });
          } catch (fetchErr) {
            const detail = fetchErr instanceof Error ? `${fetchErr.name}: ${fetchErr.message}` : String(fetchErr);
            lastErr = new Error(`Network error (${detail}) — check your connection and try again.`);
            continue;
          }
          if (!res.ok) {
            const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
            lastErr = new Error(json?.error?.message ?? `Upload failed (${res.status})`);
            if (res.status === 401) throw lastErr;
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
      setSelectedPartnerId(partners.length > 0 ? partners[0].id : "");
      setUploadBytesSent(0);
      setFileInputKey((k) => k + 1);
      setFormKey((k) => k + 1);
      onUploaded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadStage("idle");
      setUploadProgress(0);
      setUploadBytesSent(0);
      setIsSubmitting(false);
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

  const hasFullName = Boolean(me?.first_name?.trim() && me?.last_name?.trim());
  const selectedManaged = managedPartnerships.find((p) => p.id === selectedManagedPartnershipId) ?? null;
  const managedSubmitDisabled = isSubmitting || managedPartnerships.length === 0 || !selectedManagedPartnershipId;

  return (
    <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
      {/* Who this upload is for */}
      {onBehalf ? (
        <p className="text-sm text-muted-foreground">
          Uploading as: <span className="font-medium text-foreground">{onBehalf.label}</span>
        </p>
      ) : variant === "self" ? (
        hasFullName ? (
          <p className="text-sm text-muted-foreground">
            Uploading as:{" "}
            <span className="font-medium text-foreground">{me!.first_name} {me!.last_name}</span>
          </p>
        ) : (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            Set your first and last name on the{" "}
            <Link to="/my-profile" className="underline font-medium">My Profile</Link>{" "}
            page so we can label your uploads correctly.
          </p>
        )
      ) : null}

      {/* Entity selector */}
      {variant === "self" ? (
        <div className="space-y-2">
          <Label htmlFor="song-partner">Partner</Label>
          <Select
            key={formKey}
            value={selectedPartnerId === "" ? SOLO_PARTNER_VALUE : selectedPartnerId}
            onValueChange={(v) => setSelectedPartnerId(v === SOLO_PARTNER_VALUE ? "" : v)}
          >
            <SelectTrigger id="song-partner"><SelectValue placeholder="No partner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={SOLO_PARTNER_VALUE}>No partner</SelectItem>
              {partners.map((p) => (
                <SelectItem key={p.id} value={p.id}>{partnerLabel(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!onBehalf && (
            <p className="text-xs text-muted-foreground">
              Add partners on the <Link to="/my-profile" className="underline">My Profile</Link> page.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="song-managed-partnership">Partnership</Label>
          {managedPartnerships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no managed partnerships yet. Add them on{" "}
              <Link to="/my-profile" className="underline">My Profile</Link>.
            </p>
          ) : (
            <>
              <Select
                key={formKey}
                value={selectedManagedPartnershipId || undefined}
                onValueChange={setSelectedManagedPartnershipId}
              >
                <SelectTrigger id="song-managed-partnership"><SelectValue placeholder="Select a partnership" /></SelectTrigger>
                <SelectContent>
                  {managedPartnerships.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{managedPartnershipLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedManaged && (
                <p className="text-sm text-muted-foreground">{managedPartnershipSummary(selectedManaged)}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Shared fields */}
      <div className="space-y-2">
        <Label htmlFor="song-division">Division</Label>
        <Select key={formKey} value={division || undefined} onValueChange={setDivision}>
          <SelectTrigger id="song-division"><SelectValue placeholder="Select a division" /></SelectTrigger>
          <SelectContent>
            {DIVISION_OPTIONS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="song-routine">Routine / Song name</Label>
        <Input id="song-routine" value={routineName} onChange={(e) => setRoutineName(e.target.value)} placeholder="Optional — recommended" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="song-descriptor">Personal descriptor</Label>
        <Input id="song-descriptor" value={descriptor} onChange={(e) => setDescriptor(e.target.value)} placeholder="e.g. 98%, -2%, v3, 2026-02-01" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="song-file">Audio file</Label>
        <Input key={fileInputKey} id="song-file" type="file" accept={isIOS() ? undefined : "audio/*"}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="cursor-pointer" />
        <p className="text-xs text-muted-foreground">MP3, WAV, FLAC, or M4A — max 100 MB</p>
      </div>

      <div className="sticky bottom-0 z-10 -mx-6 border-t bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <Button type="submit" disabled={variant === "managed" ? managedSubmitDisabled : isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? "Uploading…" : "Upload song"}
        </Button>
      </div>
      {uploadStage !== "idle" && (
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {uploadStage === "uploading" && file
                ? `Uploading… ${formatMB(uploadBytesSent)} of ${formatMB(file.size)} MB`
                : uploadStage === "processing" ? "Processing your file… this may take a moment" : "Saving…"}
            </span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}
    </form>
  );
}
