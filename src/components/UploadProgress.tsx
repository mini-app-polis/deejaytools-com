import { Button } from "@/components/ui/button";
import type { ChunkUploadProgress, UploadInterrupted } from "@/lib/chunkedSongUpload";

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

type UploadProgressProps = {
  progress: ChunkUploadProgress;
  fileSize: number | null;
  /** The upload that stopped, offered for a retry from where it stopped. */
  interrupted: UploadInterrupted | null;
  onResume: () => void;
  resumeDisabled?: boolean;
};

/**
 * The upload forms' progress bar, the notice while a chunk is retried, and,
 * once an upload has stopped, what was sent and a button to continue it.
 */
export default function UploadProgress({
  progress,
  fileSize,
  interrupted,
  onResume,
  resumeDisabled,
}: UploadProgressProps) {
  const { stage, progress: percent, bytesSent } = progress;
  const retry = progress.retry ?? null;

  if (stage === "idle") {
    if (!interrupted) return null;
    return (
      <div role="alert" className="mt-3 space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
        <p className="text-destructive">{interrupted.message}</p>
        <Button type="button" variant="outline" size="sm" onClick={onResume} disabled={resumeDisabled}>
          Retry upload
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {stage === "uploading" && fileSize !== null
            ? `Uploading… ${formatMB(bytesSent)} of ${formatMB(fileSize)} MB`
            : stage === "processing"
              ? "Processing your file… this may take a moment"
              : "Saving…"}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>
      {retry && (
        <p role="status" className="text-xs text-amber-600 dark:text-amber-500">
          {retry.reason} Trying again in {Math.max(1, Math.round(retry.delayMs / 1000))} s (attempt {retry.attempt} of{" "}
          {retry.maxAttempts})…
        </p>
      )}
    </div>
  );
}
