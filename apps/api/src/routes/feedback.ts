import { Hono } from "hono";
import { z } from "zod";
import { success } from "common-typescript-utils";
import { zValidator } from "../lib/validate.js";

const DATA_URL_PREFIX = /^data:image\/(png|jpeg);base64,/i;

const feedbackBodySchema = z
  .object({
    type: z.enum(["bug", "feature", "general"]),
    subject: z.string().min(1).max(255),
    message: z.string().min(1).max(20_000),
    contactName: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? undefined : v),
      z.string().max(255).optional(),
    ),
    contactEmail: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? undefined : v),
      z.string().email().optional(),
    ),
    screenshot: z.string().max(3 * 1024 * 1024).optional(),
  })
  .superRefine((val, ctx) => {
    const s = val.screenshot;
    if (s !== undefined && s.length > 0 && !DATA_URL_PREFIX.test(s)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["screenshot"],
        message: "Screenshot must be a PNG or JPEG data URL",
      });
    }
  });

export const feedbackRoutes = new Hono();

feedbackRoutes.post("/", zValidator("json", feedbackBodySchema), async (c) => {
  const { type, subject, message, contactName, contactEmail, screenshot: rawScreenshot } =
    c.req.valid("json");

  const screenshot =
    rawScreenshot && rawScreenshot.length > 0 ? rawScreenshot : undefined;
  const screenshotBase64 =
    screenshot?.includes(",") ? screenshot.split(",")[1] : undefined;

  const submittedAt = new Date().toISOString();

  const emailBody = `
═══════════════════════════════
FEEDBACK DETAILS
═══════════════════════════════
Type:    ${type}
Subject: ${subject}

${message}

═══════════════════════════════
CONTACT
═══════════════════════════════
Name:  ${contactName ?? "Not provided"}
Email: ${contactEmail ?? "Not provided"}

═══════════════════════════════
METADATA
═══════════════════════════════
Submitted: ${submittedAt}
═══════════════════════════════
`.trim();

  const brevoKey = process.env.BREVO_API_KEY;
  if (brevoKey) {
    const payload: Record<string, unknown> = {
      sender: { name: "DeejayTools Feedback", email: "kaiano@kaianolevine.com" },
      to: [{ email: "kaiano.levine@gmail.com" }],
      subject: `[DeejayTools Feedback] ${type}: ${subject}`,
      textContent: emailBody,
    };

    if (screenshot && screenshotBase64) {
      const isJpeg = screenshot.startsWith("data:image/jpeg");
      payload.attachment = [
        {
          content: screenshotBase64,
          name: isJpeg ? "screenshot.jpg" : "screenshot.png",
        },
      ];
    }

    const emailRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => "");
      console.error("[feedback] Brevo error:", emailRes.status, errText);
      return c.json(
        { error: { code: "EMAIL_FAILED", message: "Failed to send email. Please try again." } },
        502,
      );
    }
  } else {
    console.warn("[feedback] BREVO_API_KEY not set; skipping transactional email");
  }

  return c.json(success(null), 201);
});
