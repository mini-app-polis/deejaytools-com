import { useCallback, useId, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ACCEPT_TYPES = ["image/png", "image/jpeg"] as const;

type FeedbackType = "bug" | "feature" | "general";

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature Request" },
  { value: "general", label: "General" },
];

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [openToContact, setOpenToContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fileInputId = useId();

  const revokeObjectPreview = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  function processFile(file: File) {
    setScreenshotError(null);
    if (!ACCEPT_TYPES.includes(file.type as (typeof ACCEPT_TYPES)[number])) {
      setScreenshotError("Please use PNG or JPEG.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setScreenshotError("File must be 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      if (result.length > 3 * 1024 * 1024) {
        setScreenshotError("Image is too large after encoding. Try a smaller file.");
        return;
      }
      setScreenshotDataUrl(result);
      revokeObjectPreview();
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setScreenshotPreviewUrl(url);
    };
    reader.onerror = () => setScreenshotError("Could not read the file.");
    reader.readAsDataURL(file);
  }

  function clearScreenshot(e?: React.MouseEvent) {
    e?.stopPropagation();
    setScreenshotDataUrl(null);
    setScreenshotError(null);
    revokeObjectPreview();
    setScreenshotPreviewUrl(null);
    setFileInputKey((k) => k + 1);
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function onDropZoneDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (openToContact) {
      const trimmed = contactEmail.trim();
      if (!trimmed) {
        setError("Please enter an email or uncheck the contact permission.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setError("Please enter a valid email address.");
        return;
      }
    }
    if (screenshotError) {
      setError("Fix the screenshot issue before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        type,
        subject: subject.trim(),
        message: message.trim(),
      };
      if (openToContact && contactEmail.trim()) body.contactEmail = contactEmail.trim();
      if (openToContact && contactName.trim()) body.contactName = contactName.trim();
      if (screenshotDataUrl) body.screenshot = screenshotDataUrl;

      const res = await fetch(`${API_BASE}/v1/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        data?: unknown;
      };

      if (!res.ok) {
        const msg =
          typeof data.error?.message === "string"
            ? data.error.message
            : "Something went wrong. Please try again.";
        setError(msg);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center">
        <div className="mb-4 flex justify-center">
          <span className="text-4xl" aria-hidden>✓</span>
        </div>
        <h1
          className="text-2xl font-black italic mb-3 text-foreground"
          style={{ fontFamily: "'Fraunces', ui-serif, serif" }}
        >
          Thanks for the feedback!
        </h1>
        <p className="text-muted-foreground text-sm">
          Your message has been sent. We read everything.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-10">
      {/* Header */}
      <div className="mb-8">
        <p
          className="text-[10px] font-medium tracking-[0.18em] uppercase text-primary mb-3"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          DeejayTools · Feedback
        </p>
        <h1
          className="text-3xl sm:text-4xl font-black italic leading-tight tracking-tight mb-2 text-foreground"
          style={{ fontFamily: "'Fraunces', ui-serif, serif", fontVariationSettings: "'opsz' 72" }}
        >
          Send us feedback
        </h1>
        <p className="text-sm text-muted-foreground">
          Found a bug, got an idea, or just want to say something? Your message goes straight to the team.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Type */}
        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Type
          </span>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((opt) => {
              const selected = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border bg-card text-muted-foreground hover:border-white/25 hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Subject */}
        <div>
          <label
            htmlFor="feedback-subject"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Subject
          </label>
          <input
            id="feedback-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={255}
            className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Short summary"
          />
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="feedback-message"
            className="mb-1.5 block text-xs font-medium text-muted-foreground"
          >
            Message
          </label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={5}
            className="w-full resize-y rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Details, steps to reproduce, ideas…"
          />
        </div>

        {/* Contact opt-in */}
        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground/85">
            <input
              type="checkbox"
              checked={openToContact}
              onChange={(e) => {
                setOpenToContact(e.target.checked);
                if (!e.target.checked) {
                  setContactName("");
                  setContactEmail("");
                }
              }}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-input accent-primary"
            />
            <span>I&apos;m open to being contacted about this feedback</span>
          </label>

          {openToContact && (
            <div className="space-y-3 pl-6">
              <div>
                <label
                  htmlFor="feedback-contact-name"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  Your name{" "}
                  <span className="font-normal text-muted-foreground/60">(optional)</span>
                </label>
                <input
                  id="feedback-contact-name"
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  maxLength={255}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="How should we address you?"
                />
              </div>
              <div>
                <label
                  htmlFor="feedback-contact-email"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  Best email to reach you
                </label>
                <input
                  id="feedback-contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="you@example.com"
                />
              </div>
            </div>
          )}
        </div>

        {/* Screenshot */}
        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Screenshot
          </span>
          <input
            key={fileInputKey}
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={onFileInputChange}
          />
          <label
            htmlFor={fileInputId}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropZoneDrop}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-card/80"
          >
            {!screenshotPreviewUrl ? (
              <>
                <span className="text-foreground/70">
                  Attach a screenshot{" "}
                  <span className="text-muted-foreground">(optional · PNG or JPG · max 2 MB)</span>
                </span>
                <span className="text-xs text-muted-foreground/60">drag and drop or click</span>
              </>
            ) : (
              <div className="relative w-full">
                <img
                  src={screenshotPreviewUrl}
                  alt="Screenshot preview"
                  className="mx-auto max-h-40 rounded-md border border-border object-contain"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    clearScreenshot(e);
                  }}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-base leading-none text-white transition hover:bg-black/90"
                  aria-label="Remove screenshot"
                >
                  ×
                </button>
              </div>
            )}
          </label>
          {screenshotError && (
            <p className="mt-2 text-xs text-destructive">{screenshotError}</p>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Submit */}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Submit feedback"}
          </button>
        </div>
      </form>
    </div>
  );
}
