import { useCallback, useState } from "react";
import {
  UploadInterrupted,
  uploadSongInChunks,
  type ChunkUploadProgress,
} from "@/lib/chunkedSongUpload";

const IDLE: ChunkUploadProgress = { stage: "idle", progress: 0, bytesSent: 0, retry: null };

type UploadOptions = Omit<Parameters<typeof uploadSongInChunks>[0], "onProgress" | "resume">;

/**
 * An upload form's view of the chunk loop: its progress, and the upload it
 * can resume after a chunk kept failing. `upload` rethrows every failure for
 * the form to report; an UploadInterrupted is also kept as `interrupted`
 * until the next upload starts.
 */
export function useChunkedUpload() {
  const [progress, setProgress] = useState<ChunkUploadProgress>(IDLE);
  const [interrupted, setInterrupted] = useState<UploadInterrupted | null>(null);

  const upload = useCallback(
    async (options: UploadOptions, resume: UploadInterrupted | null = null) => {
      setInterrupted(null);
      try {
        await uploadSongInChunks({ ...options, resume: resume?.resume ?? null, onProgress: setProgress });
      } catch (err) {
        if (err instanceof UploadInterrupted) setInterrupted(err);
        throw err;
      } finally {
        setProgress(IDLE);
      }
    },
    []
  );

  const clearInterrupted = useCallback(() => setInterrupted(null), []);

  return { progress, interrupted, upload, clearInterrupted };
}
