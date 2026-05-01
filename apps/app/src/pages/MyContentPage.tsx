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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function queueStatusBadge(checkin: ApiMyCheckin) {
  if (checkin.hasRun) {
    return <Badge variant="outline">Completed</Badge>;
  }
  if (checkin.queueType === "active") {
    return (
      <Badge className="bg-primary text-primary-foreground border-transparent">
        Active #{checkin.queuePosition}
      </Badge>
    );
  }
  if (checkin.queueType === "priority") {
    return (
      <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
        Priority #{checkin.queuePosition}
      </Badge>
    );
  }
  if (checkin.queueType === "non_priority") {
    return (
      <Badge className="bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/30">
        Standard #{checkin.queuePosition}
      </Badge>
    );
  }
  return <Badge variant="secondary">Off queue</Badge>;
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

      <Tabs defaultValue="checkins">
        <TabsList>
          <TabsTrigger value="checkins">Check-ins</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="songs">Songs</TabsTrigger>
        </TabsList>

        {/* ── Check-ins tab ── */}
        <TabsContent value="checkins" className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Your 100 most recent check-ins.</p>
            <Button variant="outline" size="sm" onClick={loadCheckins} disabled={checkinsLoading}>
              {checkinsLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>

          {checkinsLoading && !checkins ? (
            <Skeleton className="h-40 w-full" />
          ) : checkins?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No check-ins yet.</p>
          ) : (
            <div className={`space-y-2${checkinsLoading ? " opacity-60" : ""}`}>
              {checkins?.map((ci) => (
                <div
                  key={ci.id}
                  className="rounded-lg border px-3 py-3 text-sm space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium">
                        {ci.divisionName}
                        <span className="text-muted-foreground font-normal">
                          {" · "}{ci.entityLabel}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatSessionTitle(
                          { floor_trial_starts_at: ci.sessionFloorTrialStartsAt },
                          ci.eventTimezone
                        )}
                      </p>
                      {ci.songDisplayName && (
                        <p className="text-xs text-muted-foreground">{ci.songDisplayName}</p>
                      )}
                      {ci.notes && (
                        <p className="text-xs text-muted-foreground italic">Note: {ci.notes}</p>
                      )}
                    </div>
                    <div className="shrink-0">{queueStatusBadge(ci)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Partners tab ── */}
        <TabsContent value="partners" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={openCreate} className="w-full sm:w-auto">Add partner</Button>
          </div>

          {/* Mobile card list */}
          <div className={`sm:hidden space-y-3${partnersLoading ? " opacity-60" : ""}`}>
            {partners?.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No partners yet.</p>
            )}
            {partners?.map((p) => (
              <div key={p.id} className="rounded-lg border bg-card p-4 space-y-3 shadow-sm">
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
            {partnersLoading && !partners && <Skeleton className="h-40 w-full" />}
          </div>

          {/* Desktop table */}
          <div className={`hidden sm:block${partnersLoading ? " opacity-60" : ""}`}>
            {partnersLoading && !partners ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">No partners yet.</TableCell>
                    </TableRow>
                  )}
                  {partners?.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.first_name} {p.last_name}</TableCell>
                      <TableCell>
                        {p.partner_role === "leader" ? (
                          <Badge variant="default">Leader</Badge>
                        ) : (
                          <Badge variant="secondary">Follower</Badge>
                        )}
                      </TableCell>
                      <TableCell>{p.email ?? "—"}</TableCell>
                      <TableCell className="space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void handleDeletePartnerClick(p)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* ── Songs tab ── */}
        <TabsContent value="songs" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button asChild>
              <Link to="/songs/add">Add Song</Link>
            </Button>
          </div>

          {/* Mobile card list */}
          <div className={`sm:hidden space-y-3${songsLoading ? " opacity-60" : ""}`}>
            {songsLoading && songs.length === 0 && <Skeleton className="h-40 w-full" />}
            {songs.length === 0 && !songsLoading && (
              <p className="text-sm text-muted-foreground py-4 text-center">No songs yet.</p>
            )}
            {songs.map((s) => {
              const partnerName = !s.partner_id
                ? null
                : [s.partner_first_name, s.partner_last_name].filter(Boolean).join(" ").trim() || null;
              return (
                <div key={s.id} className="rounded-lg border bg-card p-4 space-y-2 shadow-sm">
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
                  {pendingDeleteSongId === s.id ? (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">Delete this song?</span>
                      <Button
                        type="button" size="sm" variant="destructive" className="flex-1"
                        onClick={() => void handleDeleteSong(s.id)}
                        disabled={deletingSongId === s.id}
                      >
                        {deletingSongId === s.id ? "Removing..." : "Yes, delete"}
                      </Button>
                      <Button
                        type="button" size="sm" variant="outline" className="flex-1"
                        onClick={() => setPendingDeleteSongId(null)}
                        disabled={deletingSongId === s.id}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button" size="sm" variant="destructive" className="w-full mt-1"
                      onClick={() => setPendingDeleteSongId(s.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className={`hidden sm:block${songsLoading ? " opacity-60" : ""}`}>
            {songsLoading && songs.length === 0 ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Processed filename</TableHead>
                    <TableHead>Division</TableHead>
                    <TableHead>Routine name</TableHead>
                    <TableHead>Descriptor</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="w-[200px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {songs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">No songs yet.</TableCell>
                    </TableRow>
                  )}
                  {songs.map((s) => {
                    const partnerCell = !s.partner_id
                      ? "—"
                      : [s.partner_first_name, s.partner_last_name].filter(Boolean).join(" ").trim() || "—";
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {s.processed_filename?.trim() ? s.processed_filename : "—"}
                        </TableCell>
                        <TableCell>{s.division ?? "—"}</TableCell>
                        <TableCell>{s.routine_name ?? "—"}</TableCell>
                        <TableCell>{s.personal_descriptor ?? "—"}</TableCell>
                        <TableCell>{partnerCell}</TableCell>
                        <TableCell>
                          {pendingDeleteSongId === s.id ? (
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-muted-foreground">Delete?</span>
                              <Button
                                type="button" size="sm" variant="destructive"
                                onClick={() => void handleDeleteSong(s.id)}
                                disabled={deletingSongId === s.id}
                              >
                                {deletingSongId === s.id ? "Removing..." : "Yes"}
                              </Button>
                              <Button
                                type="button" size="sm" variant="outline"
                                onClick={() => setPendingDeleteSongId(null)}
                                disabled={deletingSongId === s.id}
                              >
                                No
                              </Button>
                            </span>
                          ) : (
                            <Button
                              type="button" size="sm" variant="destructive"
                              onClick={() => setPendingDeleteSongId(s.id)}
                            >
                              Delete
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

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
