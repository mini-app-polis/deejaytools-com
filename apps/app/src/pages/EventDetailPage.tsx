import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthMe } from "@/hooks/useAuthMe";

type EventRow = {
  id: string;
  name: string;
  date: string | null;
  status: string;
};

type SessionRow = {
  id: string;
  event_id: string | null;
  name: string;
  date: string | null;
  checkin_opens_at: number;
  floor_trial_starts_at: number;
  floor_trial_ends_at: number;
  active_priority_max?: number;
  active_non_priority_max?: number;
  status: string;
};

type DivisionRow = {
  division_name: string;
  is_priority: boolean;
  priority_run_limit: number;
};

function sessionStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return <Badge variant="secondary">{status}</Badge>;
    case "checkin_open":
      return <Badge variant="default">{status}</Badge>;
    case "in_progress":
      return (
        <Badge className="bg-green-600 text-white hover:bg-green-600/90 border-transparent">
          {status}
        </Badge>
      );
    case "completed":
      return <Badge variant="outline">{status}</Badge>;
    case "cancelled":
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const FIELD_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const FIELD_LABEL_CLASS = "block text-sm font-medium mb-1";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApiClient();
  const { isAdmin } = useAuthMe();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);

  // Form state — plain useState, no react-hook-form.
  const [fName, setFName] = useState("");
  const [fDate, setFDate] = useState("");
  const [fCheckinOpensAt, setFCheckinOpensAt] = useState("");
  const [fFloorStartsAt, setFFloorStartsAt] = useState("");
  const [fFloorEndsAt, setFFloorEndsAt] = useState("");
  const [fPriorityMax, setFPriorityMax] = useState("6");
  const [fNonPriorityMax, setFNonPriorityMax] = useState("4");
  const [fDivisions, setFDivisions] = useState<DivisionRow[]>([
    { division_name: "Classic", is_priority: false, priority_run_limit: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get<EventRow>(`/v1/events/${id}`),
      api.get<SessionRow[]>(`/v1/sessions?event_id=${encodeURIComponent(id)}`),
    ])
      .then(([ev, sess]) => {
        setEvent(ev);
        setSessions(sess);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api, id]);

  const resetForm = () => {
    setFName("");
    setFDate("");
    setFCheckinOpensAt("");
    setFFloorStartsAt("");
    setFFloorEndsAt("");
    setFPriorityMax("6");
    setFNonPriorityMax("4");
    setFDivisions([{ division_name: "Classic", is_priority: false, priority_run_limit: 0 }]);
  };

  const openCreateDialog = () => {
    resetForm();
    setSessionDialogOpen(true);
  };

  const closeCreateDialog = () => {
    setSessionDialogOpen(false);
  };

  const updateDivision = (index: number, patch: Partial<DivisionRow>) => {
    setFDivisions((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const addDivision = () => {
    setFDivisions((prev) => [
      ...prev,
      { division_name: "", is_priority: false, priority_run_limit: 0 },
    ]);
  };

  const removeDivision = (index: number) => {
    setFDivisions((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const priorityMaxNum = Number(fPriorityMax);
    const nonPriorityMaxNum = Number(fNonPriorityMax);

    if (!fName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!fCheckinOpensAt || !fFloorStartsAt || !fFloorEndsAt) {
      toast.error("All three datetime fields are required");
      return;
    }
    if (Number.isNaN(priorityMaxNum) || priorityMaxNum < 0) {
      toast.error("Active cap (priority) must be a non-negative number");
      return;
    }
    if (Number.isNaN(nonPriorityMaxNum) || nonPriorityMaxNum < 0) {
      toast.error("Active cap (non-priority) must be a non-negative number");
      return;
    }
    if (nonPriorityMaxNum > priorityMaxNum) {
      toast.error("Non-priority cap must be ≤ priority cap");
      return;
    }

    const divisions = fDivisions
      .filter((d) => d.division_name.trim() && d.division_name.trim() !== "Other")
      .map((d, i) => ({
        division_name: d.division_name.trim(),
        is_priority: d.is_priority,
        sort_order: i,
        priority_run_limit: Number.isFinite(d.priority_run_limit) ? d.priority_run_limit : 0,
      }));

    setSubmitting(true);
    try {
      await api.post<SessionRow>("/v1/sessions", {
        event_id: id,
        name: fName.trim(),
        ...(fDate.trim() ? { date: fDate.trim() } : {}),
        checkin_opens_at: new Date(fCheckinOpensAt).getTime(),
        floor_trial_starts_at: new Date(fFloorStartsAt).getTime(),
        floor_trial_ends_at: new Date(fFloorEndsAt).getTime(),
        active_priority_max: priorityMaxNum,
        active_non_priority_max: nonPriorityMaxNum,
        divisions,
      });
      toast.success("Session created");
      setSessionDialogOpen(false);
      resetForm();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setSubmitting(false);
    }
  };

  if (!id) {
    return <p className="text-muted-foreground">Missing event id.</p>;
  }

  if (loading && !event) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!event) {
    return <p className="text-muted-foreground">Event not found.</p>;
  }

  return (
    <div className={`space-y-6 ${loading ? "opacity-60" : ""}`}>
      <div>
        <Button variant="ghost" size="sm" className="mb-2 px-0" asChild>
          <Link to="/events">← Events</Link>
        </Button>
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">{event.name}</h1>
            <p className="text-sm text-muted-foreground">{event.date ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            {event.status === "upcoming" && <Badge variant="default">upcoming</Badge>}
            {event.status === "active" && (
              <Badge className="bg-green-600 text-white hover:bg-green-600/90 border-transparent">
                active
              </Badge>
            )}
            {event.status === "completed" && <Badge variant="secondary">completed</Badge>}
            {event.status === "cancelled" && <Badge variant="destructive">cancelled</Badge>}
            {!["upcoming", "active", "completed", "cancelled"].includes(event.status) && (
              <Badge variant="outline">{event.status}</Badge>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions" className="space-y-4 mt-4">
          <div className="flex justify-end">
            {isAdmin && <Button onClick={openCreateDialog}>New Session</Button>}
          </div>
          {sessions?.length === 0 && (
            <p className="text-sm text-muted-foreground">No sessions for this event.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {sessions?.map((sess) => (
              <Card key={sess.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex flex-wrap items-center gap-2">
                    {sess.name}
                    {sessionStatusBadge(sess.status)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  <p>Check-in: {formatTime(sess.checkin_opens_at)}</p>
                  <p>
                    Floor trial: {formatTime(sess.floor_trial_starts_at)} –{" "}
                    {formatTime(sess.floor_trial_ends_at)}
                  </p>
                  <Separator className="my-2" />
                  <Button variant="link" className="px-0 h-auto" asChild>
                    <Link to={`/sessions/${sess.id}`}>Open session →</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="registrations" className="mt-4">
          <p className="text-muted-foreground">Coming soon</p>
        </TabsContent>
      </Tabs>

      {sessionDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeCreateDialog}
        >
          <div
            className="rounded-lg border bg-background p-6 shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">New session</h2>
              <Button type="button" variant="ghost" size="sm" onClick={closeCreateDialog}>
                ✕
              </Button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className={FIELD_LABEL_CLASS}>Name</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                />
              </div>

              <div>
                <label className={FIELD_LABEL_CLASS}>Date (optional)</label>
                <input
                  className={FIELD_INPUT_CLASS}
                  value={fDate}
                  onChange={(e) => setFDate(e.target.value)}
                />
              </div>

              <div>
                <label className={FIELD_LABEL_CLASS}>Check-in opens</label>
                <input
                  type="datetime-local"
                  className={FIELD_INPUT_CLASS}
                  value={fCheckinOpensAt}
                  onChange={(e) => setFCheckinOpensAt(e.target.value)}
                />
              </div>

              <div>
                <label className={FIELD_LABEL_CLASS}>Floor trial starts</label>
                <input
                  type="datetime-local"
                  className={FIELD_INPUT_CLASS}
                  value={fFloorStartsAt}
                  onChange={(e) => setFFloorStartsAt(e.target.value)}
                />
              </div>

              <div>
                <label className={FIELD_LABEL_CLASS}>Floor trial ends</label>
                <input
                  type="datetime-local"
                  className={FIELD_INPUT_CLASS}
                  value={fFloorEndsAt}
                  onChange={(e) => setFFloorEndsAt(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={FIELD_LABEL_CLASS}>Active cap (priority)</label>
                  <input
                    type="number"
                    min={0}
                    className={FIELD_INPUT_CLASS}
                    value={fPriorityMax}
                    onChange={(e) => setFPriorityMax(e.target.value)}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL_CLASS}>Active cap (non-priority)</label>
                  <input
                    type="number"
                    min={0}
                    className={FIELD_INPUT_CLASS}
                    value={fNonPriorityMax}
                    onChange={(e) => setFNonPriorityMax(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={FIELD_LABEL_CLASS}>Divisions</label>
                  <Button type="button" variant="outline" size="sm" onClick={addDivision}>
                    Add division
                  </Button>
                </div>
                {fDivisions.map((d, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center"
                  >
                    <input
                      placeholder="Division name"
                      className={`${FIELD_INPUT_CLASS} flex-1`}
                      value={d.division_name}
                      onChange={(e) => updateDivision(index, { division_name: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={d.is_priority}
                        onChange={(e) => updateDivision(index, { is_priority: e.target.checked })}
                      />
                      Priority
                    </label>
                    <div className="w-28 shrink-0">
                      <label className="text-xs block mb-1">Priority runs (1..X)</label>
                      <input
                        type="number"
                        min={0}
                        className={FIELD_INPUT_CLASS}
                        value={d.priority_run_limit}
                        onChange={(e) =>
                          updateDivision(index, {
                            priority_run_limit: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDivision(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating..." : "Create session"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}