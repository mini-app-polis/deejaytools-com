import type { ErrorEnvelope, SuccessEnvelope } from "@deejaytools/ts-utils";
import { useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useApiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuthMe as MeResponse } from "@/hooks/useAuthMe";

const DIVISION_OPTIONS = [
  "Classic",
  "Showcase",
  "Rising Star Classic",
  "Rising Star Showcase",
  "Sophisticated",
  "Masters",
  "Teams",
  "ProAm LeaderAm",
  "ProAm FollowerAm",
  "NovInt Routines",
  "Juniors",
  "Young Adult",
  "Exhibition",
  "Superstar",
  "My Division Is Not Listed",
] as const;

const SOLO_ALLOWED_DIVISIONS = new Set<string>(["Teams", "My Division Is Not Listed"]);

const SOLO_PARTNER_VALUE = "__solo__";

const apiBase = import.meta.env.VITE_API_URL ?? "";

type UploadStage = "idle" | "creating" | "uploading" | "finishing";

const stageLabel: Record<UploadStage, string> = {
  idle: "",
  creating: "Preparing...",
  uploading: "Uploading file...",
  finishing: "Saving...",
};

type Song = {
  id: string;
  partner_id: string | null;
  processed_filename: string | null;
  division: string | null;
  routine_name: string | null;
  personal_descriptor: string | null;
  created_at: number;
  partner_first_name?: string | null;
  partner_last_name?: string | null;
};

type Partner = {
  id: string;
  first_name: string;
  last_name: string;
  partner_role: "leader" | "follower";
};

function partnerLabel(p: Partner) {
  return `${p.first_name} ${p.last_name}`.trim();
}

export default function SongsPage() {
  const api = useApiClient();
  const { getToken } = useAuth();

  const [songs, setSongs] = useState<Song[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [division, setDivision] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<Song[]>("/v1/songs"),
      api.get<Partner[]>("/v1/partners"),
      api.get<MeResponse>("/v1/auth/me"),
    ])
      .then(([s, p, m]) => {
        if (!cancelled) {
          setSongs(s);
          setPartners(p);
          setMe(m);
        }
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select an audio file.");
      return;
    }
    if (!division) {
      toast.error("Please select a division.");
      return;
    }
    if (!SOLO_ALLOWED_DIVISIONS.has(division) && !selectedPartnerId) {
      toast.error("A partner is required for this division.");
      return;
    }

    setIsSubmitting(true);
    let createdId: string | null = null;

    try {
      setUploadStage("creating");
      setUploadProgress(5);
      const created = await api.post<Song>("/v1/songs", {
        division,
        routine_name: routineName.trim() || null,
        personal_descriptor: descriptor.trim() || null,
        partner_id: selectedPartnerId || null,
      });
      createdId = created.id;

      setUploadStage("uploading");
      setUploadProgress(10);

      await new Promise<void>((resolve, reject) => {
        void (async () => {
          try {
            const token = await getToken();
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${apiBase}/v1/songs/${createdId}/upload`);
            xhr.setRequestHeader("Accept", "application/json");
            if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) {
                setUploadProgress(10 + Math.round((ev.loaded / ev.total) * 80));
              }
            };

            xhr.onload = () => {
              if (xhr.status < 200 || xhr.status >= 300) {
                reject(new Error(`Upload failed: ${xhr.statusText || String(xhr.status)}`));
                return;
              }
              try {
                const json = JSON.parse(xhr.responseText) as SuccessEnvelope<unknown> | ErrorEnvelope;
                if ("error" in json) {
                  reject(new Error(json.error.message));
                  return;
                }
                resolve();
              } catch {
                reject(new Error("Upload failed: invalid response"));
              }
            };

            xhr.onerror = () => reject(new Error("Network error during upload"));

            const form = new FormData();
            form.set("file", file);
            xhr.send(form);
          } catch (e) {
            reject(e instanceof Error ? e : new Error("Upload failed."));
          }
        })();
      });

      setUploadStage("finishing");
      setUploadProgress(95);
      const updated = await api.get<Song[]>("/v1/songs");
      setSongs(updated);

      setUploadProgress(100);
      await new Promise((r) => setTimeout(r, 400));

      toast.success("Song uploaded successfully.");
      setFile(null);
      setDivision("");
      setRoutineName("");
      setDescriptor("");
      setSelectedPartnerId("");
      setFileInputKey((k) => k + 1);
      setFormKey((k) => k + 1);
    } catch (err) {
      if (createdId) {
        try {
          await api.del(`/v1/songs/${createdId}`);
        } catch {
          /* ignore rollback errors */
        }
      }
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadStage("idle");
      setUploadProgress(0);
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.del(`/v1/songs/${id}`);
      setSongs((prev) => prev.filter((s) => s.id !== id));
      setPendingDeleteId(null);
      toast.success("Song removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete song.");
      setPendingDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  const hasFullName = Boolean(me?.first_name?.trim() && me?.last_name?.trim());

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Songs</h1>

      <Card>
        <CardHeader>
          <CardTitle>Upload a song</CardTitle>
          <CardDescription>
            Create your song record and upload one audio file in a single step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasFullName ? (
            <p className="text-sm text-muted-foreground">
              Uploading as:{" "}
              <span className="font-medium text-foreground">
                {me!.first_name} {me!.last_name}
              </span>
            </p>
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-500">
              Set your first and last name on the{" "}
              <Link to="/partners" className="underline font-medium">
                Partners
              </Link>{" "}
              page so we can label your uploads correctly.
            </p>
          )}

          <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="song-partner">Partner</Label>
              <Select
                key={formKey}
                value={selectedPartnerId === "" ? SOLO_PARTNER_VALUE : selectedPartnerId}
                onValueChange={(v) =>
                  setSelectedPartnerId(v === SOLO_PARTNER_VALUE ? "" : v)
                }
              >
                <SelectTrigger id="song-partner">
                  <SelectValue placeholder="Solo / No partner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SOLO_PARTNER_VALUE}>Solo / No partner</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {partnerLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Add partners in the{" "}
                <Link to="/partners" className="underline">
                  Partners
                </Link>{" "}
                page.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="song-division">Division</Label>
              <Select key={formKey} value={division || undefined} onValueChange={setDivision}>
                <SelectTrigger id="song-division">
                  <SelectValue placeholder="Select a division" />
                </SelectTrigger>
                <SelectContent>
                  {DIVISION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="song-routine">Routine / Song name</Label>
              <Input
                id="song-routine"
                value={routineName}
                onChange={(e) => setRoutineName(e.target.value)}
                placeholder="Optional — recommended"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="song-descriptor">Personal descriptor</Label>
              <Input
                id="song-descriptor"
                value={descriptor}
                onChange={(e) => setDescriptor(e.target.value)}
                placeholder="e.g. 98%, -2%, v3, 2026-02-01"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="song-file">Audio file</Label>
              <Input
                key={fileInputKey}
                id="song-file"
                type="file"
                accept="audio/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Uploading…" : "Upload song"}
            </Button>
            {uploadStage !== "idle" && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{stageLabel[uploadStage]}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <div className={loading ? "opacity-60" : ""}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Processed filename</TableHead>
              <TableHead>Division</TableHead>
              <TableHead>Routine name</TableHead>
              <TableHead>Descriptor</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead className="w-[200px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {songs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No songs yet.
                </TableCell>
              </TableRow>
            )}
            {songs.map((s) => {
              const partnerCell = !s.partner_id
                ? "—"
                : [s.partner_first_name, s.partner_last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || "—";
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    {new Date(s.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {s.processed_filename?.trim() ? s.processed_filename : "—"}
                  </TableCell>
                  <TableCell>{s.division ?? "—"}</TableCell>
                  <TableCell>{s.routine_name ?? "—"}</TableCell>
                  <TableCell>{s.personal_descriptor ?? "—"}</TableCell>
                  <TableCell>{partnerCell}</TableCell>
                  <TableCell>
                    {pendingDeleteId === s.id ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">Delete?</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDelete(s.id)}
                          disabled={deletingId === s.id}
                        >
                          {deletingId === s.id ? "Removing..." : "Yes"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setPendingDeleteId(null)}
                          disabled={deletingId === s.id}
                        >
                          No
                        </Button>
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => setPendingDeleteId(s.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
