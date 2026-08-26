const apiBase = import.meta.env.VITE_API_URL ?? "";
export const CHUNK_SIZE = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

const UNREADABLE_FILE_HINT =
  "couldn't be read from disk. If it's stored in iCloud Drive, Google Drive or " +
  "Dropbox, it may be a placeholder that hasn't downloaded yet — open its folder, " +
  "make sure it isn't showing a cloud icon, then try again.";

/**
 * Why a File can't be uploaded, or null if it looks fine.
 *
 * Reading a File is a live read from disk, not a copy, so a cloud placeholder
 * hands us a File whose bytes are not local. fetch() surfaces that as
 * `TypeError: Failed to fetch` — indistinguishable from a dead network unless
 * we check the file ourselves.
 *
 * Both ends are probed because hydration can be partial: a readable first byte
 * does not prove the tail is there. This is a heuristic, not a proof — a
 * provider that serves partial reads can pass here and still fail mid-upload,
 * which is why the per-chunk catch re-checks rather than trusting this once.
 *
 * Note a placeholder reports its REAL size (the metadata is local, only the
 * bytes are not), so size is not a placeholder signal — a zero-byte file is a
 * genuinely different fault and gets its own message.
 */
async function fileReadFailure(file: File): Promise<string | null> {
  if (file.size === 0) return `"${file.name}" is empty (0 bytes).`;
  try {
    await file.slice(0, 1).arrayBuffer();
    await file.slice(file.size - 1).arrayBuffer();
    return null;
  } catch {
    return `"${file.name}" ${UNREADABLE_FILE_HINT}`;
  }
}

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
  const upfrontFailure = await fileReadFailure(file);
  if (upfrontFailure) throw new Error(upfrontFailure);

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
        // A fetch rejection only tells us no response came back. Check the file
        // before blaming the network — and never retry an unreadable file,
        // which is guaranteed to fail again and only delays the real message.
        const readFailure = await fileReadFailure(file);
        if (readFailure) throw new Error(readFailure);
        const detail =
          fetchErr instanceof Error ? `${fetchErr.name}: ${fetchErr.message}` : String(fetchErr);
        lastErr = new Error(
          `Upload failed (${detail}) — the connection may have dropped. Retrying…`
        );
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
