import { useAuth } from "@clerk/clerk-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import { queryKey } from "@/api/queryKeys";
import QueryError from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiTeam } from "@/schemas";
import { toastFirstError } from "@/lib/formErrors";
import {
  MAX_FILE_BYTES,
  uploadSongInChunks,
  type UploadStage,
} from "@/lib/chunkedSongUpload";

// A stable empty list while the teams have not loaded, so the effect over it holds.
const NO_TEAMS: readonly ApiTeam[] = [];

const SPECIAL_DIVISION_OPTIONS = ["Teams", "Cabaret", "Exhibition", "My Division Is Not Listed"];

// Checked in the order the old form read them; only the first problem is reported.
const specialUploadSchema = z
  .object({
    file: z.custom<File | null>(),
    division: z.string(),
    entityName: z.string(),
    selectedTeamId: z.string(),
    routineName: z.string(),
    descriptor: z.string(),
  })
  .superRefine((v, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (!v.file) return fail("file", "Please select an audio file.");
    if (v.file.size > MAX_FILE_BYTES) {
      return fail("file", "That file is too large. Please choose an audio file under 100 MB.");
    }
    if (!v.division) return fail("division", "Please select a division.");
    if (v.division === "Teams") {
      if (!v.selectedTeamId) fail("selectedTeamId", "Please select a team.");
    } else if (!v.entityName.trim()) {
      fail("entityName", "Please enter a group name.");
    }
  });
type SpecialUploadValues = z.infer<typeof specialUploadSchema>;

const EMPTY_FORM: SpecialUploadValues = {
  file: null,
  division: "",
  entityName: "",
  selectedTeamId: "",
  routineName: "",
  descriptor: "",
};

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
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  const teamsQuery = useEndpointQuery(endpoints.teams.list);
  const teams = teamsQuery.data ?? NO_TEAMS;
  const loading = teamsQuery.isLoading;

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<SpecialUploadValues>({
    resolver: zodResolver(specialUploadSchema),
    defaultValues: EMPTY_FORM,
  });
  const file = watch("file");
  const division = watch("division");
  const entityName = watch("entityName");
  const selectedTeamId = watch("selectedTeamId");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytesSent, setUploadBytesSent] = useState(0);

  // Preselect the first team once the teams load.
  useEffect(() => {
    if (teams.length > 0 && getValues("selectedTeamId") === "") setValue("selectedTeamId", teams[0].id);
  }, [teams, getValues, setValue]);

  const handleUpload = async ({
    file,
    division,
    entityName,
    selectedTeamId,
    routineName,
    descriptor,
  }: SpecialUploadValues) => {
    // The schema has refused a submit without a file.
    if (!file) return;
    const isTeams = division === "Teams";
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
      // The upload goes through its own fetch loop, so the song list is refreshed here.
      void queryClient.invalidateQueries({ queryKey: queryKey(endpoints.songs.list) });
      reset({ ...EMPTY_FORM, selectedTeamId: teams.length > 0 ? teams[0].id : "" });
      setUploadBytesSent(0);
      setFileInputKey((k) => k + 1);
      setFormKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadStage("idle");
      setUploadProgress(0);
      setUploadBytesSent(0);
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
    <form onSubmit={(e) => void handleSubmit(handleUpload, toastFirstError)(e)} className="space-y-4">
      <div className="space-y-2">
        <Label>Division</Label>
        <ChoiceGroup
          key={formKey}
          ariaLabel="Division"
          options={SPECIAL_DIVISION_OPTIONS.map((d) => ({ value: d, label: d }))}
          value={division}
          onChange={(d) => setValue("division", d)}
        />
      </div>

      {division === "Teams" && (
        <div className="space-y-2">
          <Label>Team</Label>
          {teamsQuery.error && !teamsQuery.data ? (
            <QueryError what="your teams" error={teamsQuery.error} onRetry={() => void teamsQuery.refetch()} />
          ) : teams.length === 0 ? (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              You need a team to upload. Add one on the{" "}
              <Link to="/my-profile" className="underline font-medium">My Profile</Link> page.
            </p>
          ) : (
            <ChoiceGroup
              key={`${formKey}-team`}
              ariaLabel="Team"
              options={teams.map((t) => ({ value: t.id, label: t.identifier }))}
              value={selectedTeamId}
              onChange={(id) => setValue("selectedTeamId", id)}
            />
          )}
        </div>
      )}

      {division && division !== "Teams" && (
        <div className="space-y-2">
          <Label htmlFor="special-group-name">Group Name</Label>
          <Input
            id="special-group-name"
            {...register("entityName")}
            placeholder="Enter the group name"
            required
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="special-routine">Routine / Song name</Label>
        <Input
          id="special-routine"
          {...register("routineName")}
          placeholder="Optional — recommended"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="special-descriptor">Personal descriptor</Label>
        <Input
          id="special-descriptor"
          {...register("descriptor")}
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
          onChange={(e) => setValue("file", e.target.files?.[0] ?? null)}
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
