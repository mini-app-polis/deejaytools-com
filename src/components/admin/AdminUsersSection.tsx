import { useMemo, useState } from "react";
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
import {
  DEFAULT_USER_SORT,
  fullName,
  nextUserSort,
  rolesByEvent,
  sortUsers,
  type UserSort,
  type UserSortKey,
} from "@/lib/adminUsers";
import { EVENT_ROLE_LABELS } from "@/lib/eventRoles";
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

/** Events shown in a user's Roles cell before the rest fold into "+N more". */
const ROLE_EVENTS_SHOWN = 2;

/**
 * A column header that sorts the table: pressed once, the column's natural
 * direction; again, the other way. `aria-sort` says which column and way.
 */
function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  title,
  className,
}: {
  label: string;
  sortKey: UserSortKey;
  sort: UserSort;
  onSort: (key: UserSortKey) => void;
  title?: string;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        title={title}
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded hover:text-foreground",
          active && "text-foreground"
        )}
      >
        {label}
        <span aria-hidden="true" className={cn("text-[10px]", !active && "opacity-0")}>
          {active && sort.direction === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </TableHead>
  );
}

/**
 * What a user can do: "admin" across the site, and each event they are on
 * the staff of with their roles there. Plain "user" when neither.
 */
function RolesCell({ user }: { user: ApiAdminUser }) {
  const events = rolesByEvent(user);
  const shown = events.slice(0, ROLE_EVENTS_SHOWN);
  const hidden = events.slice(ROLE_EVENTS_SHOWN);
  const describe = (e: (typeof events)[number]) =>
    `${e.eventName}: ${e.roles.map((r) => EVENT_ROLE_LABELS[r]).join(", ")}`;
  return (
    <div className="flex flex-col items-start gap-1">
      {user.role === "admin" && (
        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 border-transparent">admin</Badge>
      )}
      {shown.map((e) => (
        <span key={e.eventId} className="text-xs leading-snug" title={describe(e)}>
          <span className="text-foreground">{e.roles.map((r) => EVENT_ROLE_LABELS[r]).join(", ")}</span>
          <span className="text-muted-foreground"> · {e.eventName}</span>
        </span>
      ))}
      {hidden.length > 0 && (
        <span className="text-xs text-muted-foreground" title={hidden.map(describe).join("\n")}>
          +{hidden.length} more {hidden.length === 1 ? "event" : "events"}
        </span>
      )}
      {user.role !== "admin" && events.length === 0 && <Badge variant="secondary">user</Badge>}
    </div>
  );
}

/**
 * The admin Users section: every user, searchable and sortable by any
 * column, with how much each has in deejaytools (songs, partners, events
 * entered, managed partnerships, teams), what each can do (admin, and their
 * staff roles per event) and a toggle to grant or revoke the admin role. It renders its own TabsContent so it stays
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
  const [sort, setSort] = useState<UserSort>(DEFAULT_USER_SORT);
  const loaded = usersQueryResult.data;
  const users = useMemo(() => (loaded ? sortUsers(loaded, sort) : null), [loaded, sort]);
  const onSort = (key: UserSortKey) => setSort((current) => nextUserSort(current, key));
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
                <SortableHead label="Name" sortKey="name" sort={sort} onSort={onSort} />
                <SortableHead label="Email" sortKey="email" sort={sort} onSort={onSort} />
                <SortableHead
                  label="Roles"
                  sortKey="roles"
                  sort={sort}
                  onSort={onSort}
                  title="Admin, and staff roles per event"
                />
                {/* Numeric columns are right-aligned and use tabular-nums
                    on the cells below so digits line up between rows. */}
                {COUNT_COLUMNS.map((c) => (
                  <SortableHead
                    key={c.key}
                    label={c.label}
                    sortKey={c.key}
                    sort={sort}
                    onSort={onSort}
                    title={c.title}
                    className="text-right"
                  />
                ))}
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const name = fullName(u) || "—";
                const isSelf = me?.id === u.id;
                const isSubmitting = !!userRoleSubmitting[u.id];
                const nextRole: "user" | "admin" =
                  u.role === "admin" ? "user" : "admin";
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <RolesCell user={u} />
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
