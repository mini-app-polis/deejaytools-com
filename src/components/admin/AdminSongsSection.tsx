import { useEffect, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { endpoints } from "@/api/endpoints";
import { useEndpointQuery } from "@/api/queries";
import QueryError from "@/components/QueryError";
import { formatTime } from "@/components/admin/adminShared";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";

/**
 * The admin Songs section: every uploaded song, searchable, with deleted
 * songs on request and year and division filters. It renders its own
 * TabsContent so it stays mounted while another admin section is shown,
 * keeping the search and filters as they were when the admin comes back.
 */
export default function AdminSongsSection() {
  // Live keystrokes feed `adminSongsQuery`, debounced into
  // `adminSongsDebouncedQuery` to drive the API call.
  const [adminSongsQuery, setAdminSongsQuery] = useState("");
  const [adminSongsDebouncedQuery, setAdminSongsDebouncedQuery] = useState("");
  const [adminSongsIncludeDeleted, setAdminSongsIncludeDeleted] = useState(false);
  const [adminSongsYear, setAdminSongsYear] = useState<string>("all");
  const [adminSongsDivision, setAdminSongsDivision] = useState<string>("all");

  const adminSongsQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (adminSongsDebouncedQuery) params.set("q", adminSongsDebouncedQuery);
    if (adminSongsIncludeDeleted) params.set("include_deleted", "true");
    return params.toString() || undefined;
  }, [adminSongsDebouncedQuery, adminSongsIncludeDeleted]);
  const adminSongsQueryResult = useEndpointQuery(endpoints.admin.songs, {
    params: { query: adminSongsQueryString },
    placeholderData: keepPreviousData,
  });
  const adminSongs = adminSongsQueryResult.data ?? null;
  const adminSongsLoading = adminSongsQueryResult.isFetching;

  // Debounce keystrokes so only the trailing value hits the API; 300 ms
  // feels responsive without a request per character.
  useEffect(() => {
    const t = setTimeout(() => setAdminSongsDebouncedQuery(adminSongsQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [adminSongsQuery]);

  const adminSongYears = useMemo(() => {
    const set = new Set<string>();
    (adminSongs ?? []).forEach((s) => {
      if (s.season_year) set.add(s.season_year);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [adminSongs]);

  const adminSongDivisions = useMemo(() => {
    const set = new Set<string>();
    (adminSongs ?? []).forEach((s) => {
      if (s.division) set.add(s.division);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [adminSongs]);

  const visibleAdminSongs = useMemo(
    () =>
      (adminSongs ?? [])
        .filter((s) => adminSongsYear === "all" || s.season_year === adminSongsYear)
        .filter((s) => adminSongsDivision === "all" || s.division === adminSongsDivision)
        .slice()
        .sort((a, b) => b.created_at - a.created_at),
    [adminSongs, adminSongsYear, adminSongsDivision]
  );

  return (
    <TabsContent value="songs" className="mt-4 space-y-4">
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          <div className="w-full sm:w-80">
            <Input
              type="search"
              aria-label="Search songs by song, owner, or partner"
              placeholder="Search by song, owner, or partner…"
              value={adminSongsQuery}
              onChange={(e) => setAdminSongsQuery(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={adminSongsIncludeDeleted}
              onChange={(e) => setAdminSongsIncludeDeleted(e.target.checked)}
            />
            Show deleted
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void adminSongsQueryResult.refetch()}
            disabled={adminSongsLoading}
          >
            {adminSongsLoading ? "Refreshing…" : "Refresh"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {adminSongs === null
              ? ""
              : `${visibleAdminSongs.length} song${visibleAdminSongs.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Year</span>
            <ChoiceGroup
              ariaLabel="Filter by year"
              options={[
                { value: "all", label: "All" },
                ...adminSongYears.map((y) => ({ value: y, label: y })),
              ]}
              value={adminSongsYear}
              onChange={setAdminSongsYear}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Division</span>
            <ChoiceGroup
              ariaLabel="Filter by division"
              options={[
                { value: "all", label: "All" },
                ...adminSongDivisions.map((d) => ({ value: d, label: d })),
              ]}
              value={adminSongsDivision}
              onChange={setAdminSongsDivision}
            />
          </div>
        </div>
      </div>

      {adminSongsQueryResult.error && !adminSongs ? (
        <QueryError what="songs" error={adminSongsQueryResult.error} onRetry={() => void adminSongsQueryResult.refetch()} />
      ) : adminSongs === null ? (
        <Skeleton className="h-32 w-full" />
      ) : adminSongs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {adminSongsDebouncedQuery
            ? `No songs match "${adminSongsDebouncedQuery}".`
            : "No songs yet."}
        </p>
      ) : visibleAdminSongs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No songs match the selected filters.</p>
      ) : (
        <div className={cn("space-y-3", adminSongsLoading && "opacity-60")}>
          {visibleAdminSongs.map((s) => {
            const ownerLabel = s.owner.full_name?.trim() || s.owner.email || "—";
            const partnerLabel = s.partner?.full_name?.trim() || "—";
            return (
              <div
                key={s.id}
                className={cn("rounded-lg border px-4 py-3 space-y-3", s.deleted_at && "opacity-60")}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-medium">{s.song_label}</span>
                    {s.is_legacy && (
                      <Badge
                        variant="secondary"
                        className="text-xs font-normal bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        title="Imported from the legacy catalog — no Drive file"
                      >
                        Legacy
                      </Badge>
                    )}
                    {s.deleted_at && (
                      <Badge variant="destructive" className="text-xs font-normal">deleted</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums shrink-0">
                    {formatTime(s.created_at)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Owner</p>
                    <p className="truncate">{ownerLabel}</p>
                    {s.owner.email && s.owner.full_name && (
                      <p className="text-xs text-muted-foreground truncate">{s.owner.email}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Partner</p>
                    <p className="truncate">{partnerLabel}</p>
                    {s.partner?.linked_user_email && (
                      <p className="text-xs text-muted-foreground truncate">linked: {s.partner.linked_user_email}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Division</p>
                    <p className="truncate">{s.division ?? "—"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Routine</p>
                    <p className="truncate">{s.routine_name ?? "—"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Descriptor</p>
                    <p className="truncate">{s.personal_descriptor ?? "—"}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </TabsContent>
  );
}
