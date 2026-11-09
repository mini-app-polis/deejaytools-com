import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import PersonPicker from "@/components/staff/PersonPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Form, FormControl, FormDescription, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { EVENT_ROLE_LABELS } from "@/lib/eventRoles";
import { toastFirstError } from "@/lib/formErrors";
import type { ApiEvent, ApiEventPerson, ApiEventStaff, EventStaffRole } from "@/schemas";

/**
 * The roles an event manager may grant and revoke. Event manager itself is
 * granted and revoked by an admin only, so it is never offered here.
 */
const GRANTABLE: readonly EventStaffRole[] = ["coordinator", "dj"];

const grantSchema = z.object({
  person: z
    .custom<ApiEventPerson | null>()
    .refine((p) => p !== null, "Choose a person")
    .pipe(z.custom<ApiEventPerson>()),
  role: z
    .custom<EventStaffRole | "">()
    .refine((r) => r !== "", "Choose a role")
    .pipe(z.custom<EventStaffRole>()),
});
type GrantForm = z.input<typeof grantSchema>;
type GrantValues = z.output<typeof grantSchema>;

function personLabel(s: ApiEventStaff): string {
  return [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || s.email;
}

/**
 * The event's staff, with grant and revoke for coordinator and DJ, through
 * the event's own staff routes.
 */
export default function EventStaffSection({ event }: { event: ApiEvent }) {
  const staffQuery = useEndpointQuery(endpoints.events.staff, { params: { id: event.id } });
  const staff = staffQuery.data ?? null;
  // A grant or revoke may be the caller's own, which changes their portals.
  const grantStaff = useEndpointMutation(endpoints.events.grantStaff, {
    invalidates: [endpoints.events.staff, endpoints.auth.me],
  });
  const revokeStaff = useEndpointMutation(endpoints.events.revokeStaff, {
    invalidates: [endpoints.events.staff, endpoints.auth.me],
  });
  const form = useForm<GrantForm, unknown, GrantValues>({
    resolver: zodResolver(grantSchema),
    defaultValues: { person: null, role: "" },
  });
  const {
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting: granting },
  } = form;
  const person = watch("person");
  const role = watch("role");
  const [revoking, setRevoking] = useState<string | null>(null);

  const grant = async ({ person, role }: GrantValues) => {
    try {
      const row = await grantStaff.mutateAsync({
        params: { id: event.id, userId: person.user_id, role },
      });
      toast.success(`${personLabel(row)} is now ${EVENT_ROLE_LABELS[row.role]}`);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Grant failed");
    }
  };

  const revoke = async (s: ApiEventStaff) => {
    const key = `${s.user_id}:${s.role}`;
    setRevoking(key);
    try {
      await revokeStaff.mutateAsync({
        params: { id: event.id, userId: s.user_id, role: s.role },
      });
      toast.success(`Removed ${personLabel(s)} as ${EVENT_ROLE_LABELS[s.role]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Staff</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {staffQuery.error && staff === null ? (
            <QueryError what="the staff" error={staffQuery.error} onRetry={() => void staffQuery.refetch()} />
          ) : staff === null ? (
            <Skeleton className="h-24 w-full" />
          ) : staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one is on this event&apos;s staff yet.</p>
          ) : (
            staff.map((s) => {
              const key = `${s.user_id}:${s.role}`;
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{personLabel(s)}</p>
                    <p className="text-xs text-muted-foreground">
                      {EVENT_ROLE_LABELS[s.role]} · {s.email}
                    </p>
                  </div>
                  {GRANTABLE.includes(s.role) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={revoking === key}
                      aria-label={`Remove ${personLabel(s)} as ${EVENT_ROLE_LABELS[s.role]}`}
                      onClick={() => void revoke(s)}
                    >
                      {revoking === key ? "Removing…" : "Remove"}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add staff</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={(e) => void handleSubmit(grant, toastFirstError)(e)} className="space-y-4 max-w-lg">
              <FormField
                control={form.control}
                name="person"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormControl>
                      <PersonPicker
                        id="staff-grant-user"
                        eventId={event.id}
                        label="Person"
                        value={field.value}
                        onChange={field.onChange}
                        hint="Searches people already connected to this event. Someone new? Find them by email below."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!person && (
                <EmailLookup
                  eventId={event.id}
                  onFound={(found) => form.setValue("person", found, { shouldValidate: true })}
                />
              )}
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <span className="block text-sm font-medium">Role</span>
                    <FormControl>
                      <ChoiceGroup
                        ariaLabel="Role"
                        options={GRANTABLE.map((r) => ({ value: r, label: EVENT_ROLE_LABELS[r] }))}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">An admin adds event managers.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={granting || !person || !role}>
                {granting ? "Adding…" : "Add to staff"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Someone new to the event, whom the name search cannot find: their account
 * by its whole email (GET /v1/events/:id/people/by-email). One account or
 * none; nothing is listed or partly matched.
 */
function EmailLookup({ eventId, onFound }: { eventId: string; onFound: (person: ApiEventPerson) => void }) {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const lookup = useEndpointQuery(endpoints.events.personByEmail, {
    params: { id: eventId, email: submitted },
    enabled: submitted !== "",
    retry: false,
  });
  const found = lookup.data ?? null;
  useEffect(() => {
    if (found) onFound(found);
  }, [found, onFound]);
  const notFound = (lookup.error as { status?: number } | null)?.status === 404;
  const valid = /^[^\s@]+@[^\s@]+$/.test(text.trim());

  return (
    <div className="space-y-1">
      <label htmlFor="staff-grant-email" className="block text-sm font-medium">
        Or find someone new by email
      </label>
      <div className="flex gap-2">
        <input
          id="staff-grant-email"
          type="email"
          className="flex-1 rounded-md border border-white/10 bg-background px-3 py-2 text-sm"
          value={text}
          placeholder="their.email@example.com"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (valid) setSubmitted(text.trim());
            }
          }}
        />
        <Button type="button" variant="outline" disabled={!valid || lookup.isFetching} onClick={() => setSubmitted(text.trim())}>
          {lookup.isFetching ? "Finding…" : "Find"}
        </Button>
      </div>
      {notFound && submitted === text.trim() ? (
        <p role="status" className="text-xs text-muted-foreground">
          No deejaytools account has that email. They need to sign in to deejaytools once first.
        </p>
      ) : lookup.error && !notFound ? (
        <p role="alert" className="text-xs text-destructive">
          {lookup.error.message}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Their whole email, as they sign in to deejaytools.</p>
      )}
    </div>
  );
}
