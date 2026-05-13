import { PartnerRoleSchema, type PartnerRole, type ApiMyCheckin, type ApiSong } from "@deejaytools/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSessionTitle } from "@/lib/sessionFormat";

// ─── Partners types & schema ──────────────────────────────────────────────────

type PartnerRow = {
  id: string;
  first_name: string;
  last_name: string;
  partner_role: PartnerRole;
  email: string | null;
};

const partnerSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  partner_role: PartnerRoleSchema,
  email: z
    .string()
    .optional()
    .refine((s) => s === undefined || s === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), {
      message: "Invalid email",
    }),
});
type PartnerForm = z.infer<typeof partnerSchema>;

type DeleteAssociations = {
  song_count: number;
  has_active_checkin: boolean;
  has_checkin_history?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function queueStatusBadge(checkin: ApiMyCheckin) {
  if (checkin.queueType === "active") {
    return (
      <Badge className="bg-primary text-primary-foreground border-transparent">
        Active queue
      </Badge>
    );
  }
  if (checkin.queueType === "priority") {
    return (
      <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
        Priority queue
      </Badge>
    );
  }
  if (checkin.queueType === "non_priority") {
    return (
      <Badge className="bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/30">
        Standard queue
      </Badge>
    );
  }
  return <Badge variant="secondary">In queue</Badge>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MyContentPage() {
  const api = useApiClient();

  // ── Partners state ───────────────────────────────────────────────────────────
  const [partners, setPartners] = useState<PartnerRow[] | null>(null);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PartnerRow | null>(null);
  const [deleteAssociations, setDeleteAssociations] = useState<DeleteAssociations | null>(null);
  const [isCheckingAssociations, setIsCheckingAssociations] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  const form = useForm<PartnerForm>({
    resolver: zodResolver(partnerSchema),
    defaultValues: { first_name: "", last_name: "", partner_role: "follower", email: "" },
  });

  // ── Songs state ──────────────────────────────────────────────────────────────
  const [songs, setSongs] = useState<ApiSong[]>([]);
  const [songsLoading, setSongsLoading] = useState(true);
  const [pendingDeleteSongId, setPendingDeleteSongId] = useState<string | null>(null);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);

  // ── Check-ins state ──────────────────────────────────────────────────────────
  const [checkins, setCheckins] = useState<ApiMyCheckin[] | null>(null);
  const [checkinsLoading, setCheckinsLoading] = useState(true);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [pendingWithdrawId, setPendingWithdrawId] = useState<string | null>(null);

  // ── Data loaders ─────────────────────────────────────────────────────────────

  const loadPartners = () => {
    setPartnersLoading(true);
    api
      .get<PartnerRow[]>("/v1/partners")
      .then(setPartners)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setPartnersLoading(false));
  };

  const loadSongs = () => {
    setSongsLoading(true);
    api
      .get<ApiSong[]>("/v1/songs")
      .then(setSongs)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setSongsLoading(false));
  };

  const loadCheckins = () => {
    setCheckinsLoading(true);
    api
      .get<ApiMyCheckin[]>("/v1/checkins/mine")
      .then(setCheckins)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setCheckinsLoading(false));
  };

  const handleWithdraw = async (checkinId: string) => {
    setWithdrawingId(checkinId);
    try {
      await api.del(`/v1/checkins/${checkinId}`);
      setCheckins((prev) => prev?.filter((c) => c.id !== checkinId) ?? null);
      setPendingWithdrawId(null);
      toast.success("Withdrawn from queue.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to withdraw.");
      setPendingWithdrawId(null);
    } finally {
      setWithdrawingId(null);
    }
  };

  useEffect(() => {
    loadPartners();
    loadSongs();
    loadCheckins();
  }, [api]);

  // ── Partners actions ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    form.reset({ first_name: "", last_name: "", partner_role: "follower", email: "" });
    setFormOpen(true);
  };

  const openEdit = (p: PartnerRow) => {
    setEditing(p);
    form.reset({
      first_name: p.first_name,
      last_name: p.last_name,
      partner_role: p.partner_role,
      email: p.email ?? "",
    });
    setFormOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setIsFormSubmitting(true);
    try {
      if (editing) {
        const updated = await api.patch<PartnerRow>(`/v1/partners/${editing.id}`, {
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim(),
          partner_role: values.partner_role,
          email: values.email?.trim() ? values.email.trim() : null,
        });
        toast.success("Partner updated");
        setPartners((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
      } else {
        const created = await api.post<PartnerRow>("/v1/partners", {
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim(),
          partner_role: values.partner_role,
          ...(values.email?.trim() ? { email: values.email.trim() } : {}),
        });
        toast.success("Partner added");
        setPartners((prev) => (prev ? [created, ...prev] : [created]));
      }
      setFormOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsFormSubmitting(false);
    }
  });

  const handleDeletePartnerClick = async (partner: PartnerRow) => {
    setDeleteTarget(partner);
    setDeleteAssociations(null);
    setIsCheckingAssociations(true);
    try {
      const result = await api.get<DeleteAssociations>(`/v1/partners/${partner.id}/associations`);
      setDeleteAssociations(result);
    } catch {
      setDeleteAssociations({ song_count: 0, has_active_checkin: false });
    } finally {
      setIsCheckingAssociations(false);
    }
  };

  const confirmDeletePartner = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.del(`/v1/partners/${deleteTarget.id}`);
      setPartners((prev) => prev?.filter((p) => p.id !== deleteTarget.id) ?? null);
      setDeleteTarget(null);
      setDeleteAssociations(null);
      toast.success("Partner removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete partner.");
      setDeleteTarget(null);
      setDeleteAssociations(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Songs actions ─────────────────────────────────────────────────────────────

  const handleDeleteSong = async (id: string) => {
    setDeletingSongId(id);
    try {
      await api.del(`/v1/songs/${id}`);
      setSongs((prev) => prev.filter((s) => s.id !== id));
      setPendingDeleteSongId(null);
      toast.success("Song removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete song.");
      setPendingDeleteSongId(null);
    } finally {
      setDeletingSongId(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">My Content</h1>

      {/* ── Check-ins section ── */}
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">Check-ins</h2>
        </div>
        <div className="p-4 space-y-3">
          {checkinsLoading && !checkins ? (
            <Skeleton className="h-40 w-full" />
          ) : checkins?.length === 0 ? (
            <p className="text-sm text-muted-foreground">You are not currently checked in anywhere.</p>
          ) : (
            <div className={`space-y-3${checkinsLoading ? " opacity-60" : ""}`}>
              {checkins?.map((ci) => (
                <div key={ci.id} className="flex items-start gap-3">
                  {/* Entry card */}
                  <div className="flex-1 min-w-0 rounded-lg border px-4 py-3 text-sm space-y-2">
                    {/* Position + queue type */}
                    <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-border/40">
                      <div>
                        <p className="text-sm font-medium">
                          This entry is{" "}
                          <span className="text-foreground font-semibold">#{ci.overallPosition}</span>{" "}
                          in line
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(ci.runCount ?? 0) === 0
                            ? "No runs yet this session"
                            : (ci.runCount ?? 0) === 1
                            ? "1 run this session"
                            : `${ci.runCount} runs this session`}
                        </p>
                      </div>
                      <div className="shrink-0">{queueStatusBadge(ci)}</div>
                    </div>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        {ci.eventName && (
                          <p className="text-xs text-muted-foreground">{ci.eventName}</p>
                        )}
                        <p className="font-medium">
                          {formatSessionTitle(
                            { floor_trial_starts_at: ci.sessionFloorTrialStartsAt },
                            ci.eventTimezone
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-0.5 border-t border-border/40 pt-2">
                      <p>
                        <span className="text-muted-foreground">Division </span>
                        {ci.divisionName}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Dancer </span>
                        {ci.entityLabel}
                      </p>
                      {ci.songDisplayName && (
                        <p>
                          <span className="text-muted-foreground">Song </span>
                          {ci.songDisplayName}
                        </p>
                      )}
                      {ci.songProcessedFilename && (
                        <p className="font-mono text-xs text-muted-foreground/70 truncate">
                          {ci.songProcessedFilename}
                        </p>
                      )}
                      {ci.notes && (
                        <p className="text-muted-foreground italic">Note: {ci.notes}</p>
                      )}
                    </div>

                    {/* Withdraw */}
                    <div className="pt-2 border-t border-border/40 mt-1">
                      <Button
                        type="button" size="sm" variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => setPendingWithdrawId(ci.id)}
                      >
                        Withdraw from queue
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Partners section ── */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
          <h2 className="font-semibold">Partners</h2>
          <Button size="sm" onClick={openCreate}>Add partner</Button>
        </div>
        <div className="p-4 space-y-4">
          <div className={`space-y-3${partnersLoading ? " opacity-60" : ""}`}>
            {partnersLoading && !partners && <Skeleton className="h-40 w-full" />}
            {partners?.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No partners yet.</p>
            )}
            {partners?.map((p) => (
              <div key={p.id} className="rounded-lg border-2 border-primary/40 bg-card p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-base">{p.first_name} {p.last_name}</p>
                  {p.partner_role === "leader" ? (
                    <Badge variant="default">Leader</Badge>
                  ) : (
                    <Badge variant="secondary">Follower</Badge>
                  )}
                </div>
                {p.email && <p className="text-sm text-muted-foreground">{p.email}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(p)}>
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={() => void handleDeletePartnerClick(p)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Songs section ── */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
          <h2 className="font-semibold">Songs</h2>
          <Button size="sm" asChild>
            <Link to="/songs/add">Add song</Link>
          </Button>
        </div>
        <div className="p-4 space-y-4">
          <div className={`space-y-3${songsLoading ? " opacity-60" : ""}`}>
            {songsLoading && songs.length === 0 && <Skeleton className="h-40 w-full" />}
            {songs.length === 0 && !songsLoading && (
              <p className="text-sm text-muted-foreground py-4 text-center">No songs yet.</p>
            )}
            {songs.map((s) => {
              const partnerName = !s.partner_id
                ? null
                : [s.partner_first_name, s.partner_last_name].filter(Boolean).join(" ").trim() || null;
              const driveUrl = s.drive_file_id
                ? `https://drive.google.com/file/d/${s.drive_file_id}/view`
                : null;
              return (
                <div key={s.id} className="rounded-lg border-2 border-primary/40 bg-card p-4 space-y-2 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-sm leading-snug break-all flex-1">
                      {s.processed_filename?.trim() ? s.processed_filename : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {s.division && (
                      <span>
                        <span className="text-muted-foreground text-xs">Division </span>
                        {s.division}
                      </span>
                    )}
                    {partnerName && (
                      <span>
                        <span className="text-muted-foreground text-xs">Partner </span>
                        {partnerName}
                      </span>
                    )}
                    {s.routine_name && (
                      <span>
                        <span className="text-muted-foreground text-xs">Routine </span>
                        {s.routine_name}
                      </span>
                    )}
                    {s.personal_descriptor && (
                      <span>
                        <span className="text-muted-foreground text-xs">Descriptor </span>
                        {s.personal_descriptor}
                      </span>
                    )}
                  </div>
                  {driveUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full mt-1"
                      asChild
                    >
                      <a
                        href={driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open song in Google Drive to check playback"
                      >
                        Open in Google Drive
                      </a>
                    </Button>
                  )}
                  <Button
                    type="button" size="sm" variant="destructive" className="w-full mt-1"
                    onClick={() => setPendingDeleteSongId(s.id)}
                  >
                    Delete
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Withdraw confirm dialog ── */}
      {(() => {
        const pendingCheckin = checkins?.find((c) => c.id === pendingWithdrawId);
        return (
          <Dialog
            open={!!pendingWithdrawId}
            onOpenChange={(open: boolean) => { if (!open) setPendingWithdrawId(null); }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Withdraw from queue?</DialogTitle>
                <DialogDescription>
                  {pendingCheckin
                    ? <>You will be removed from the <span className="font-medium">{pendingCheckin.divisionName}</span> queue. This cannot be undone.</>
                    : "You will be removed from the queue. This cannot be undone."
                  }
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={!!withdrawingId}
                  onClick={() => setPendingWithdrawId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!!withdrawingId}
                  onClick={() => { if (pendingWithdrawId) void handleWithdraw(pendingWithdrawId); }}
                >
                  {withdrawingId ? "Withdrawing…" : "Withdraw"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Song delete confirm dialog ── */}
      {(() => {
        const pendingSong = songs.find((s) => s.id === pendingDeleteSongId);
        return (
          <Dialog
            open={!!pendingDeleteSongId}
            onOpenChange={(open: boolean) => { if (!open) setPendingDeleteSongId(null); }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this song?</DialogTitle>
                <DialogDescription>
                  {pendingSong?.processed_filename?.trim()
                    ? <>This will permanently remove <span className="font-mono break-all">{pendingSong.processed_filename}</span>. This cannot be undone.</>
                    : "This will permanently remove the song. This cannot be undone."
                  }
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={!!deletingSongId}
                  onClick={() => setPendingDeleteSongId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={!!deletingSongId}
                  onClick={() => { if (pendingDeleteSongId) void handleDeleteSong(pendingDeleteSongId); }}
                >
                  {deletingSongId ? "Removing…" : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── Partner add/edit dialog ── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit partner" : "Add partner"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="partner_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Their role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select their role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="leader">Leader</SelectItem>
                        <SelectItem value="follower">Follower</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>Your role will be the opposite.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optional)</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={isFormSubmitting}>
                  {isFormSubmitting ? "Saving..." : editing ? "Save changes" : "Add partner"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Partner delete confirm dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteAssociations(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove partner?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget?.first_name} {deleteTarget?.last_name} will be removed from your list.
          </p>
          {isCheckingAssociations ? (
            <p className="text-sm text-muted-foreground">Checking linked data…</p>
          ) : deleteAssociations?.has_active_checkin ? (
            <p className="text-sm text-destructive">
              This partner has an active check-in and cannot be deleted. Complete or withdraw the check-in first.
            </p>
          ) : deleteAssociations?.has_checkin_history ? (
            <p className="text-sm text-muted-foreground">
              This partner has check-in history. Their historical data will be preserved after deletion.
            </p>
          ) : deleteAssociations && deleteAssociations.song_count > 0 ? (
            <p className="text-sm text-muted-foreground">
              This partner is linked to {deleteAssociations.song_count} song
              {deleteAssociations.song_count === 1 ? "" : "s"}. Deleting will remove the partner from those songs.
            </p>
          ) : deleteAssociations != null ? (
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => { setDeleteTarget(null); setDeleteAssociations(null); }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDeletePartner()}
              disabled={isDeleting || isCheckingAssociations || !!deleteAssociations?.has_active_checkin}
            >
              {isDeleting ? "Removing..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
