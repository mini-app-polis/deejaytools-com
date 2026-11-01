import { useAuth } from "@clerk/clerk-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import { queryKey, type KeyedEndpoint } from "@/api/queryKeys";
import QueryError from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMeQuery } from "@/hooks/useAuthMe";
import { useDivisions } from "@/hooks/useDivisions";
import type { ApiManagedPartnership, ApiPartner } from "@/schemas";
import { toastFirstError } from "@/lib/formErrors";
import {
  MAX_FILE_BYTES,
  UploadRefused,
  uploadSongInChunks,
  type UploadStage,
} from "@/lib/chunkedSongUpload";

// Divisions handled only by the (future) solo/teams portal — hidden from the standard upload picker.
const PORTAL_ONLY_DIVISIONS = new Set<string>(["Teams", "Cabaret", "My Division Is Not Listed"]);

function uploadDivisionGroups(groups: readonly (readonly string[])[]) {
  return groups
    .map((group) => group.filter((d) => !PORTAL_ONLY_DIVISIONS.has(d)).map((d) => ({ value: d, label: d })))
    .filter((group) => group.length > 0);
}

type Partner = Pick<ApiPartner, "id" | "first_name" | "last_name" | "partner_role">;

// A stable empty list while a query has no data, so effects over it hold.
const NO_ROWS: readonly never[] = [];

function formatMB(bytes: number): string { return (bytes / (1024 * 1024)).toFixed(1); }
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document) return true;
  return false;
}
/** The staff partner picker's "no partner" choice. */
const NO_PARTNER = "__none__";
function partnerLabel(p: Partner) { return `${p.first_name} ${p.last_name}`.trim(); }
function managedPartnershipLabel(p: ApiManagedPartnership) {
  return `${p.leader_first_name} ${p.leader_last_name} & ${p.follower_first_name} ${p.follower_last_name}`;
}
function managedPartnershipSummary(p: ApiManagedPartnership) {
  return `Leader: ${p.leader_first_name} ${p.leader_last_name} · Follower: ${p.follower_first_name} ${p.follower_last_name}`;
}

/**
 * The upload form's fields, checked in the order the form reads them; only
 * the first problem is reported. A self upload needs a partner unless event
 * staff upload for a dancer; a managed upload needs a partnership.
 */
function songUploadSchema(variant: "self" | "managed", staffOnBehalf: boolean) {
  return z
    .object({
      file: z.custom<File | null>(),
      division: z.string(),
      routineName: z.string(),
      descriptor: z.string(),
      selectedPartnerId: z.string(),
      selectedManagedPartnershipId: z.string(),
    })
    .superRefine((v, ctx) => {
      const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!v.file) return fail("file", "Please select an audio file.");
      if (v.file.size > MAX_FILE_BYTES) {
        return fail("file", "That file is too large. Please choose an audio file under 100 MB.");
      }
      if (!v.division) return fail("division", "Please select a division.");
      if (variant === "self") {
        if (!v.selectedPartnerId && !staffOnBehalf) fail("selectedPartnerId", "Please select a partner.");
      } else if (!v.selectedManagedPartnershipId) {
        fail("selectedManagedPartnershipId", "Please select a managed partnership.");
      }
    });
}
type SongUploadValues = z.infer<ReturnType<typeof songUploadSchema>>;

export type SongUploadFormProps = {
  /** "self" = partner upload; "managed" = upload for a managed partnership. */
  variant: "self" | "managed";
  /** When set, an admin uploads on behalf of this existing user (variant must be "self").
      Loads the target user's partners and sends on_behalf_of_user_id.
      With `eventId`, an event's staff upload for a dancer at that event: the
      dancer's partners come from the event's own route, the upload carries
      event_id, which the API authorizes the delegation on, and the song is
      submitted to the event in the same request (submit_to_event). */
  onBehalf?: { userId: string; label: string; eventId?: string };
  /** Optional callback after a successful upload (e.g. to keep the picked user). */
  onUploaded?: () => void;
};

export default function SongUploadForm({ variant, onBehalf, onUploaded }: SongUploadFormProps) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { groups: divisionGroups, loading: divisionsLoading, error: divisionsError } = useDivisions();
  const uploadGroups = useMemo(() => uploadDivisionGroups(divisionGroups), [divisionGroups]);

  const [fileInputKey, setFileInputKey] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytesSent, setUploadBytesSent] = useState(0);
  const staffOnBehalf = Boolean(onBehalf?.eventId);
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<SongUploadValues>({
    resolver: zodResolver(songUploadSchema(variant, staffOnBehalf)),
    defaultValues: {
      file: null,
      division: "",
      routineName: "",
      descriptor: "",
      selectedPartnerId: "",
      selectedManagedPartnershipId: "",
    },
  });
  const file = watch("file");
  const division = watch("division");
  const selectedPartnerId = watch("selectedPartnerId");
  const selectedManagedPartnershipId = watch("selectedManagedPartnershipId");
  const onBehalfUserId = onBehalf?.userId;
  const onBehalfEventId = onBehalf?.eventId;

  // Whose partners to offer: the dancer's at an event (for its staff), a
  // user's (for an admin), or the signed-in dancer's own.
  const forSelf = onBehalfUserId === undefined;
  const eventPartnersQuery = useEndpointQuery(endpoints.events.personPartners, {
    params: { id: onBehalfEventId ?? "", userId: onBehalfUserId ?? "" },
    enabled: !forSelf && !!onBehalfEventId,
  });
  const userPartnersQuery = useEndpointQuery(endpoints.admin.userPartners, {
    params: { id: onBehalfUserId ?? "" },
    enabled: !forSelf && !onBehalfEventId,
  });
  const ownPartnersQuery = useEndpointQuery(endpoints.partners.list, { enabled: forSelf });
  const partnersQuery = forSelf ? ownPartnersQuery : onBehalfEventId ? eventPartnersQuery : userPartnersQuery;
  const meQuery = useAuthMeQuery({ enabled: forSelf });
  const managedQuery = useEndpointQuery(endpoints.managedPartnerships.list, {
    enabled: variant === "managed" && forSelf,
  });
  const partners: readonly Partner[] = partnersQuery.data ?? NO_ROWS;
  const me = forSelf ? (meQuery.data ?? null) : null;
  const managedPartnerships: readonly ApiManagedPartnership[] = managedQuery.data ?? NO_ROWS;
  const loading = partnersQuery.isLoading || meQuery.isLoading || managedQuery.isLoading;
  // Partnerships failing to load leaves the rest of the form usable.
  const loadError = partnersQuery.error ?? meQuery.error;

  // Preselect the first partner and partnership once they load.
  useEffect(() => {
    if (partners.length > 0 && getValues("selectedPartnerId") === "") setValue("selectedPartnerId", partners[0].id);
  }, [partners, getValues, setValue]);
  useEffect(() => {
    if (managedPartnerships.length > 0 && getValues("selectedManagedPartnershipId") === "") {
      setValue("selectedManagedPartnershipId", managedPartnerships[0].id);
    }
  }, [managedPartnerships, getValues, setValue]);

  const handleUpload = async (values: SongUploadValues) => {
    const { file, division, routineName, descriptor, selectedPartnerId, selectedManagedPartnershipId } = values;
    // The schema has refused a submit without a file.
    if (!file) return;
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
          if (onBehalf?.eventId) {
            fields.event_id = onBehalf.eventId;
            fields.submit_to_event = "true";
          }
          return fields;
        },
        onProgress: ({ stage, progress, bytesSent }) => {
          setUploadStage(stage);
          setUploadProgress(progress);
          setUploadBytesSent(bytesSent);
        },
      });

      toast.success(
        staffOnBehalf
          ? "Song uploaded and submitted to the event, ready for check-in."
          : "Song uploaded successfully."
      );
      // The upload goes through its own fetch loop, so the lists it adds to
      // are refreshed here.
      const added: readonly KeyedEndpoint<never>[] = [
        endpoints.songs.list,
        endpoints.eventSongSubmissions.list,
        endpoints.events.songSubmissions,
        endpoints.admin.songs,
      ];
      for (const ep of added) {
        void queryClient.invalidateQueries({ queryKey: queryKey(ep) });
      }
      // The managed partnership stays picked for the next upload.
      reset({
        ...getValues(),
        file: null,
        division: "",
        routineName: "",
        descriptor: "",
        selectedPartnerId: partners.length > 0 ? partners[0].id : "",
      });
      setUploadBytesSent(0);
      setFileInputKey((k) => k + 1);
      setFormKey((k) => k + 1);
      onUploaded?.();
    } catch (err) {
      if (staffOnBehalf && err instanceof UploadRefused && err.code === "ENTITY_SLOT_TAKEN") {
        toast.error(
          `${onBehalf!.label} already has a song submitted for ${division} at this event. Nothing was uploaded.`
        );
        return;
      }
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadStage("idle");
      setUploadProgress(0);
      setUploadBytesSent(0);
    }
  };

  if (loadError && !loading) {
    return (
      <QueryError
        what="the upload form"
        error={loadError}
        onRetry={() => {
          if (partnersQuery.error) void partnersQuery.refetch();
          if (meQuery.error) void meQuery.refetch();
        }}
      />
    );
  }

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
  const selfSubmitDisabled =
    isSubmitting || (!staffOnBehalf && (partners.length === 0 || !selectedPartnerId));

  return (
    <form onSubmit={(e) => void handleSubmit(handleUpload, toastFirstError)(e)} className="space-y-4">
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
      {staffOnBehalf ? (
        <div className="space-y-2">
          <Label>Partner</Label>
          <ChoiceGroup
            key={formKey}
            ariaLabel="Partner"
            options={[
              ...partners.map((p) => ({ value: p.id, label: partnerLabel(p) })),
              { value: NO_PARTNER, label: "No partner" },
            ]}
            value={selectedPartnerId || NO_PARTNER}
            onChange={(v) => setValue("selectedPartnerId", v === NO_PARTNER ? "" : v)}
          />
          <p className="text-xs text-muted-foreground">
            The dancer&apos;s partners. The song is submitted to this event when it uploads.
          </p>
        </div>
      ) : variant === "self" ? (
        <div className="space-y-2">
          <Label>Partner</Label>
          {partners.length > 0 && (
            <ChoiceGroup
              key={formKey}
              ariaLabel="Partner"
              options={partners.map((p) => ({ value: p.id, label: partnerLabel(p) }))}
              value={selectedPartnerId}
              onChange={(id) => setValue("selectedPartnerId", id)}
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
          {managedQuery.error && !managedQuery.data ? (
            <QueryError
              what="your managed partnerships"
              error={managedQuery.error}
              onRetry={() => void managedQuery.refetch()}
            />
          ) : managedPartnerships.length === 0 ? (
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
                onChange={(id) => setValue("selectedManagedPartnershipId", id)}
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
        {divisionsError ? (
          <p className="text-sm text-destructive">Could not load the divisions: {divisionsError}</p>
        ) : divisionsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <ChoiceGroup
            key={formKey}
            ariaLabel="Division"
            groups={uploadGroups}
            value={division}
            onChange={(d) => setValue("division", d)}
          />
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="song-routine">Routine / Song name</Label>
        <Input id="song-routine" {...register("routineName")} placeholder="Optional — recommended" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="song-descriptor">Personal descriptor</Label>
        <Input id="song-descriptor" {...register("descriptor")} placeholder="e.g. 98%, -2%, v3, 2026-02-01" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="song-file">Audio file</Label>
        <Input key={fileInputKey} id="song-file" type="file" accept={isIOS() ? undefined : "audio/*"}
          onChange={(e) => setValue("file", e.target.files?.[0] ?? null)} className="cursor-pointer" />
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
