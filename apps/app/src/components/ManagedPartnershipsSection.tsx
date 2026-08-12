import {
  createManagedPartnershipBodySchema,
  type ApiManagedPartnership,
} from "@deejaytools/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useApiClient } from "@/api/client";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type ManagedPartnershipForm = z.infer<typeof createManagedPartnershipBodySchema>;

const emptyForm: ManagedPartnershipForm = {
  leader_first_name: "",
  leader_last_name: "",
  follower_first_name: "",
  follower_last_name: "",
};

function partnershipLabel(p: ApiManagedPartnership): string {
  return `${p.leader_first_name} ${p.leader_last_name} (Leader) + ${p.follower_first_name} ${p.follower_last_name} (Follower)`;
}

export default function ManagedPartnershipsSection() {
  const api = useApiClient();

  const [items, setItems] = useState<ApiManagedPartnership[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiManagedPartnership | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiManagedPartnership | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  const form = useForm<ManagedPartnershipForm>({
    resolver: zodResolver(createManagedPartnershipBodySchema),
    defaultValues: emptyForm,
  });

  const load = () => {
    setLoading(true);
    api
      .get<ApiManagedPartnership[]>("/v1/managed-partnerships")
      .then(setItems)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api]);

  const openCreate = () => {
    setEditing(null);
    form.reset(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (p: ApiManagedPartnership) => {
    setEditing(p);
    form.reset({
      leader_first_name: p.leader_first_name,
      leader_last_name: p.leader_last_name,
      follower_first_name: p.follower_first_name,
      follower_last_name: p.follower_last_name,
    });
    setFormOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setIsFormSubmitting(true);
    try {
      if (editing) {
        const updated = await api.patch<ApiManagedPartnership>(
          `/v1/managed-partnerships/${editing.id}`,
          values
        );
        toast.success("Partnership updated");
        setItems((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
      } else {
        const created = await api.post<ApiManagedPartnership>(
          "/v1/managed-partnerships",
          values
        );
        toast.success("Partnership added");
        setItems((prev) => (prev ? [created, ...prev] : [created]));
      }
      setFormOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsFormSubmitting(false);
    }
  });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.del(`/v1/managed-partnerships/${deleteTarget.id}`);
      setItems((prev) => prev?.filter((p) => p.id !== deleteTarget.id) ?? null);
      setDeleteTarget(null);
      toast.success("Partnership removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete partnership.");
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
              <h2 className="font-semibold">Managed Partnerships</h2>
              {/* STUB(db): needs `managed_partnerships` table — remove when schema lands */}
              <p className="text-xs text-muted-foreground">Backend pending — changes won't save yet.</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Partnerships you upload and check in on behalf of — a leader and a follower. Private to you.
            </p>
          </div>
          <Button size="sm" className="shrink-0" onClick={openCreate}>Add partnership</Button>
        </div>
        <div className="p-4 space-y-4">
          <div className={`space-y-3${loading ? " opacity-60" : ""}`}>
            {loading && !items && <Skeleton className="h-40 w-full" />}
            {items?.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No managed partnerships yet.</p>
            )}
            {items?.map((p) => (
              <div key={p.id} className="rounded-lg border-2 border-primary/40 bg-card p-4 space-y-3 shadow-sm">
                <p className="font-medium text-base">{partnershipLabel(p)}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(p)}>
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={() => setDeleteTarget(p)}
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
            <DialogTitle>{editing ? "Edit partnership" : "Add partnership"}</DialogTitle>
            <DialogDescription>Add or edit a partnership you upload on behalf of.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm font-medium">Leader</p>
                <FormField
                  control={form.control}
                  name="leader_first_name"
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
                  name="leader_last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">Follower</p>
                <FormField
                  control={form.control}
                  name="follower_first_name"
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
                  name="follower_last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isFormSubmitting}>
                  {isFormSubmitting ? "Saving..." : editing ? "Save changes" : "Add partnership"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove partnership?</DialogTitle>
            <DialogDescription>Remove this managed partnership from your list.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget ? partnershipLabel(deleteTarget) : null} will be removed from your list.
          </p>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? "Removing..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
