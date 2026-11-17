import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { endpoints } from "@/api/endpoints";
import { useEndpointMutation, useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { useAuthMe } from "@/hooks/useAuthMe";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
import type { ApiAdminUser } from "@/schemas";

type CountKey = keyof Pick<
  ApiAdminUser,
  "song_count" | "partner_count" | "event_count" | "managed_partnership_count" | "team_count"
>;

/** The per-user counts, one column each, in the order shown. */
const COUNT_COLUMNS: readonly { key: CountKey; label: string; title: string }[] = [
  { key: "song_count", label: "Songs", title: "Songs uploaded, not deleted" },
  { key: "partner_count", label: "Partners", title: "Partners they have added" },
  { key: "event_count", label: "Events", title: "Events their songs are submitted to" },
  { key: "managed_partnership_count", label: "Managed", title: "Managed partnerships they run" },
  { key: "team_count", label: "Teams", title: "Teams they compete as" },
];

/**
 * The admin Users section: every user, searchable, with how much each has
 * in deejaytools (songs, partners, events entered, managed partnerships,
 * teams) and a toggle to grant or revoke the admin role. It renders its own TabsContent so it stays
 * mounted while another admin section is shown, keeping the search as it
 * was when the admin comes back.
 */
export default function AdminUsersSection({ open }: { open: boolean }) {
  // Identifies the current admin so the role toggle is hidden on their own
  // row (the API also rejects self-demotion).
  const { me } = useAuthMe();

  // `usersQuery` updates on every keystroke; `usersDebouncedQuery` is what
  // actually fires the network request. 300 ms feels responsive without
  // hammering the API on every character.
  const [usersQuery, setUsersQuery] = useState("");
  // Only the trailing value wins: typing "alic" asks once, for q=alic.
  const usersDebouncedQuery = useDebouncedValue(usersQuery.trim(), 300);
  /** Per-row loading state while a role PATCH is in flight. */
  const [userRoleSubmitting, setUserRoleSubmitting] = useState<Record<string, boolean>>({});

  const usersQueryResult = useEndpointQuery(endpoints.admin.users, {
    params: usersDebouncedQuery ? { q: usersDebouncedQuery } : undefined,
    placeholderData: keepPreviousData,
    enabled: open,
  });
  const users = usersQueryResult.data ?? null;
  const usersLoading = usersQueryResult.isFetching;

  const setRole = useEndpointMutation(endpoints.admin.setUserRole, { invalidates: [endpoints.admin.users] });

  /**
   * Patch a user's role server-side; the users list refetches, so the UI shows
   * what the server stored rather than a prediction of it. The
   * self-demote case is also blocked server-side; the UI just hides the
   * toggle for the current admin's own row to make it obvious.
   */
  const setUserRole = async (userId: string, nextRole: "user" | "admin") => {
    setUserRoleSubmitting((prev) => ({ ...prev, [userId]: true }));
    try {
      const updated = await setRole.mutateAsync({ params: { id: userId }, body: { role: nextRole } });
      toast.success(
        nextRole === "admin"
          ? `${updated.email} is now an admin`
          : `${updated.email} is now a regular user`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setUserRoleSubmitting((prev) => {
        const { [userId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  return (
    <TabsContent value="users" className="mt-4 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="w-full sm:w-80">
          <Input
            type="search"
            aria-label="Search users by name or email"
            placeholder="Search by name or email…"
            value={usersQuery}
            onChange={(e) => setUsersQuery(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void usersQueryResult.refetch()}
          disabled={usersLoading}
        >
          {usersLoading ? "Refreshing…" : "Refresh"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {users === null ? "" : `${users.length} user${users.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {usersQueryResult.error && !users ? (
        <QueryError what="users" error={usersQueryResult.error} onRetry={() => void usersQueryResult.refetch()} />
      ) : users === null ? (
        <Skeleton className="h-32 w-full" />
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {usersDebouncedQuery
            ? `No users match "${usersDebouncedQuery}".`
            : "No users yet."}
        </p>
      ) : (
        <div className={usersLoading ? "opacity-60" : ""}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                {/* Numeric columns are right-aligned and use tabular-nums
                    on the cells below so digits line up between rows. */}
                {COUNT_COLUMNS.map((c) => (
                  <TableHead key={c.key} className="text-right" title={c.title}>
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const fullName =
                  [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
                  "—";
                const isSelf = me?.id === u.id;
                const isSubmitting = !!userRoleSubmitting[u.id];
                const nextRole: "user" | "admin" =
                  u.role === "admin" ? "user" : "admin";
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{fullName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">
                          admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary">user</Badge>
                      )}
                    </TableCell>
                    {COUNT_COLUMNS.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(
                          "text-right tabular-nums text-sm",
                          u[c.key] === 0 && "text-muted-foreground"
                        )}
                      >
                        {u[c.key]}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">
                          (you)
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant={nextRole === "admin" ? "default" : "outline"}
                          onClick={() => void setUserRole(u.id, nextRole)}
                          disabled={isSubmitting}
                        >
                          {isSubmitting
                            ? "Saving…"
                            : nextRole === "admin"
                            ? "Make admin"
                            : "Revoke admin"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </TabsContent>
  );
}
