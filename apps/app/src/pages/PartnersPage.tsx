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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PartnerRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
};

const partnerSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z
    .string()
    .optional()
    .refine((s) => s === undefined || s === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), {
      message: "Invalid email",
    }),
});

type PartnerForm = z.infer<typeof partnerSchema>;

export default function PartnersPage() {
  const api = useApiClient();
  const [partners, setPartners] = useState<PartnerRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PartnerRow | null>(null);

  const form = useForm<PartnerForm>({
    resolver: zodResolver(partnerSchema),
    defaultValues: { first_name: "", last_name: "", email: "" },
  });

  const load = () => {
    setLoading(true);
    api
      .get<PartnerRow[]>("/v1/partners")
      .then(setPartners)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api]);

  const openCreate = () => {
    setEditing(null);
    form.reset({ first_name: "", last_name: "", email: "" });
    setFormOpen(true);
  };

  const openEdit = (p: PartnerRow) => {
    setEditing(p);
    form.reset({
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email ?? "",
    });
    setFormOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        const updated = await api.patch<PartnerRow>(`/v1/partners/${editing.id}`, {
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim(),
          email: values.email?.trim() ? values.email.trim() : null,
        });
        toast.success("Partner updated");
        setPartners((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
      } else {
        const created = await api.post<PartnerRow>("/v1/partners", {
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim(),
          ...(values.email?.trim() ? { email: values.email.trim() } : {}),
        });
        toast.success("Partner added");
        setPartners((prev) => (prev ? [created, ...prev] : [created]));
      }
      setFormOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/v1/partners/${deleteTarget.id}`);
      toast.success("Partner removed");
      setPartners((prev) => prev?.filter((x) => x.id !== deleteTarget.id) ?? null);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (loading && !partners) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Partners</h1>
        <Button onClick={openCreate}>Add partner</Button>
      </div>

      <div className={loading ? "opacity-60" : ""}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No partners yet.
                </TableCell>
              </TableRow>
            )}
            {partners?.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.first_name} {p.last_name}
                </TableCell>
                <TableCell>{p.email ?? "—"}</TableCell>
                <TableCell className="space-x-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(p)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove partner?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget?.first_name} {deleteTarget?.last_name} will be removed from your list.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
