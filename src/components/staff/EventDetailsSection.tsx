import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { call, endpoints } from "@/api/endpoints";
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

/**
 * Edit or delete the event: PATCH and DELETE /v1/events/:id, as the admin
 * Events page sends them, for this event only. Creating events stays with
 * the admins.
 */
export default function EventDetailsSection({
  event,
  onUpdated,
}: {
  event: ApiEvent;
  onUpdated: (next: ApiEvent) => void;
}) {
  const api = useApiClient();
  const navigate = useNavigate();
  const [name, setName] = useState(event.name);
  const [startDate, setStartDate] = useState(event.start_date);
  const [endDate, setEndDate] = useState(event.end_date);
  const [seasonYear, setSeasonYear] = useState(event.season_year);
  const [timezone, setTimezone] = useState(event.timezone);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!startDate) { toast.error("Start date is required"); return; }
    if (!endDate) { toast.error("End date is required"); return; }
    if (endDate < startDate) { toast.error("End date must be on or after start date"); return; }
    const season = seasonYear.trim();
    if (season && !/^\d{4}$/.test(season)) { toast.error("Season year must be four digits"); return; }
    setSaving(true);
    try {
      const updated = await call(api, endpoints.events.update, {
        params: { id: event.id },
        body: {
          name: name.trim(),
          start_date: startDate,
          end_date: endDate,
          timezone,
          season_year: season || undefined,
        },
      });
      onUpdated(updated);
      toast.success("Event updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await call(api, endpoints.events.remove, { params: { id: event.id } });
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
          <form onSubmit={(e) => void save(e)} className="space-y-4 max-w-lg">
            <div>
              <label htmlFor="ev-name" className={FIELD_LABEL_CLASS}>Name</label>
              <input id="ev-name" className={FIELD_INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ev-start" className={FIELD_LABEL_CLASS}>Start date</label>
                <input id="ev-start" type="date" className={FIELD_INPUT_CLASS} value={startDate}
                  onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ev-end" className={FIELD_LABEL_CLASS}>End date</label>
                <input id="ev-end" type="date" className={FIELD_INPUT_CLASS} value={endDate}
                  onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ev-season" className={FIELD_LABEL_CLASS}>Season year</label>
                <input id="ev-season" inputMode="numeric" className={FIELD_INPUT_CLASS} value={seasonYear}
                  onChange={(e) => setSeasonYear(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ev-tz" className={FIELD_LABEL_CLASS}>Timezone</label>
                <input id="ev-tz" className={FIELD_INPUT_CLASS} value={timezone}
                  onChange={(e) => setTimezone(e.target.value)} />
              </div>
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
