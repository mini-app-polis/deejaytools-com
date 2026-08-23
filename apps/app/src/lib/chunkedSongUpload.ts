const apiBase = import.meta.env.VITE_API_URL ?? "";
export const CHUNK_SIZE = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export type UploadStage = "idle" | "uploading" | "processing" | "finishing";

export type ChunkUploadProgress = {
  stage: UploadStage;
  progress: number;
  bytesSent: number;
};

type UploadSongChunksOptions = {
  file: File;
  getToken: () => Promise<string | null>;
  buildFormFields: () => Record<string, string>;
  onProgress?: (update: ChunkUploadProgress) => void;
};

export async function uploadSongInChunks({
  file,
  getToken,
  buildFormFields,
  onProgress,
}: UploadSongChunksOptions): Promise<void> {
  onProgress?.({ stage: "uploading", progress: 10, bytesSent: 0 });

  const uploadId = crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const MAX_RETRIES = 3;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const isLast = i === totalChunks - 1;
    if (isLast) {
      onProgress?.({ stage: "processing", progress: i > 0 ? 90 : 50, bytesSent: end });
    }

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));

      const form = new FormData();
      form.set("chunk", chunk, file.name);
      form.set("upload_id", uploadId);
      form.set("chunk_index", String(i));
      form.set("total_chunks", String(totalChunks));
      form.set("original_filename", file.name);
      form.set("mime_type", file.type || "audio/mpeg");
      for (const [key, value] of Object.entries(buildFormFields())) {
        form.set(key, value);
      }

      let token: string | null;
      try {
        token = await getToken();
      } catch {
        token = null;
      }
      if (!token) {
        throw new Error("Your session expired. Please sign in again and retry the upload.");
      }

      let res: Response;
      try {
        res = await fetch(`${apiBase}/v1/songs/upload/chunk`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          body: form,
        });
      } catch (fetchErr) {
        const detail =
          fetchErr instanceof Error ? `${fetchErr.name}: ${fetchErr.message}` : String(fetchErr);
        lastErr = new Error(`Network error (${detail}) — check your connection and try again.`);
        continue;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        lastErr = new Error(json?.error?.message ?? `Upload failed (${res.status})`);
        if (res.status === 401) throw lastErr;
        continue;
      }
      lastErr = null;
      if (!isLast) {
        onProgress?.({
          stage: "uploading",
          progress: 10 + Math.round((end / file.size) * 75),
          bytesSent: end,
        });
      }
      break;
    }
    if (lastErr) throw lastErr;
  }

  onProgress?.({ stage: "finishing", progress: 95, bytesSent: file.size });
  onProgress?.({ stage: "finishing", progress: 100, bytesSent: file.size });
  await new Promise((r) => setTimeout(r, 400));
}
