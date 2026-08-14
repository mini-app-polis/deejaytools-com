import { useState } from "react";
import { Link } from "react-router-dom";
import SongUploadForm from "@/components/SongUploadForm";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PageMode = "upload_self" | "upload_managed";

type ModeCardProps = {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
};

function ModeCard({ active, title, description, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border p-4 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card hover:bg-muted/50",
      ].join(" ")}
    >
      <p className={`font-semibold text-sm ${active ? "text-primary" : ""}`}>{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </button>
  );
}

export default function AddSongPage() {
  const [mode, setMode] = useState<PageMode>("upload_self");

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="px-0 mb-2" asChild>
          <Link to="/my-content?tab=songs">← Back to My Content</Link>
        </Button>
        <h1 className="page-title text-2xl">Add Song</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ModeCard
          active={mode === "upload_self"}
          title="Upload for myself"
          description="You're one of the dancers."
          onClick={() => setMode("upload_self")}
        />
        <ModeCard
          active={mode === "upload_managed"}
          title="Upload for a managed partnership"
          description="Upload on behalf of a partnership you manage."
          onClick={() => setMode("upload_managed")}
        />
      </div>

      {mode === "upload_self" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload a song</CardTitle>
            <CardDescription>
              Select your audio file, fill in the details below, and hit Upload.
              The file should contain only your routine — no bow music or intro
              buffer; the DJ starts playback at 0:00.{" "}
              <Link to="/how-it-works#submitting-music" className="text-primary hover:underline">
                File requirements →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SongUploadForm variant="self" />
          </CardContent>
        </Card>
      )}

      {mode === "upload_managed" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload for a managed partnership</CardTitle>
            <CardDescription>
              Upload a song on behalf of a partnership you manage. The file should
              contain only the routine — no bow music or intro buffer; the DJ starts
              playback at 0:00.{" "}
              <Link to="/how-it-works#submitting-music" className="text-primary hover:underline">
                File requirements →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SongUploadForm variant="managed" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
