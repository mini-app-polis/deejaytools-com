import { PartnerRoleSchema, type PartnerRole } from "@deejaytools/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
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

export default function PartnersSection() {
  const api = useApiClient();

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

  const loadPartners = () => {
    setPartnersLoading(true);
    api
      .get<PartnerRow[]>("/v1/partners")
      .then(setPartners)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setPartnersLoading(false));
  };

  useEffect(() => {
    loadPartners();
  }, [api]);

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

  return (
    <>
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
    </>
  );
}
