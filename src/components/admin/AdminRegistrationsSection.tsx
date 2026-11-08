import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { useDivisions } from "@/hooks/useDivisions";
import {
  NEEDS_ATTENTION,
  parseRegistrationPaste,
  reconcileRegistrations,
  registrationLines,
  registrationName,
  sameLabel,
  type ReconciledRegistration,
  type RegistrationStatus,
} from "@/lib/eventRegistrations";
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "@/lib/formFields";
import { classicRoundLabel } from "@/lib/submissionRounds";
import { cn } from "@/lib/utils";
import { isOpenEvent, type ApiAdminEventSongSubmission, type ApiEvent } from "@/schemas";

const NO_EVENTS: readonly ApiEvent[] = [];
const NO_LINK = "__none__";

type Filter = "attention" | "all" | RegistrationStatus;

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  missing: "Missing",
  possible: "Possible match",
  "missing-round": "Missing a round",
  submitted: "Submitted",
  handled: "Handled",
  scratched: "Scratched",
};

const STATUS_ORDER: readonly RegistrationStatus[] = ["missing", "possible", "missing-round", "submitted", "handled", "scratched"];

function statusBadge(r: ReconciledRegistration) {
  const label =
    r.status === "missing-round" && r.missingRound
      ? `Missing ${r.missingRound}`
      : STATUS_LABELS[r.status];
  switch (r.status) {
    case "missing":
      return <Badge variant="destructive">{label}</Badge>;
    case "possible":
    case "missing-round":
      return <Badge variant="outline" className="border-amber-400 text-amber-300">{label}</Badge>;
    case "submitted":
      return <Badge variant="default">{label}</Badge>;
    default:
      return <Badge variant="secondary">{label}</Badge>;
  }
}

/** The event to open on: the soonest one not yet over, else the latest. */
function defaultEventId(events: readonly ApiEvent[]): string {
  const live = events.filter((e) => e.status !== "completed").sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (live.length > 0) return live[0].id;
  const past = [...events].sort((a, b) => b.start_date.localeCompare(a.start_date));
  return past[0]?.id ?? "";
}

function submissionLine(s: ApiAdminEventSongSubmission, roundsSplit: boolean): string {
  const round = classicRoundLabel(s, roundsSplit);
  return [s.song_label, round ? `(${round})` : null].filter(Boolean).join(" ");
}

/**
 * The admin Registrations section: an event's registration list, pasted in
 * from the event's own export, against the songs submitted to it, so the
 * admin sees who is still missing music. Optional per event. Matching is by
 * name; an entry the match misses can be linked to a submission by hand or
 * marked as handled elsewhere or scratched (withdrawn from competing: their songs
 * stay submitted, hidden from the event page), and those marks survive a
 * re-import. It
 * renders its own TabsContent so it stays mounted while another admin
 * section is shown; `open` holds its queries back until it is.
 */
export default function AdminRegistrationsSection({ open }: { open: boolean }) {
  const eventsQuery = useEndpointQuery(endpoints.events.list, { enabled: open });
  const events = eventsQuery.data ?? NO_EVENTS;
  const [eventId, setEventId] = useState("");
  useEffect(() => {
    if (!eventId && events.length > 0) setEventId(defaultEventId(events));
  }, [eventId, events]);
  const event = events.find((e) => e.id === eventId) ?? null;
  const roundsSplit = isOpenEvent(event?.name);

  const ready = open && !!eventId;
  const registrationsQuery = useEndpointQuery(endpoints.admin.eventRegistrations, {
    params: { eventId },
    enabled: ready,
  });
  const submissionsQuery = useEndpointQuery(endpoints.admin.eventSongSubmissions, {
    params: { eventId },
    enabled: ready,
  });
  const { divisions } = useDivisions();

  const registrations = registrationsQuery.data ?? null;
  const submissions = submissionsQuery.data ?? null;
  const reconciled = useMemo(
    () =>
      registrations && submissions
        ? reconcileRegistrations(registrations, submissions, divisions, roundsSplit)
        : null,
    [registrations, submissions, divisions, roundsSplit]
  );

  const [filter, setFilter] = useState<Filter>("attention");
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<ReconciledRegistration | null>(null);

  const counts = useMemo(() => {
    const c: Record<RegistrationStatus, number> = {
      missing: 0,
      possible: 0,
      "missing-round": 0,
      submitted: 0,
      handled: 0,
      scratched: 0,
    };
    for (const r of reconciled?.rows ?? []) c[r.status]++;
    return c;
  }, [reconciled]);
  const attention = NEEDS_ATTENTION.reduce((n, s) => n + counts[s], 0);

  const visible = useMemo(() => {
    const rows = reconciled?.rows ?? [];
    if (filter === "all") return rows;
    if (filter === "attention") return rows.filter((r) => NEEDS_ATTENTION.includes(r.status));
    return rows.filter((r) => r.status === filter);
  }, [reconciled, filter]);

  // Grouped under the registration's own division names, in list order.
  const groups = useMemo(() => {
    const all = new Map<string, ReconciledRegistration[]>();
    for (const r of reconciled?.rows ?? []) {
      const list = all.get(r.entry.division) ?? [];
      list.push(r);
      all.set(r.entry.division, list);
    }
    const shown = new Set(visible.map((r) => r.entry.id));
    return [...all.entries()]
      .map(([division, rows]) => ({
        division,
        total: rows.length,
        attention: rows.filter((r) => NEEDS_ATTENTION.includes(r.status)).length,
        rows: rows.filter((r) => shown.has(r.entry.id)),
      }))
      .filter((g) => g.rows.length > 0);
  }, [reconciled, visible]);

  const copyVisible = async () => {
    try {
      await navigator.clipboard.writeText(registrationLines(visible));
      toast.success(`Copied ${visible.length} entr${visible.length === 1 ? "y" : "ies"}`);
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  };

  const loadError = registrationsQuery.error ?? submissionsQuery.error;

  return (
    <TabsContent value="registrations" className="mt-4 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end flex-wrap">
        <div className="w-full sm:w-80 space-y-1">
          <Label htmlFor="admin-registrations-event">Event</Label>
          <Select value={eventId || undefined} onValueChange={(v) => { setEventId(v); setFilter("attention"); }}>
            <SelectTrigger id="admin-registrations-event">
              <SelectValue placeholder={eventsQuery.isLoading ? "Loading events…" : "Select an event"} />
            </SelectTrigger>
            <SelectContent>
              {[...events]
                .sort((a, b) => b.start_date.localeCompare(a.start_date))
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} · {e.start_date}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!event} onClick={() => setImporting(true)}>
            {registrations && registrations.length > 0 ? "Re-import list" : "Import list"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!ready || registrationsQuery.isFetching || submissionsQuery.isFetching}
            onClick={() => {
              void registrationsQuery.refetch();
              void submissionsQuery.refetch();
            }}
          >
            {registrationsQuery.isFetching || submissionsQuery.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {eventsQuery.error && events.length === 0 ? (
        <QueryError what="the events" error={eventsQuery.error} onRetry={() => void eventsQuery.refetch()} />
      ) : !event ? (
        eventsQuery.isLoading ? <Skeleton className="h-32 w-full" /> : <p className="text-sm text-muted-foreground">No events yet.</p>
      ) : loadError && !reconciled ? (
        <QueryError
          what="the registrations"
          error={loadError}
          onRetry={() => {
            void registrationsQuery.refetch();
            void submissionsQuery.refetch();
          }}
        />
      ) : !reconciled ? (
        <Skeleton className="h-32 w-full" />
      ) : reconciled.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No registration list for {event.name}. Import one to see who is missing music; events without one
          need nothing here.
        </p>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-semibold">{attention}</span> of {reconciled.rows.length} entries need attention ·{" "}
            {submissions?.length ?? 0} songs submitted
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ChoiceGroup<Filter>
              ariaLabel="Show"
              options={[
                { value: "attention", label: `Needs attention (${attention})` },
                ...STATUS_ORDER.map((s) => ({ value: s, label: `${STATUS_LABELS[s]} (${counts[s]})` })),
                { value: "all", label: `All (${reconciled.rows.length})` },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <Button variant="outline" size="sm" disabled={visible.length === 0} onClick={() => void copyVisible()}>
              Copy shown
            </Button>
          </div>

          {(filter === "attention" || filter === "all") && reconciled.unregistered.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                Submitted but not on the list{" "}
                <span className="text-xs font-normal normal-case">{reconciled.unregistered.length}</span>
              </h3>
              {reconciled.unregistered.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4 rounded-lg bg-white/[0.06] px-4 py-3 text-sm"
                >
                  <span className="font-medium min-w-0 truncate">{s.partnership_label}</span>
                  <span className="text-muted-foreground sm:text-right break-all">
                    {s.division ?? "No division"} · {submissionLine(s, roundsSplit)}
                  </span>
                </div>
              ))}
            </section>
          )}

          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to show for this filter.</p>
          ) : (
            groups.map((g) => (
              <section key={g.division} className="space-y-2">
                <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                  {g.division}{" "}
                  <span className="text-xs font-normal normal-case">
                    {g.attention} of {g.total} need attention
                  </span>
                </h3>
                {g.rows.map((r) => (
                  <div
                    key={r.entry.id}
                    className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 rounded-lg bg-white/[0.06] px-4 py-3 text-sm"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("font-medium", r.status === "scratched" && "line-through text-muted-foreground")}>
                          {registrationName(r.entry)}
                        </span>
                        {statusBadge(r)}
                        {r.entry.linked_label && <Badge variant="outline">Linked</Badge>}
                      </div>
                      {r.matches.map((s) => (
                        <p key={s.id} className="text-muted-foreground break-all">
                          {submissionLine(s, roundsSplit)}
                          {r.entry.hidden_submission_ids.includes(s.id) && (
                            <span className="block text-xs">Hidden from the event page</span>
                          )}
                        </p>
                      ))}
                      {r.status === "scratched" &&
                        r.matches.some((s) => !r.entry.hidden_submission_ids.includes(s.id)) && (
                          <p className="text-xs text-amber-300">
                            A song is still listed on the event page: open Edit and save to hide it.
                          </p>
                        )}
                      {r.candidates.length > 0 && (
                        <p className="text-muted-foreground break-all">
                          Looks like: {r.candidates.map((s) => `${s.partnership_label} (${s.division ?? "no division"})`).join("; ")}
                        </p>
                      )}
                      {r.entry.note && <p className="text-xs italic text-muted-foreground">{r.entry.note}</p>}
                      {!r.division && (
                        <p className="text-xs text-muted-foreground">Division not recognised: matched in any division.</p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                  </div>
                ))}
              </section>
            ))
          )}
        </>
      )}

      {importing && event && (
        <ImportDialog event={event} hasList={(registrations?.length ?? 0) > 0} onClose={() => setImporting(false)} />
      )}
      {editing && submissions && (
        <EditDialog row={editing} submissions={submissions} onClose={() => setEditing(null)} />
      )}
    </TabsContent>
  );
}

function ImportDialog({ event, hasList, onClose }: { event: ApiEvent; hasList: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseRegistrationPaste(text), [text]);
  const divisionCount = useMemo(() => new Set(parsed.entries.map((e) => e.division)).size, [parsed]);
  const importList = useEndpointMutation(endpoints.admin.importEventRegistrations, {
    invalidates: [endpoints.admin.eventRegistrations],
  });

  const submit = async () => {
    try {
      const rows = await importList.mutateAsync({ params: { eventId: event.id }, body: { entries: parsed.entries } });
      toast.success(`Imported ${rows.length} entries for ${event.name}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import registrations · {event.name}</DialogTitle>
          <DialogDescription>
            Copy the registration sheet&apos;s rows (with its header row, if it has one) and paste them here. Rows
            without a division and a first dancer are skipped; other columns are ignored.
            {hasList &&
              " This replaces the current list; entries that are unchanged keep their links, handled and scratched marks, and notes."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="admin-registrations-paste" className={FIELD_LABEL_CLASS}>
            Registration rows
          </label>
          <textarea
            id="admin-registrations-paste"
            className={cn(FIELD_INPUT_CLASS, "h-64 font-mono text-xs")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          <p className="text-sm text-muted-foreground">
            {parsed.entries.length} entr{parsed.entries.length === 1 ? "y" : "ies"} in {divisionCount} division
            {divisionCount === 1 ? "" : "s"}
            {parsed.skipped > 0 && ` · ${parsed.skipped} other line${parsed.skipped === 1 ? "" : "s"} skipped`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={parsed.entries.length === 0 || importList.isPending} onClick={() => void submit()}>
            {importList.isPending ? "Importing…" : `Import ${parsed.entries.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  row,
  submissions,
  onClose,
}: {
  row: ReconciledRegistration;
  submissions: readonly ApiAdminEventSongSubmission[];
  onClose: () => void;
}) {
  const [linked, setLinked] = useState(row.entry.linked_label ?? NO_LINK);
  const [handled, setHandled] = useState(row.entry.handled);
  const [scratched, setScratched] = useState(row.entry.scratched);
  const [note, setNote] = useState(row.entry.note ?? "");
  const update = useEndpointMutation(endpoints.admin.updateEventRegistration, {
    invalidates: [endpoints.admin.eventRegistrations],
  });

  // Each partnership once, the entry's look-alikes first.
  const labels = useMemo(() => {
    const byLabel = new Map<string, Set<string>>();
    for (const s of submissions) {
      const set = byLabel.get(s.partnership_label) ?? new Set<string>();
      set.add(s.division ?? "no division");
      byLabel.set(s.partnership_label, set);
    }
    const first = new Set(row.candidates.map((s) => s.partnership_label));
    if (row.entry.linked_label) first.add(row.entry.linked_label);
    return [...byLabel.entries()]
      .map(([label, divs]) => ({ label, divisions: [...divs].join(", "), first: first.has(label) }))
      .sort((a, b) => Number(b.first) - Number(a.first) || a.label.localeCompare(b.label));
  }, [submissions, row]);
  // A link to a label no submission carries any more still shows, so it can be cleared.
  const staleLink = row.entry.linked_label && !labels.some((l) => l.label === row.entry.linked_label);

  // The songs a scratch hides: the chosen link's, else what the name match found.
  const hideIds = () => {
    if (linked !== NO_LINK) return submissions.filter((s) => sameLabel(s.partnership_label, linked)).map((s) => s.id);
    return row.entry.linked_label ? [] : row.matches.map((s) => s.id);
  };

  const save = async () => {
    try {
      await update.mutateAsync({
        params: { id: row.entry.id },
        body: {
          linked_label: linked === NO_LINK ? null : linked,
          handled,
          note: note.trim() || null,
          scratched,
          ...(scratched ? { hide_submission_ids: hideIds() } : {}),
        },
      });
      toast.success("Saved");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{registrationName(row.entry)}</DialogTitle>
          <DialogDescription>{row.entry.division}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="admin-registration-link">Linked submission</Label>
            <Select value={linked} onValueChange={setLinked}>
              <SelectTrigger id="admin-registration-link">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LINK}>None: match by name</SelectItem>
                {staleLink && row.entry.linked_label && (
                  <SelectItem value={row.entry.linked_label}>{row.entry.linked_label} (not submitted)</SelectItem>
                )}
                {labels.map((l) => (
                  <SelectItem key={l.label} value={l.label}>
                    {l.label} · {l.divisions}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              For names the automatic match misses. Every song with this partnership counts, in any division.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" className="h-4 w-4" checked={handled} onChange={(e) => setHandled(e.target.checked)} />
            Handled elsewhere: needs no submission here
          </label>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={scratched}
                onChange={(e) => setScratched(e.target.checked)}
              />
              Scratched: signed up, then withdrew from competing
            </label>
            <p className="text-xs text-muted-foreground">
              Their songs stay submitted to the event, but are hidden from its public event page.
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor="admin-registration-note" className={FIELD_LABEL_CLASS}>
              Note
            </label>
            <input
              id="admin-registration-note"
              className={FIELD_INPUT_CLASS}
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={update.isPending} onClick={() => void save()}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
