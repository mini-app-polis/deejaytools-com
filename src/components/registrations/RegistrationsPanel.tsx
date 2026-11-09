import { useMemo, useState } from "react";
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

function submissionLine(s: ApiAdminEventSongSubmission, roundsSplit: boolean): string {
  const round = classicRoundLabel(s, roundsSplit);
  return [s.song_label, round ? `(${round})` : null].filter(Boolean).join(" ");
}

/**
 * One event's registration list against the songs submitted to it, so whoever
 * keeps the list sees who is still missing music: the admin Registrations
 * page, and the Registrations tab of the event's staff portals. Matching is
 * by name; an entry the match misses can be linked to a submission by hand,
 * marked handled elsewhere, or scratched (withdrawn from competing: their
 * songs stay submitted, hidden from the event page), and those marks survive
 * a re-import. Entries can be added one at a time and removed.
 *
 * Reads and writes the event-scoped /v1/events/:id/registrations routes,
 * which an admin may call on any event and the event's staff on theirs. An
 * entry's note is the admin's: `showNotes` shows and edits it.
 */
export default function RegistrationsPanel({ event, showNotes }: { event: ApiEvent; showNotes: boolean }) {
  const roundsSplit = isOpenEvent(event.name);
  const registrationsQuery = useEndpointQuery(endpoints.events.registrations, { params: { id: event.id } });
  const submissionsQuery = useEndpointQuery(endpoints.events.songSubmissions, { params: { id: event.id } });
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
  const [adding, setAdding] = useState(false);
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
  const fetching = registrationsQuery.isFetching || submissionsQuery.isFetching;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
          {registrations && registrations.length > 0 ? "Re-import list" : "Import list"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          Add entry
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={fetching}
          onClick={() => {
            void registrationsQuery.refetch();
            void submissionsQuery.refetch();
          }}
        >
          {fetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {loadError && !reconciled ? (
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
                      {showNotes && r.entry.note && (
                        <p className="text-xs italic text-muted-foreground">{r.entry.note}</p>
                      )}
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

      {importing && (
        <ImportDialog
          event={event}
          hasList={(registrations?.length ?? 0) > 0}
          showNotes={showNotes}
          onClose={() => setImporting(false)}
        />
      )}
      {adding && <AddDialog event={event} onClose={() => setAdding(false)} />}
      {editing && submissions && (
        <EditDialog
          eventId={event.id}
          row={editing}
          submissions={submissions}
          showNotes={showNotes}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ImportDialog({
  event,
  hasList,
  showNotes,
  onClose,
}: {
  event: ApiEvent;
  hasList: boolean;
  showNotes: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseRegistrationPaste(text), [text]);
  const divisionCount = useMemo(() => new Set(parsed.entries.map((e) => e.division)).size, [parsed]);
  const importList = useEndpointMutation(endpoints.events.importRegistrations, {
    invalidates: [endpoints.events.registrations],
  });

  const submit = async () => {
    try {
      const rows = await importList.mutateAsync({ params: { id: event.id }, body: { entries: parsed.entries } });
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
              ` This replaces the current list; entries that are unchanged keep their links and their handled and scratched marks${showNotes ? ", and notes" : ""}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="registrations-paste" className={FIELD_LABEL_CLASS}>
            Registration rows
          </label>
          <textarea
            id="registrations-paste"
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

function AddDialog({ event, onClose }: { event: ApiEvent; onClose: () => void }) {
  const [division, setDivision] = useState("");
  const [dancer1, setDancer1] = useState("");
  const [dancer2, setDancer2] = useState("");
  const add = useEndpointMutation(endpoints.events.addRegistration, {
    invalidates: [endpoints.events.registrations],
  });
  const ready = division.trim() !== "" && dancer1.trim() !== "";

  const submit = async () => {
    try {
      const row = await add.mutateAsync({
        params: { id: event.id },
        body: {
          division: division.trim(),
          dancer_1: dancer1.trim(),
          ...(dancer2.trim() ? { dancer_2: dancer2.trim() } : {}),
        },
      });
      toast.success(`Added ${registrationName(row)}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed");
    }
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void, hint?: string) => (
    <div className="space-y-1">
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      <input id={id} className={FIELD_INPUT_CLASS} value={value} maxLength={200} onChange={(e) => set(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an entry · {event.name}</DialogTitle>
          <DialogDescription>
            Someone who registered after the list was imported, or one the import missed. It is added at the end of
            the list; a re-import without it removes it again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {field("registration-division", "Division", division, setDivision, "As the registration names it, e.g. Classic.")}
          {field("registration-dancer-1", "Dancer 1", dancer1, setDancer1, "Or the team name.")}
          {field("registration-dancer-2", "Dancer 2 (optional)", dancer2, setDancer2)}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready || add.isPending} onClick={() => void submit()}>
            {add.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  eventId,
  row,
  submissions,
  showNotes,
  onClose,
}: {
  eventId: string;
  row: ReconciledRegistration;
  submissions: readonly ApiAdminEventSongSubmission[];
  /** Admins only: the entry's note, which the API keeps from everyone else. */
  showNotes: boolean;
  onClose: () => void;
}) {
  const [linked, setLinked] = useState(row.entry.linked_label ?? NO_LINK);
  const [handled, setHandled] = useState(row.entry.handled);
  const [scratched, setScratched] = useState(row.entry.scratched);
  const [note, setNote] = useState(row.entry.note ?? "");
  const update = useEndpointMutation(endpoints.events.updateRegistration, {
    invalidates: [endpoints.events.registrations],
  });
  const remove = useEndpointMutation(endpoints.events.removeRegistration, {
    invalidates: [endpoints.events.registrations],
  });
  const [confirmRemove, setConfirmRemove] = useState(false);

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
        params: { id: eventId, entryId: row.entry.id },
        body: {
          linked_label: linked === NO_LINK ? null : linked,
          handled,
          ...(showNotes ? { note: note.trim() || null } : {}),
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

  const removeEntry = async () => {
    try {
      await remove.mutateAsync({ params: { id: eventId, entryId: row.entry.id } });
      toast.success(`Removed ${registrationName(row.entry)}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
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
            <Label htmlFor="registration-link">Linked submission</Label>
            <Select value={linked} onValueChange={setLinked}>
              <SelectTrigger id="registration-link">
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
          {showNotes && (
            <div className="space-y-1">
              <label htmlFor="registration-note" className={FIELD_LABEL_CLASS}>
                Note
              </label>
              <input
                id="registration-note"
                className={FIELD_INPUT_CLASS}
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {confirmRemove ? (
            <Button variant="destructive" disabled={remove.isPending} onClick={() => void removeEntry()}>
              {remove.isPending ? "Removing…" : "Remove from the list"}
            </Button>
          ) : (
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmRemove(true)}>
              Remove…
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={update.isPending} onClick={() => void save()}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
