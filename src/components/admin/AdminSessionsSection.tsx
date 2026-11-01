import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { type ApiSession } from "@/schemas";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import AdminSessionDialog from "@/components/admin/AdminSessionDialog";
import { CLICKABLE_ROW_CLASS, ROW_LINK_CLASS } from "@/lib/clickable";
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
import { formatSessionTitle, formatTimeOnly, formatTimezoneAbbr } from "@/lib/sessionFormat";
import { compareSessionChrono } from "@/lib/chronoSort";
import { sessionStatusBadge } from "@/components/admin/adminShared";

/**
 * The admin Sessions section: every event's sessions bucketed by status,
 * with create, edit and delete. It renders its own TabsContent so it stays
 * mounted while another admin section is shown, keeping its toggles and
 * dialogs as they were when the admin comes back.
 */
export default function AdminSessionsSection() {
  const navigate = useNavigate();
  const [sessDialogOpen, setSessDialogOpen] = useState(false);
  /** The session the dialog edits; null while it creates a new one. */
  const [sessEditing, setSessEditing] = useState<ApiSession | null>(null);
  /** Tracks the row currently mid-delete so its button can disable + show "Deleting…". */
  const [sessDeletingId, setSessDeletingId] = useState<string | null>(null);
  /** Delete-confirmation dialog state. */
  const [pendingDeleteSession, setPendingDeleteSession] = useState<ApiSession | null>(null);
  const [showSessionsCompleted, setShowSessionsCompleted] = useState(false);
  const [showSessionsCancelled, setShowSessionsCancelled] = useState(false);

  // The dialog's event picker, and each row's event name, come from the events list.
  const eventsQuery = useEndpointQuery(endpoints.events.list);
  const events = eventsQuery.data ?? null;

  const sessionsQuery = useEndpointQuery(endpoints.sessions.list);
  const sessions = sessionsQuery.data ?? null;
  const loadingSessions = sessionsQuery.isFetching;

  const removeSession = useEndpointMutation(endpoints.sessions.remove, { invalidates: [endpoints.sessions.list] });

  // ── Session CRUD ─────────────────────────────────────────────────────────────

  const openSessDialog = () => {
    setSessEditing(null);
    setSessDialogOpen(true);
  };

  const openSessEditDialog = (s: ApiSession) => {
    setSessEditing(s);
    setSessDialogOpen(true);
  };

  const deleteSession = (s: ApiSession) => {
    setPendingDeleteSession(s);
  };

  const confirmDeleteSession = async () => {
    if (!pendingDeleteSession) return;
    const s = pendingDeleteSession;
    setPendingDeleteSession(null);
    setSessDeletingId(s.id);
    try {
      await removeSession.mutateAsync({ params: { id: s.id } });
      toast.success("Session deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete session");
    } finally {
      setSessDeletingId(null);
    }
  };

  const sessionBuckets = useMemo(() => {
    const list = (sessions ?? []).slice().sort(compareSessionChrono);
    return {
      active: list.filter((s) => s.status === "checkin_open" || s.status === "in_progress"),
      upcoming: list.filter((s) => s.status === "scheduled"),
      completed: list.filter((s) => s.status === "completed"),
      cancelled: list.filter((s) => s.status === "cancelled"),
    };
  }, [sessions]);

  const renderSessionRow = (s: ApiSession) => {
    const eventName = events?.find((ev) => ev.id === s.event_id)?.name ?? "—";
    return (
      <TableRow
        key={s.id}
        className={CLICKABLE_ROW_CLASS}
        onClick={() => navigate(`/sessions/${s.id}`)}
      >
        <TableCell className="font-medium">
          <Link
            to={`/sessions/${s.id}`}
            className={ROW_LINK_CLASS}
            onClick={(e) => e.stopPropagation()}
          >
            {formatSessionTitle(s, s.event_timezone)}
          </Link>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
          {eventName}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
          {s.event_timezone && (
            <Badge variant="outline" className="text-xs font-normal">
              {formatTimezoneAbbr(s.event_timezone, s.floor_trial_starts_at)}
            </Badge>
          )}
        </TableCell>
        <TableCell>{sessionStatusBadge(s.status)}</TableCell>
        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
          {formatTimeOnly(s.checkin_opens_at, s.event_timezone)}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
          {formatTimeOnly(s.floor_trial_starts_at, s.event_timezone)}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
          {formatTimeOnly(s.floor_trial_ends_at, s.event_timezone)}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openSessEditDialog(s)}
              disabled={sessDeletingId === s.id}
            >
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteSession(s)}
              disabled={sessDeletingId === s.id}
            >
              {sessDeletingId === s.id ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderSessionBox = (title: string, rows: ApiSession[]) => (
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
              <TableHead>Session</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>TZ</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Open</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead className="w-[160px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{rows.map((s) => renderSessionRow(s))}</TableBody>
        </Table>
      )}
    </section>
  );

  return (
    <>
      <TabsContent value="sessions" className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={openSessDialog} className="w-full sm:w-auto">
            New Session
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSessionsCompleted}
              onChange={(e) => setShowSessionsCompleted(e.target.checked)}
            />
            Show completed
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSessionsCancelled}
              onChange={(e) => setShowSessionsCancelled(e.target.checked)}
            />
            Show cancelled
          </label>
        </div>
        {sessionsQuery.error && !sessions ? (
          <QueryError what="sessions" error={sessionsQuery.error} onRetry={() => void sessionsQuery.refetch()} />
        ) : loadingSessions && !sessions ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className={`space-y-4${loadingSessions ? " opacity-60" : ""}`}>
            {renderSessionBox("Active", sessionBuckets.active)}
            {renderSessionBox("Upcoming", sessionBuckets.upcoming)}
            {showSessionsCompleted && renderSessionBox("Completed", sessionBuckets.completed)}
            {showSessionsCancelled && renderSessionBox("Cancelled", sessionBuckets.cancelled)}
          </div>
        )}
      </TabsContent>

      {/* ── Delete Session confirmation dialog ── */}
      <Dialog open={!!pendingDeleteSession} onOpenChange={(open: boolean) => { if (!open) setPendingDeleteSession(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this session?</DialogTitle>
            <DialogDescription>
              {pendingDeleteSession && (
                <>
                  <span className="font-medium">{formatSessionTitle(pendingDeleteSession, pendingDeleteSession.event_timezone)}</span>
                  <br />
                  This deletes the session and everything in it — its check-ins, queue, and run history. This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteSession(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteSession()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Session dialog ── */}
      {sessDialogOpen && (
        <AdminSessionDialog
          editing={sessEditing}
          events={events}
          onClose={() => setSessDialogOpen(false)}
        />
      )}
    </>
  );
}
