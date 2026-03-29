import { zodResolver } from "@hookform/resolvers/zod";
import { DivisionSchema } from "@deejaytools/ts-utils";
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

type SongRow = {
  id: string;
  display_name: string | null;
  division: string | null;
  routine_name: string | null;
  personal_descriptor: string | null;
  season_year: string | null;
  partner_first_name?: string | null;
  partner_last_name?: string | null;
  partner_id: string | null;
};

type PartnerRow = {
  id: string;
  first_name: string;
  last_name: string;
};

const songSchema = z.object({
  display_name: z.string().min(1),
  division: DivisionSchema,
  routine_name: z.string().optional(),
  personal_descriptor: z.string().optional(),
  season_year: z.string().optional(),
  partner_id: z.string().optional(),
});

type SongForm = z.infer<typeof songSchema>;

function partnerLabel(p: PartnerRow) {
  return `${p.first_name} ${p.last_name}`.trim();
}

export default function SongsPage() {
  const api = useApiClient();
  const [songs, setSongs] = useState<SongRow[] | null>(null);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SongRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SongRow | null>(null);

  const form = useForm<SongForm>({
    resolver: zodResolver(songSchema),
    defaultValues: {
      display_name: "",
      division: "Other",
      routine_name: "",
      personal_descriptor: "",
      season_year: "",
      partner_id: "",
    },
  });

  const load = () => {
    setLoading(true);
    Promise.all([api.get<SongRow[]>("/v1/songs"), api.get<PartnerRow[]>("/v1/partners")])
      .then(([s, p]) => {
        setSongs(s);
        setPartners(p);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api]);

  const openCreate = () => {
    setEditing(null);
    form.reset({
      display_name: "",
      division: "Other",
      routine_name: "",
      personal_descriptor: "",
      season_year: "",
      partner_id: "",
    });
    setFormOpen(true);
  };

  const openEdit = (song: SongRow) => {
    setEditing(song);
    const div = DivisionSchema.safeParse(song.division ?? "Other");
    form.reset({
      display_name: song.display_name ?? "",
      division: div.success ? div.data : "Other",
      routine_name: song.routine_name ?? "",
      personal_descriptor: song.personal_descriptor ?? "",
      season_year: song.season_year ?? "",
      partner_id: song.partner_id ?? "",
    });
    setFormOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        const updated = await api.patch<SongRow>(`/v1/songs/${editing.id}`, {
          display_name: values.display_name.trim(),
          division: values.division,
          routine_name: values.routine_name?.trim() || null,
          personal_descriptor: values.personal_descriptor?.trim() || null,
          season_year: values.season_year?.trim() || null,
          partner_id:
            values.partner_id && values.partner_id !== "none" && values.partner_id !== ""
              ? values.partner_id
              : null,
        });
        toast.success("Song updated");
        setSongs((prev) => prev?.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)) ?? null);
      } else {
        const created = await api.post<SongRow>("/v1/songs", {
          display_name: values.display_name.trim(),
          division: values.division,
          routine_name: values.routine_name?.trim() || undefined,
          personal_descriptor: values.personal_descriptor?.trim() || undefined,
          season_year: values.season_year?.trim() || undefined,
          ...(values.partner_id && values.partner_id !== "none"
            ? { partner_id: values.partner_id }
            : {}),
        });
        toast.success("Song created");
        setSongs((prev) => (prev ? [created, ...prev] : [created]));
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.del(`/v1/songs/${deleteTarget.id}`);
      toast.success("Song deleted");
      setSongs((prev) => prev?.filter((x) => x.id !== deleteTarget.id) ?? null);
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (loading && !songs) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Audio upload coming soon</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Songs</h1>
        <Button onClick={openCreate}>Add song</Button>
      </div>

      <div className={loading ? "opacity-60" : ""}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display name</TableHead>
              <TableHead>Division</TableHead>
              <TableHead>Season / year</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {songs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No songs yet.
                </TableCell>
              </TableRow>
            )}
            {songs?.map((s) => {
              const pName =
                s.partner_first_name || s.partner_last_name
                  ? `${s.partner_first_name ?? ""} ${s.partner_last_name ?? ""}`.trim()
                  : "—";
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.display_name ?? "—"}</TableCell>
                  <TableCell>{s.division ?? "—"}</TableCell>
                  <TableCell>{s.season_year ?? "—"}</TableCell>
                  <TableCell>{pName}</TableCell>
                  <TableCell className="space-x-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(s)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit song" : "Add song"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="division"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Division</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DivisionSchema.options.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="routine_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Routine name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="personal_descriptor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personal descriptor</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="season_year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Season year</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="partner_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partner (optional)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                      value={field.value && field.value !== "" ? field.value : "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {partners.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {partnerLabel(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
            <DialogTitle>Delete song?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget?.display_name ?? "This song"} will be permanently deleted.
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
