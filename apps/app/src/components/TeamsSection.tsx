import { createTeamBodySchema, type ApiTeam } from "@deejaytools/schemas";
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

type TeamForm = z.infer<typeof createTeamBodySchema>;

export default function TeamsSection() {
  const api = useApiClient();

  const [teams, setTeams] = useState<ApiTeam[] | null>(null);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiTeam | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiTeam | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  const form = useForm<TeamForm>({
    resolver: zodResolver(createTeamBodySchema),
    defaultValues: { identifier: "" },
  });

  const loadTeams = () => {
    setTeamsLoading(true);
    api
      .get<ApiTeam[]>("/v1/teams")
      .then(setTeams)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setTeamsLoading(false));
  };

  useEffect(() => {
    loadTeams();
  }, [api]);

  const openCreate = () => {
    setEditing(null);
    form.reset({ identifier: "" });
    setFormOpen(true);
  };

  const openEdit = (t: ApiTeam) => {
    setEditing(t);
    form.reset({ identifier: t.identifier });
    setFormOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setIsFormSubmitting(true);
    try {
      if (editing) {
        const updated = await api.patch<ApiTeam>(`/v1/teams/${editing.id}`, {
          identifier: values.identifier,
        });
        toast.success("Team updated");
        setTeams((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
      } else {
        const created = await api.post<ApiTeam>("/v1/teams", {
          identifier: values.identifier,
        });
        toast.success("Team added");
        setTeams((prev) => (prev ? [created, ...prev] : [created]));
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
      await api.del(`/v1/teams/${deleteTarget.id}`);
      setTeams((prev) => prev?.filter((t) => t.id !== deleteTarget.id) ?? null);
      setDeleteTarget(null);
      toast.success("Team removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete team.");
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <h2 className="font-semibold">Teams</h2>
          </div>
          <Button size="sm" onClick={openCreate}>Add team</Button>
        </div>
        <div className="p-4 space-y-4">
          <div className={`space-y-2${teamsLoading ? " opacity-60" : ""}`}>
            {teamsLoading && !teams && <Skeleton className="h-40 w-full" />}
            {teams?.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No teams yet.</p>
            )}
            {teams?.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <p className="font-medium truncate">{t.identifier}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(t)}>
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
            <DialogTitle>{editing ? "Edit team" : "Add team"}</DialogTitle>
            <DialogDescription>Add or edit a team name.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={isFormSubmitting}>
                  {isFormSubmitting ? "Saving..." : editing ? "Save changes" : "Add team"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove team?</DialogTitle>
            <DialogDescription>Remove this team from your list.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteTarget?.identifier} will be removed from your list.
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
