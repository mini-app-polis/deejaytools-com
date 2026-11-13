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
import { Form, FormControl, FormDescription, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthMeQuery } from "@/hooks/useAuthMe";
import { useDivisions } from "@/hooks/useDivisions";
import {
  ROUND_SPLIT_DIVISION,
  SUBMISSION_ROUNDS,
  type ApiManagedPartnership,
  type ApiPartner,
  type SubmissionRound,
} from "@/schemas";
import { roundDisplayLabel } from "@/lib/submissionRounds";
import { toastFirstError } from "@/lib/formErrors";
import { MAX_FILE_BYTES, UploadRefused, type UploadInterrupted } from "@/lib/chunkedSongUpload";
import { useChunkedUpload } from "@/hooks/useChunkedUpload";
import UploadProgress from "@/components/UploadProgress";

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

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document) return true;
  return false;
}
const ROUND_OPTIONS = SUBMISSION_ROUNDS.map((value) => ({ value, label: roundDisplayLabel(value) }));

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
      round: z.enum(SUBMISSION_ROUNDS),
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
  onBehalf?: {
    userId: string;
    label: string;
    eventId?: string;
    /** With `eventId`: the event splits Classic into rounds (The Open). */
    roundsAllowed?: boolean;
  };
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
  const { progress: uploadState, interrupted, upload, clearInterrupted } = useChunkedUpload();
  const staffOnBehalf = Boolean(onBehalf?.eventId);
  const form = useForm<SongUploadValues>({
    resolver: zodResolver(songUploadSchema(variant, staffOnBehalf)),
    defaultValues: {
      file: null,
      division: "",
      routineName: "",
      descriptor: "",
      selectedPartnerId: "",
      selectedManagedPartnershipId: "",
      round: "prelims_and_finals",
    },
  });
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { isSubmitting },
  } = form;
  const file = watch("file");
  const division = watch("division");
  const round = watch("round");
  // The entry's rounds: a staff upload for Classic at The Open.
  const showRoundField =
    staffOnBehalf && !!onBehalf?.roundsAllowed && division === ROUND_SPLIT_DIVISION;
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

  // An upload that stopped is offered for resuming only with its own file.
  useEffect(() => {
    if (interrupted && interrupted.resume.file !== file) clearInterrupted();
  }, [interrupted, file, clearInterrupted]);

  const handleUpload = async (values: SongUploadValues, resume: UploadInterrupted | null = null) => {
    const { file, division, routineName, descriptor, selectedPartnerId, selectedManagedPartnershipId, round } =
      values;
    // The schema has refused a submit without a file.
    if (!file) return;
    try {
      await upload({
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
            if (showRoundField) fields.round = round;
          }
          return fields;
        },
      }, resume);

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
        round: "prelims_and_finals",
      });
      setFileInputKey((k) => k + 1);
      setFormKey((k) => k + 1);
      onUploaded?.();
    } catch (err) {
      if (staffOnBehalf && err instanceof UploadRefused && err.code === "ENTITY_SLOT_TAKEN") {
        toast.error(
          showRoundField
            ? `${onBehalf!.label} already has a ${division} song for ${roundDisplayLabel(round).toLowerCase()} at this event. Nothing was uploaded.`
            : `${onBehalf!.label} already has a song submitted for ${division} at this event. Nothing was uploaded.`
        );
        return;
      }
      toast.error(err instanceof Error ? err.message : "Upload failed.");
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
    <Form {...form}>
      <form onSubmit={(e) => void handleSubmit((values) => handleUpload(values), toastFirstError)(e)} className="space-y-4">
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
          <FormField
            control={form.control}
            name="selectedPartnerId"
            render={({ field }) => (
              <FormItem>
                <Label>Partner</Label>
                <FormControl>
                  <ChoiceGroup
                    key={formKey}
                    ariaLabel="Partner"
                    options={[
                      ...partners.map((p) => ({ value: p.id, label: partnerLabel(p) })),
                      { value: NO_PARTNER, label: "No partner" },
                    ]}
                    value={field.value || NO_PARTNER}
                    onChange={(v) => field.onChange(v === NO_PARTNER ? "" : v)}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  The dancer&apos;s partners. The song is submitted to this event when it uploads.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : variant === "self" ? (
          <FormField
            control={form.control}
            name="selectedPartnerId"
            render={({ field }) => (
              <FormItem>
                <Label>Partner</Label>
                {partners.length > 0 && (
                  <FormControl>
                    <ChoiceGroup
                      key={formKey}
                      ariaLabel="Partner"
                      options={partners.map((p) => ({ value: p.id, label: partnerLabel(p) }))}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
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
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name="selectedManagedPartnershipId"
            render={({ field }) => (
              <FormItem>
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
                    <FormControl>
                      <ChoiceGroup
                        key={formKey}
                        ariaLabel="Partnership"
                        options={managedPartnerships.map((mp) => ({
                          value: mp.id,
                          label: managedPartnershipLabel(mp),
                        }))}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    {selectedManaged && (
                      <p className="text-sm text-muted-foreground">{managedPartnershipSummary(selectedManaged)}</p>
                    )}
                  </>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Shared fields */}
        <FormField
          control={form.control}
          name="division"
          render={({ field }) => (
            <FormItem>
              <Label>Division</Label>
              {divisionsError ? (
                <p className="text-sm text-destructive">Could not load the divisions: {divisionsError}</p>
              ) : divisionsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <FormControl>
                  <ChoiceGroup
                    key={formKey}
                    ariaLabel="Division"
                    groups={uploadGroups}
                    value={field.value}
                    onChange={(value: string) => {
                      field.onChange(value);
                      // A round belongs to the division it was chosen under.
                      setValue("round", "prelims_and_finals");
                    }}
                  />
                </FormControl>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        {showRoundField && (
          <div className="space-y-2">
            <Label>Round</Label>
            <ChoiceGroup
              options={ROUND_OPTIONS}
              value={round}
              onChange={(value: SubmissionRound) => setValue("round", value)}
              ariaLabel="Submission round"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Prelims Only or Finals Only when the dancer has a different song for each round.
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="song-routine">Routine / Song name</Label>
          <Input id="song-routine" {...register("routineName")} placeholder="Optional — recommended" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="song-descriptor">Personal descriptor</Label>
          <Input id="song-descriptor" {...register("descriptor")} placeholder="e.g. 98%, -2%, v3, 2026-02-01" />
        </div>
        <FormField
          control={form.control}
          name="file"
          render={({ field }) => (
            <FormItem>
              <Label htmlFor="song-file">Audio file</Label>
              <FormControl>
                <Input key={fileInputKey} id="song-file" type="file" accept={isIOS() ? undefined : "audio/*"}
                  name={field.name} ref={field.ref} onBlur={field.onBlur}
                  onChange={(e) => field.onChange(e.target.files?.[0] ?? null)} className="cursor-pointer" />
              </FormControl>
              <FormDescription className="text-xs">MP3, WAV, FLAC, or M4A — max 100 MB</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="sticky bottom-0 z-10 -mx-6 border-t bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <Button type="submit" disabled={variant === "managed" ? managedSubmitDisabled : selfSubmitDisabled} className="w-full sm:w-auto">
            {isSubmitting ? "Uploading…" : "Upload song"}
          </Button>
        </div>
        <UploadProgress
          progress={uploadState}
          fileSize={file?.size ?? null}
          interrupted={interrupted}
          onResume={() => void handleSubmit((values) => handleUpload(values, interrupted), toastFirstError)()}
          resumeDisabled={isSubmitting}
        />
      </form>
    </Form>
  );
}
