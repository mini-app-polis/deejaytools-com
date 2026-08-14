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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApiTeam } from "@deejaytools/schemas";
import {
  MAX_FILE_BYTES,
  uploadSongInChunks,
  type UploadStage,
} from "@/lib/chunkedSongUpload";

const SPECIAL_DIVISION_OPTIONS = ["Teams", "Cabaret", "Exhibition", "My Division Is Not Listed"];

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document) return true;
  return false;
}

export default function SpecialUploadForm() {
  const api = useApiClient();
  const { getToken } = useAuth();

  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [division, setDivision] = useState("");
  const [entityName, setEntityName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytesSent, setUploadBytesSent] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ApiTeam[]>("/v1/teams")
      .then((t) => {
        if (cancelled) return;
        setTeams(t);
        if (t.length > 0) setSelectedTeamId((cur) => (cur === "" ? t[0].id : cur));
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
    const isTeams = division === "Teams";
    if (isTeams) {
      if (!selectedTeamId) {
        toast.error("Please select a team.");
        return;
      }
    } else if (!entityName.trim()) {
      toast.error("Please enter a group name.");
      return;
    }

    setIsSubmitting(true);
    try {
      await uploadSongInChunks({
        file,
        getToken,
        buildFormFields: () => {
          const fields: Record<string, string> = {
            division,
            entity_type: isTeams ? "team" : "other",
            routine_name: routineName.trim() || "",
            personal_descriptor: descriptor.trim() || "",
          };
          if (isTeams) {
            fields.team_id = selectedTeamId;
          } else {
            fields.entity_name = entityName.trim();
          }
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
      setEntityName("");
      setSelectedTeamId(teams.length > 0 ? teams[0].id : "");
      setRoutineName("");
      setDescriptor("");
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

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const submitDisabled =
    isSubmitting ||
    !division ||
    (division === "Teams" ? teams.length === 0 || !selectedTeamId : !entityName.trim());

  return (
    <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="special-division">Division</Label>
        <Select key={formKey} value={division || undefined} onValueChange={setDivision}>
          <SelectTrigger id="special-division">
            <SelectValue placeholder="Select a division" />
          </SelectTrigger>
          <SelectContent>
            {SPECIAL_DIVISION_OPTIONS.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {division === "Teams" && (
        <div className="space-y-2">
          <Label htmlFor="special-team">Team</Label>
          {teams.length === 0 ? (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              You need a team to upload. Add one on the{" "}
              <Link to="/my-profile" className="underline font-medium">My Profile</Link> page.
            </p>
          ) : (
            <Select
              key={`${formKey}-team`}
              value={selectedTeamId || undefined}
              onValueChange={setSelectedTeamId}
            >
              <SelectTrigger id="special-team">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.identifier}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {division && division !== "Teams" && (
        <div className="space-y-2">
          <Label htmlFor="special-group-name">Group Name</Label>
          <Input
            id="special-group-name"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            placeholder="Enter the group name"
            required
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="special-routine">Routine / Song name</Label>
        <Input
          id="special-routine"
          value={routineName}
          onChange={(e) => setRoutineName(e.target.value)}
          placeholder="Optional — recommended"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="special-descriptor">Personal descriptor</Label>
        <Input
          id="special-descriptor"
          value={descriptor}
          onChange={(e) => setDescriptor(e.target.value)}
          placeholder="e.g. 98%, -2%, v3, 2026-02-01"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="special-file">Audio file</Label>
        <Input
          key={fileInputKey}
          id="special-file"
          type="file"
          accept={isIOS() ? undefined : "audio/*"}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="cursor-pointer"
        />
        <p className="text-xs text-muted-foreground">MP3, WAV, FLAC, or M4A — max 100 MB</p>
      </div>

      <div className="sticky bottom-0 z-10 -mx-6 border-t bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <Button type="submit" disabled={submitDisabled} className="w-full sm:w-auto">
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
  );
}
