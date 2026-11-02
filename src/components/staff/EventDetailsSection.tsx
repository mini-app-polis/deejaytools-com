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
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import type { ApiEvent } from "@/schemas";
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "@/lib/formFields";

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
  const form = useForm<EventDetailsForm, unknown, EventDetailsValues>({
    resolver: zodResolver(eventDetailsSchema),
    defaultValues: {
      name: event.name,
      startDate: event.start_date,
      endDate: event.end_date,
      timezone: event.timezone,
    },
  });
  const {
    handleSubmit,
    formState: { isSubmitting: saving },
  } = form;
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
          <Form {...form}>
            <form onSubmit={(e) => void handleSubmit(save, toastFirstError)(e)} className="space-y-4 max-w-lg">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <label htmlFor="ev-name" className={FIELD_LABEL_CLASS}>Name</label>
                    <FormControl>
                      <input id="ev-name" className={FIELD_INPUT_CLASS} {...field} />
                    </FormControl>
                    <FormMessage className="mt-1" />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <label htmlFor="ev-start" className={FIELD_LABEL_CLASS}>Start date</label>
                      <FormControl>
                        <input id="ev-start" type="date" className={FIELD_INPUT_CLASS} {...field} />
                      </FormControl>
                      <FormMessage className="mt-1" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <label htmlFor="ev-end" className={FIELD_LABEL_CLASS}>End date</label>
                      <FormControl>
                        <input id="ev-end" type="date" className={FIELD_INPUT_CLASS} {...field} />
                      </FormControl>
                      <FormMessage className="mt-1" />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <label htmlFor="ev-tz" className={FIELD_LABEL_CLASS}>Timezone</label>
                    <FormControl>
                      <input id="ev-tz" className={FIELD_INPUT_CLASS} {...field} />
                    </FormControl>
                    <FormMessage className="mt-1" />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </Form>
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
