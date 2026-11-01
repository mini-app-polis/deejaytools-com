import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { type ApiEvent } from "@/schemas";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { CLICKABLE_ROW_CLASS, ROW_LINK_CLASS } from "@/lib/clickable";
import { toastFirstError } from "@/lib/formErrors";
import { seasonYearFromDateString } from "@/lib/seasonYear";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import { formatTimezoneAbbr } from "@/lib/sessionFormat";
import { compareEventChrono } from "@/lib/chronoSort";
import { eventStatusBadge, FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "@/components/admin/adminShared";

/** The event dialog, checked in the order it reads; only the first problem is reported. */
const eventFormSchema = z
  .object({
    name: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    seasonYear: z.string(),
    timezone: z.string(),
  })
  .superRefine((v, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (!v.name.trim()) return fail("name", "Name is required");
    if (!v.startDate) return fail("startDate", "Start date is required");
    if (!v.endDate) return fail("endDate", "End date is required");
    if (v.endDate < v.startDate) return fail("endDate", "End date must be on or after start date");
    const season = v.seasonYear.trim();
    if (season && !/^\d{4}$/.test(season)) fail("seasonYear", "Season year must be four digits");
  });
type EventForm = z.infer<typeof eventFormSchema>;

const EMPTY_EVENT: EventForm = { name: "", startDate: "", endDate: "", seasonYear: "", timezone: "America/Chicago" };

/**
 * The admin Events section: events bucketed by status, with create, edit
 * and delete. It renders its own TabsContent so it stays mounted while
 * another admin section is shown, keeping its toggles and dialogs as they
 * were when the admin comes back.
 */
export default function AdminEventsSection() {
  const navigate = useNavigate();
  const [evDialogOpen, setEvDialogOpen] = useState(false);
  const {
    register: evRegister,
    handleSubmit: evValidate,
    reset: evReset,
    getValues: evGetValues,
    setValue: evSetValue,
    watch: evWatch,
    formState: { isSubmitting: evSubmitting },
  } = useForm<EventForm>({ resolver: zodResolver(eventFormSchema), defaultValues: EMPTY_EVENT });
  const evStartDate = evWatch("startDate");
  /** True once the admin has typed in the season year field — blocks auto-suggest. */
  const [evSeasonTouched, setEvSeasonTouched] = useState(false);
  /**
   * When set, the Event dialog is in edit mode: submitting calls PATCH on
   * this id instead of POST. Cleared when the dialog closes.
   */
  const [evEditId, setEvEditId] = useState<string | null>(null);
  const [showEventsCompleted, setShowEventsCompleted] = useState(false);
  /** Delete-confirmation dialog state. */
  const [pendingDeleteEventId, setPendingDeleteEventId] = useState<string | null>(null);

  const eventsQuery = useEndpointQuery(endpoints.events.list);
  const events = eventsQuery.data ?? null;
  const loadingEvents = eventsQuery.isFetching;

  const createEvent = useEndpointMutation(endpoints.events.create, { invalidates: [endpoints.events.list] });
  // The nav bar lists the caller's staff events by name, from their record.
  const updateEvent = useEndpointMutation(endpoints.events.update, {
    invalidates: [endpoints.events.list, endpoints.sessions.list, endpoints.auth.me],
  });
  const removeEvent = useEndpointMutation(endpoints.events.remove, {
    invalidates: [endpoints.events.list, endpoints.sessions.list, endpoints.auth.me],
  });

  // ── Event CRUD ──────────────────────────────────────────────────────────────

  const deleteEvent = (id: string) => {
    setPendingDeleteEventId(id);
  };

  const confirmDeleteEvent = async () => {
    if (!pendingDeleteEventId) return;
    const id = pendingDeleteEventId;
    setPendingDeleteEventId(null);
    try {
      await removeEvent.mutateAsync({ params: { id } });
      toast.success("Event deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const openEvDialog = () => {
    setEvEditId(null);
    evReset(EMPTY_EVENT);
    setEvSeasonTouched(false);
    setEvDialogOpen(true);
  };

  const openEvEditDialog = (ev: ApiEvent) => {
    setEvEditId(ev.id);
    evReset({
      name: ev.name,
      startDate: ev.start_date,
      endDate: ev.end_date,
      seasonYear: ev.season_year,
      timezone: ev.timezone,
    });
    setEvSeasonTouched(true);
    setEvDialogOpen(true);
  };

  const submitEventDialog = async (v: EventForm) => {
    const evName = v.name;
    const evStartDate = v.startDate;
    const evEndDate = v.endDate;
    const evTimezone = v.timezone;
    const trimmedSeason = v.seasonYear.trim();
    try {
      if (evEditId) {
        // Edit mode — PATCH the existing event; the lists refetch.
        await updateEvent.mutateAsync({ params: { id: evEditId }, body: {
          name: evName.trim(),
          start_date: evStartDate,
          end_date: evEndDate,
          timezone: evTimezone,
          season_year: trimmedSeason || undefined,
        } });
        toast.success("Event updated");
      } else {
        // Create mode — POST; the list refetches.
        await createEvent.mutateAsync({ body: {
          name: evName.trim(),
          start_date: evStartDate,
          end_date: evEndDate,
          timezone: evTimezone,
          season_year: trimmedSeason || undefined,
        } });
        toast.success("Event created");
      }
      setEvDialogOpen(false);
      setEvEditId(null);
      evReset(EMPTY_EVENT);
      setEvSeasonTouched(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save event");
    }
  };

  const eventBuckets = useMemo(() => {
    const list = (events ?? []).slice().sort(compareEventChrono);
    return {
      active: list.filter((e) => e.status === "active"),
      upcoming: list.filter((e) => e.status === "upcoming"),
      completed: list.filter((e) => e.status === "completed"),
    };
  }, [events]);

  const renderEventRow = (ev: ApiEvent) => (
    <TableRow
      key={ev.id}
      className={CLICKABLE_ROW_CLASS}
      onClick={() => navigate(`/events/${ev.id}`)}
    >
      <TableCell className="font-medium">
        <Link
          to={`/events/${ev.id}`}
          className={ROW_LINK_CLASS}
          onClick={(e) => e.stopPropagation()}
        >
          {ev.name}
        </Link>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {ev.start_date}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {ev.end_date}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {ev.season_year}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        <Badge variant="outline" className="text-xs font-normal">
          {formatTimezoneAbbr(ev.timezone)}
        </Badge>
        <span className="ml-1.5 text-xs">{ev.timezone}</span>
      </TableCell>
      <TableCell>{eventStatusBadge(ev.status)}</TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openEvEditDialog(ev)}>
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => deleteEvent(ev.id)}>
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  const renderEventBox = (title: string, rows: ApiEvent[]) => (
    <section className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">None.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Start date</TableHead>
              <TableHead>End date</TableHead>
              <TableHead>Season</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{rows.map((ev) => renderEventRow(ev))}</TableBody>
        </Table>
      )}
    </section>
  );

  return (
    <>
      <TabsContent value="events" className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={openEvDialog} className="w-full sm:w-auto">
            New Event
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showEventsCompleted}
              onChange={(e) => setShowEventsCompleted(e.target.checked)}
            />
            Show completed
          </label>
        </div>
        {eventsQuery.error && !events ? (
          <QueryError what="events" error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()} />
        ) : loadingEvents && !events ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className={`space-y-4${loadingEvents ? " opacity-60" : ""}`}>
            {renderEventBox("Active", eventBuckets.active)}
            {renderEventBox("Upcoming", eventBuckets.upcoming)}
            {showEventsCompleted && renderEventBox("Completed", eventBuckets.completed)}
          </div>
        )}
      </TabsContent>

      {/* ── Delete Event confirmation dialog ── */}
      <Dialog open={!!pendingDeleteEventId} onOpenChange={(open: boolean) => { if (!open) setPendingDeleteEventId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this event?</DialogTitle>
            <DialogDescription>
              {pendingDeleteEventId
                ? (() => {
                    const ev = events?.find((e) => e.id === pendingDeleteEventId);
                    return ev
                      ? <>This will permanently delete <span className="font-medium">{ev.name}</span>. This cannot be undone.</>
                      : "This will permanently delete the event. This cannot be undone.";
                  })()
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteEventId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteEvent()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Event dialog ── */}
      {evDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setEvDialogOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ev-dialog-title"
            className="rounded-t-2xl sm:rounded-lg border bg-background p-6 shadow-lg w-full sm:max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center -mt-2 mb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between">
              <h2 id="ev-dialog-title" className="text-lg font-semibold">{evEditId ? "Edit event" : "New event"}</h2>
              <Button type="button" variant="ghost" size="sm" aria-label="Close" onClick={() => setEvDialogOpen(false)}>✕</Button>
            </div>
            <form onSubmit={(e) => void evValidate(submitEventDialog, toastFirstError)(e)} className="space-y-4">
              <div>
                <label htmlFor="ev-name" className={FIELD_LABEL_CLASS}>Name</label>
                <input id="ev-name"
                  className={FIELD_INPUT_CLASS}
                  {...evRegister("name")}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ev-start-date" className={FIELD_LABEL_CLASS}>Start date</label>
                  <input id="ev-start-date"
                    type="date"
                    className={FIELD_INPUT_CLASS}
                    {...evRegister("startDate", {
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        const v = e.target.value;
                        const evEndDate = evGetValues("endDate");
                        if (evEndDate && v > evEndDate) evSetValue("endDate", v);
                        if (!evEditId && !evSeasonTouched && v) {
                          evSetValue("seasonYear", seasonYearFromDateString(v));
                        }
                      },
                    })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="ev-end-date" className={FIELD_LABEL_CLASS}>End date</label>
                  <input id="ev-end-date"
                    type="date"
                    className={FIELD_INPUT_CLASS}
                    min={evStartDate || undefined}
                    {...evRegister("endDate")}
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="ev-season-year" className={FIELD_LABEL_CLASS}>Season year</label>
                <input id="ev-season-year"
                  className={FIELD_INPUT_CLASS}
                  inputMode="numeric"
                  pattern="\d{4}"
                  placeholder="2027"
                  {...evRegister("seasonYear", { onChange: () => setEvSeasonTouched(true) })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Defaults from the start date — seasons roll over October 1.
                </p>
              </div>
              <div>
                <label htmlFor="ev-timezone" className={FIELD_LABEL_CLASS}>Timezone</label>
                <select id="ev-timezone"
                  className={FIELD_INPUT_CLASS}
                  {...evRegister("timezone")}
                >
                  <optgroup label="United States">
                    <option value="America/New_York">Eastern — New York / Miami</option>
                    <option value="America/Chicago">Central — Chicago / Dallas</option>
                    <option value="America/Denver">Mountain — Denver / Salt Lake City</option>
                    <option value="America/Phoenix">Mountain (no DST) — Phoenix</option>
                    <option value="America/Los_Angeles">Pacific — Los Angeles / Seattle</option>
                    <option value="America/Anchorage">Alaska — Anchorage</option>
                    <option value="Pacific/Honolulu">Hawaii — Honolulu</option>
                  </optgroup>
                  <optgroup label="Canada">
                    <option value="America/Toronto">Eastern — Toronto</option>
                    <option value="America/Winnipeg">Central — Winnipeg</option>
                    <option value="America/Edmonton">Mountain — Edmonton</option>
                    <option value="America/Vancouver">Pacific — Vancouver</option>
                  </optgroup>
                  <optgroup label="Europe">
                    <option value="Europe/London">London / Dublin</option>
                    <option value="Europe/Paris">Central European — Paris / Berlin</option>
                    <option value="Europe/Helsinki">Eastern European — Helsinki / Kyiv</option>
                  </optgroup>
                  <optgroup label="Asia / Pacific">
                    <option value="Asia/Tokyo">Tokyo / Osaka</option>
                    <option value="Asia/Seoul">Seoul</option>
                    <option value="Asia/Shanghai">Shanghai / Beijing</option>
                    <option value="Asia/Singapore">Singapore / Kuala Lumpur</option>
                    <option value="Australia/Sydney">Sydney / Melbourne</option>
                    <option value="Pacific/Auckland">Auckland</option>
                  </optgroup>
                </select>
              </div>
              <Button type="submit" disabled={evSubmitting} size="lg" className="w-full">
                {evSubmitting
                  ? evEditId ? "Saving…" : "Creating…"
                  : evEditId ? "Save changes" : "Create event"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
