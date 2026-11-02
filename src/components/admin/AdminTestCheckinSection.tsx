import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS, formatTime } from "@/components/admin/adminShared";
import { useDivisions } from "@/hooks/useDivisions";
import { toastFirstError } from "@/lib/formErrors";
import { Badge } from "@/components/ui/badge";
import { ChoiceGroup } from "@/components/ui/choice-group";
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
import { TabsContent } from "@/components/ui/tabs";
import { formatSessionTitle } from "@/lib/sessionFormat";
import { compareSessionChrono } from "@/lib/chronoSort";

function randomFourDigitTag(): string {
  return Math.floor(Math.random() * 10000).toString().padStart(4, "0");
}
function randomDivision(divisions: readonly string[]): string {
  return divisions.length > 0 ? divisions[Math.floor(Math.random() * divisions.length)] : "";
}

/** A test check-in: checked in the order the form reads; only the first problem is reported. */
const testCheckinSchema = z
  .object({
    sessionId: z.string(),
    division: z.string(),
    leaderFirst: z.string(),
    leaderLast: z.string(),
    followerFirst: z.string(),
    followerLast: z.string(),
  })
  .superRefine((v, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (!v.sessionId) return fail("sessionId", "Select a session");
    if (!v.division) return fail("division", "Select a division");
    if (!v.leaderFirst.trim() || !v.leaderLast.trim()) {
      return fail("leaderFirst", "Leader first and last name are required");
    }
    if (!v.followerFirst.trim() || !v.followerLast.trim()) {
      fail("followerFirst", "Follower first and last name are required");
    }
  });
type TestCheckinForm = z.infer<typeof testCheckinSchema>;

/** Made-up dancers for the next test check-in, with fresh last names. */
function testDancers() {
  return {
    leaderFirst: "Leader",
    leaderLast: randomFourDigitTag(),
    followerFirst: "Follower",
    followerLast: randomFourDigitTag(),
  };
}

/**
 * The admin Test check-in section: checks made-up dancers into a session's
 * queue, lists the test check-ins so far, and deletes them all after a
 * confirmation. It renders its own TabsContent so it stays mounted while
 * another admin section is shown, keeping the form as it was when the
 * admin comes back.
 */
export default function AdminTestCheckinSection() {
  const { divisions: divisionOptions } = useDivisions();

  const [tcInitialDancers] = useState(testDancers);
  const {
    register: tcRegister,
    handleSubmit: tcValidate,
    getValues: tcGetValues,
    reset: tcReset,
    setValue: tcSetValue,
    watch: tcWatch,
    formState: { isSubmitting: tcSubmitting },
  } = useForm<TestCheckinForm>({
    resolver: zodResolver(testCheckinSchema),
    defaultValues: { sessionId: "", division: "", ...tcInitialDancers },
  });
  const tcSessionId = tcWatch("sessionId");
  const tcDivision = tcWatch("division");
  // A random division once the list loads, so each test checkin differs.
  useEffect(() => {
    if (tcDivision === "" && divisionOptions.length > 0) tcSetValue("division", randomDivision(divisionOptions));
  }, [tcDivision, divisionOptions, tcSetValue]);
  const [tcDeleting, setTcDeleting] = useState(false);
  const [pendingDeleteAllTestCheckins, setPendingDeleteAllTestCheckins] = useState(false);

  // The session picker, and each row's session label, come from the sessions list.
  const sessionsQuery = useEndpointQuery(endpoints.sessions.list);
  const sessions = sessionsQuery.data ?? null;

  const tcQuery = useEndpointQuery(endpoints.admin.testCheckins);
  const tcData = tcQuery.data ?? null;

  const injectCheckin = useEndpointMutation(endpoints.admin.injectCheckin, {
    invalidates: [endpoints.admin.testCheckins],
  });
  const clearTestCheckins = useEndpointMutation(endpoints.admin.clearTestCheckins, {
    invalidates: [endpoints.admin.testCheckins],
  });

  const submitTestCheckin = async (v: TestCheckinForm) => {
    try {
      const result = await injectCheckin.mutateAsync({ body: {
        sessionId: v.sessionId,
        divisionName: v.division,
        leaderFirstName: v.leaderFirst.trim(),
        leaderLastName: v.leaderLast.trim(),
        followerFirstName: v.followerFirst.trim(),
        followerLastName: v.followerLast.trim(),
      } });
      toast.success(
        `Checked in to ${result.initialQueue === "priority" ? "priority" : "non-priority"} queue`
      );
      // The session stays picked for the next test check-in.
      tcReset({
        sessionId: tcGetValues("sessionId"),
        division: randomDivision(divisionOptions),
        ...testDancers(),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    }
  };

  const confirmDeleteAllTestCheckins = async () => {
    setPendingDeleteAllTestCheckins(false);
    if (!tcData) return;
    setTcDeleting(true);
    try {
      const { deleted } = await clearTestCheckins.mutateAsync(undefined);
      toast.success(`Deleted ${deleted} check-in${deleted === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setTcDeleting(false);
    }
  };

  return (
    <>
      <TabsContent value="test-checkin" className="mt-4 space-y-4">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Adds made-up test dancers with a placeholder song, ignoring the check-in window. Each
          submission adds one entry to the selected session&apos;s queue.
        </div>
        <form onSubmit={(e) => void tcValidate(submitTestCheckin, toastFirstError)(e)} className="space-y-4 max-w-lg">
          <div>
            <label className={FIELD_LABEL_CLASS}>Session</label>
            <ChoiceGroup
              ariaLabel="Session"
              options={(sessions ?? [])
                .slice()
                .sort(compareSessionChrono)
                .map((s) => ({
                  value: s.id,
                  label: formatSessionTitle(s, s.event_timezone),
                }))}
              value={tcSessionId}
              onChange={(id) => tcSetValue("sessionId", id)}
            />
          </div>
          <div>
            <label className={FIELD_LABEL_CLASS}>Division</label>
            <ChoiceGroup
              ariaLabel="Division"
              options={divisionOptions.map((d) => ({ value: d, label: d }))}
              value={tcDivision}
              onChange={(d) => tcSetValue("division", d)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tc-leader-first-name" className={FIELD_LABEL_CLASS}>Leader first name</label>
              <input id="tc-leader-first-name" className={FIELD_INPUT_CLASS} {...tcRegister("leaderFirst")} />
            </div>
            <div>
              <label htmlFor="tc-leader-last-name" className={FIELD_LABEL_CLASS}>Leader last name</label>
              <input id="tc-leader-last-name" className={FIELD_INPUT_CLASS} {...tcRegister("leaderLast")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tc-follower-first-name" className={FIELD_LABEL_CLASS}>Follower first name</label>
              <input id="tc-follower-first-name" className={FIELD_INPUT_CLASS} {...tcRegister("followerFirst")} />
            </div>
            <div>
              <label htmlFor="tc-follower-last-name" className={FIELD_LABEL_CLASS}>Follower last name</label>
              <input id="tc-follower-last-name" className={FIELD_INPUT_CLASS} {...tcRegister("followerLast")} />
            </div>
          </div>
          <Button type="submit" disabled={tcSubmitting} size="lg" className="w-full sm:w-auto">
            {tcSubmitting ? "Checking in…" : "Test check-in"}
          </Button>
        </form>

        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-semibold">
              Existing test check-ins
              {tcData !== null && (
                <span className="ml-2 text-sm text-muted-foreground font-normal">
                  ({tcData.length})
                </span>
              )}
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm"
                onClick={() => void tcQuery.refetch()} disabled={tcDeleting}>
                Refresh
              </Button>
              <Button variant="destructive" size="sm"
                onClick={() => { if (tcData && tcData.length > 0) setPendingDeleteAllTestCheckins(true); }}
                disabled={tcDeleting || !tcData || tcData.length === 0}>
                {tcDeleting ? "Deleting…" : "Delete all"}
              </Button>
            </div>
          </div>

          {tcQuery.error && !tcData ? (
            <QueryError what="test check-ins" error={tcQuery.error} onRetry={() => void tcQuery.refetch()} />
          ) : tcData === null ? (
            <Skeleton className="h-24 w-full" />
          ) : tcData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No test check-ins yet.</p>
          ) : (
            <div className="space-y-2">
              {tcData.map((row) => {
                const queueLabel =
                  row.queue_status === "active" ? `Active #${row.position ?? "?"}`
                  : row.queue_status === "priority" ? `Priority #${row.position ?? "?"}`
                  : row.queue_status === "non_priority" ? `Non-priority #${row.position ?? "?"}`
                  : "Off queue";
                const sessionRow = sessions?.find((s) => s.id === row.session_id);
                const sessionLabel = sessionRow
                  ? formatSessionTitle(sessionRow, sessionRow.event_timezone)
                  : "No session";
                return (
                  <div key={row.pair_id}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium">
                          {row.leader_name}
                          {row.follower_name ? ` & ${row.follower_name}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sessionLabel}
                          {row.division_name ? ` · ${row.division_name}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Checked in {formatTime(row.created_at)}
                        </p>
                      </div>
                      <Badge variant={row.queue_status === "off_queue" ? "outline" : "default"}
                        className="shrink-0">
                        {queueLabel}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </TabsContent>

      {/* ── Delete all test check-ins confirmation dialog ── */}
      <Dialog open={pendingDeleteAllTestCheckins}
        onOpenChange={(open: boolean) => { if (!open) setPendingDeleteAllTestCheckins(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all test check-ins?</DialogTitle>
            <DialogDescription>
              This will remove {tcData?.length ?? 0} check-in{(tcData?.length ?? 0) === 1 ? "" : "s"} —
              synthetic users, partners, pairs, check-ins, and queue entries. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteAllTestCheckins(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteAllTestCheckins()}>Delete all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
