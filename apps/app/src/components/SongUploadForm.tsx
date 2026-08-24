import { useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DIVISION_GROUPS, type ApiManagedPartnership } from "@deejaytools/schemas";
import type { AuthMe as MeResponse } from "@/hooks/useAuthMe";
import {
  MAX_FILE_BYTES,
  uploadSongInChunks,
  type UploadStage,
} from "@/lib/chunkedSongUpload";

// Divisions handled only by the (future) solo/teams portal — hidden from the standard upload picker.
const PORTAL_ONLY_DIVISIONS = new Set<string>(["Teams", "Cabaret", "My Division Is Not Listed"]);
const UPLOAD_DIVISION_GROUPS = DIVISION_GROUPS.map((group) =>
  group.filter((d) => !PORTAL_ONLY_DIVISIONS.has(d)).map((d) => ({ value: d, label: d }))
);

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
  /** "self" = partner upload; "managed" = upload for a managed partnership. */
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
      if (!selectedPartnerId) {
        toast.error("Please select a partner.");
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
      await uploadSongInChunks({
        file,
        getToken,
        buildFormFields: () => {
          const fields: Record<string, string> = {
            division,
            routine_name: routineName.trim() || "",
            personal_descriptor: descriptor.trim() || "",
          };
          if (variant === "self") {
            fields.partner_id = selectedPartnerId || "";
          } else {
            fields.managed_partnership_id = selectedManagedPartnershipId;
          }
          if (onBehalf) fields.on_behalf_of_user_id = onBehalf.userId;
          return fields;
        },
        onProgress: ({ stage, progress, bytesSent }) => {
          setUploadStage(stage);
          setUploadProgress(progress);
          setUploadBytesSent(bytesSent);
        },
      });

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
  const selfSubmitDisabled = isSubmitting || partners.length === 0 || !selectedPartnerId;

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
          <Label>Partner</Label>
          {partners.length > 0 && (
            <ChoiceGroup
              key={formKey}
              ariaLabel="Partner"
              options={partners.map((p) => ({ value: p.id, label: partnerLabel(p) }))}
              value={selectedPartnerId}
              onChange={setSelectedPartnerId}
            />
          )}
          {partners.length === 0 ? (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              You need a partner to upload. Add one on the{" "}
              <Link to="/my-profile" className="underline font-medium">My Profile</Link> page.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add partners on the <Link to="/my-profile" className="underline">My Profile</Link> page.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Partnership</Label>
          {managedPartnerships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have no managed partnerships yet. Add them on{" "}
              <Link to="/my-profile" className="underline">My Profile</Link>.
            </p>
          ) : (
            <>
              <ChoiceGroup
                key={formKey}
                ariaLabel="Partnership"
                options={managedPartnerships.map((mp) => ({
                  value: mp.id,
                  label: managedPartnershipLabel(mp),
                }))}
                value={selectedManagedPartnershipId}
                onChange={setSelectedManagedPartnershipId}
              />
              {selectedManaged && (
                <p className="text-sm text-muted-foreground">{managedPartnershipSummary(selectedManaged)}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Shared fields */}
      <div className="space-y-2">
        <Label>Division</Label>
        <ChoiceGroup
          key={formKey}
          ariaLabel="Division"
          groups={UPLOAD_DIVISION_GROUPS}
          value={division}
          onChange={setDivision}
        />
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
        <Button type="submit" disabled={variant === "managed" ? managedSubmitDisabled : selfSubmitDisabled} className="w-full sm:w-auto">
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
