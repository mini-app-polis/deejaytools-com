import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation } from "@/api/queries";
import { toastFirstError } from "@/lib/formErrors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApiEvent } from "@/schemas";

const FIELD_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

const eventDetailsSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    timezone: z.string(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "End date must be on or after start date",
  });
type EventDetailsForm = z.input<typeof eventDetailsSchema>;
type EventDetailsValues = z.output<typeof eventDetailsSchema>;

/**
 * Edit or delete the event: PATCH and DELETE /v1/events/:id, as the admin
 * Events page sends them, for this event only. Creating events and setting
 * the season year stay with the admins: the season year is not shown to
 * event staff, and the PATCH leaves it as it is.
 */
export default function EventDetailsSection({
  event,
  onUpdated,
}: {
  event: ApiEvent;
  onUpdated: (next: ApiEvent) => void;
}) {
  const navigate = useNavigate();
  // Event names and timezones show on the event and session lists too, and
  // the nav bar lists the caller's staff events by name, from their record.
  const updateEvent = useEndpointMutation(endpoints.events.update, {
    invalidates: [endpoints.events.list, endpoints.sessions.list, endpoints.auth.me],
  });
  const removeEvent = useEndpointMutation(endpoints.events.remove, {
    invalidates: [endpoints.events.list, endpoints.sessions.list, endpoints.auth.me],
  });
  const {
    register,
    handleSubmit,
    formState: { isSubmitting: saving },
  } = useForm<EventDetailsForm, unknown, EventDetailsValues>({
    resolver: zodResolver(eventDetailsSchema),
    defaultValues: {
      name: event.name,
      startDate: event.start_date,
      endDate: event.end_date,
      timezone: event.timezone,
    },
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async ({ name, startDate, endDate, timezone }: EventDetailsValues) => {
    try {
      const updated = await updateEvent.mutateAsync({
        params: { id: event.id },
        body: {
          name,
          start_date: startDate,
          end_date: endDate,
          timezone,
        },
      });
      onUpdated(updated);
      toast.success("Event updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save event");
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await removeEvent.mutateAsync({ params: { id: event.id } });
      toast.success("Event deleted");
      navigate("/my-events", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Event details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleSubmit(save, toastFirstError)(e)} className="space-y-4 max-w-lg">
            <div>
              <label htmlFor="ev-name" className={FIELD_LABEL_CLASS}>Name</label>
              <input id="ev-name" className={FIELD_INPUT_CLASS} {...register("name")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ev-start" className={FIELD_LABEL_CLASS}>Start date</label>
                <input id="ev-start" type="date" className={FIELD_INPUT_CLASS} {...register("startDate")} />
              </div>
              <div>
                <label htmlFor="ev-end" className={FIELD_LABEL_CLASS}>End date</label>
                <input id="ev-end" type="date" className={FIELD_INPUT_CLASS} {...register("endDate")} />
              </div>
            </div>
            <div>
              <label htmlFor="ev-tz" className={FIELD_LABEL_CLASS}>Timezone</label>
              <input id="ev-tz" className={FIELD_INPUT_CLASS} {...register("timezone")} />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Delete event</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Deletes the event with its sessions, check-ins, queues, run history, submissions and staff.
          </p>
          <Button variant="destructive" disabled={deleting} onClick={() => setConfirmDelete(true)}>
            {deleting ? "Deleting…" : "Delete event"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={(open: boolean) => { if (!open) setConfirmDelete(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this event?</DialogTitle>
            <DialogDescription>
              This will permanently delete <span className="font-medium">{event.name}</span>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void remove()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
