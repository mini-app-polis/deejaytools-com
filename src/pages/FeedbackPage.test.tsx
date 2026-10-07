// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FeedbackPage from "./FeedbackPage";

// Feedback is public and posts with a bare fetch (no API client, no Clerk).
const fetchMock = vi.fn();
const createObjectURL = vi.fn(() => "blob:preview-1");
const revokeObjectURL = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function postedBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function png(name = "shot.png", type = "image/png", bytes?: number) {
  const f = new File(["\x89PNG"], name, { type });
  if (bytes !== undefined) Object.defineProperty(f, "size", { value: bytes });
  return f;
}

function screenshotInput() {
  return screen.getByLabelText(/attach a screenshot/i) as HTMLInputElement;
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Subject"), "  Queue froze  ");
  await user.type(screen.getByLabelText("Message"), " It stopped updating. ");
}

describe("FeedbackPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the trimmed feedback with the default type and shows a thank-you", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null, meta: { version: "v1" } }));
    const user = userEvent.setup();
    render(<FeedbackPage />);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));

    expect(
      await screen.findByRole("heading", { name: /thanks for the feedback/i })
    ).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/feedback$/);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(postedBody()).toEqual({
      type: "general",
      subject: "Queue froze",
      message: "It stopped updating.",
    });
  });

  it("sends the chosen type and contact details when the user opts in", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    const user = userEvent.setup();
    render(<FeedbackPage />);

    await user.click(screen.getByRole("button", { name: "Bug" }));
    await fillRequired(user);
    await user.click(screen.getByRole("checkbox", { name: /open to being contacted/i }));
    await user.type(screen.getByLabelText(/your name/i), " Kai ");
    await user.type(screen.getByLabelText(/best email/i), " kai@example.com ");
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));

    await screen.findByRole("heading", { name: /thanks for the feedback/i });
    expect(postedBody()).toEqual({
      type: "bug",
      subject: "Queue froze",
      message: "It stopped updating.",
      contactName: "Kai",
      contactEmail: "kai@example.com",
    });
  });

  it("forgets contact details when the user opts back out", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    const user = userEvent.setup();
    render(<FeedbackPage />);

    await user.click(screen.getByRole("button", { name: "Feature Request" }));
    await fillRequired(user);
    const optIn = screen.getByRole("checkbox", { name: /open to being contacted/i });
    await user.click(optIn);
    await user.type(screen.getByLabelText(/best email/i), "kai@example.com");
    await user.click(optIn);
    expect(screen.queryByLabelText(/best email/i)).not.toBeInTheDocument();

    await user.click(optIn);
    expect(screen.getByLabelText(/best email/i)).toHaveValue("");
    await user.click(optIn);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));

    await screen.findByRole("heading", { name: /thanks for the feedback/i });
    expect(postedBody()).toEqual({
      type: "feature",
      subject: "Queue froze",
      message: "It stopped updating.",
    });
  });

  it.each([
    ["", "Please enter an email or uncheck the contact permission."],
    ["not-an-email", "Please enter a valid email address."],
  ])("validates the contact email %j", async (email, message) => {
    const user = userEvent.setup();
    render(<FeedbackPage />);

    await fillRequired(user);
    await user.click(screen.getByRole("checkbox", { name: /open to being contacted/i }));
    if (email) await user.type(screen.getByLabelText(/best email/i), email);
    // Submit the form directly: the browser's own type=email check would
    // otherwise intercept before the page's validation runs.
    fireEvent.submit(screen.getByRole("button", { name: "Submit feedback" }).closest("form")!);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attaches a PNG screenshot as a data URL, previews it, and can remove it", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: null }));
    const user = userEvent.setup();
    render(<FeedbackPage />);

    fireEvent.change(screenshotInput(), { target: { files: [png()] } });
    const preview = await screen.findByRole("img", { name: "Screenshot preview" });
    expect(preview).toHaveAttribute("src", "blob:preview-1");

    await user.click(screen.getByRole("button", { name: "Remove screenshot" }));
    expect(screen.queryByRole("img", { name: "Screenshot preview" })).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");

    // Dropping a file onto the zone works the same as choosing one.
    fireEvent.drop(screen.getByText(/drag and drop or click/i).closest("label")!, {
      dataTransfer: { files: [png("drop.jpg", "image/jpeg")] },
    });
    await screen.findByRole("img", { name: "Screenshot preview" });

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    await screen.findByRole("heading", { name: /thanks for the feedback/i });
    expect(postedBody().screenshot).toMatch(/^data:image\/jpeg;base64,/);
  });

  it.each([
    [png("shot.gif", "image/gif"), "Please use PNG or JPEG."],
    [png("big.png", "image/png", 2 * 1024 * 1024 + 1), "File must be 2 MB or smaller."],
  ])("rejects an unsuitable screenshot and blocks submission until fixed", async (file, message) => {
    const user = userEvent.setup();
    render(<FeedbackPage />);

    fireEvent.change(screenshotInput(), { target: { files: [file] } });
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Screenshot preview" })).not.toBeInTheDocument();

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    expect(await screen.findByText("Fix the screenshot issue before submitting.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    // Choosing a valid file clears the problem.
    fireEvent.change(screenshotInput(), { target: { files: [png()] } });
    await screen.findByRole("img", { name: "Screenshot preview" });
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it("shows the server's error message and keeps the form", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "BAD_REQUEST", message: "Subject is too long" } }, 400)
    );
    const user = userEvent.setup();
    render(<FeedbackPage />);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));

    expect(await screen.findByText("Subject is too long")).toBeInTheDocument();
    expect(screen.getByLabelText("Subject")).toHaveValue("  Queue froze  ");
    expect(screen.getByRole("button", { name: "Submit feedback" })).toBeEnabled();
  });

  it("falls back to a generic message when the error body isn't JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));
    const user = userEvent.setup();
    render(<FeedbackPage />);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    expect(
      await screen.findByText("Something went wrong. Please try again.")
    ).toBeInTheDocument();
  });

  it("reports a network failure and disables the button while sending", async () => {
    let fail!: (e: Error) => void;
    fetchMock.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    const user = userEvent.setup();
    render(<FeedbackPage />);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();

    fail(new TypeError("Failed to fetch"));
    expect(await screen.findByText("Network error. Please try again.")).toBeInTheDocument();
  });

  it("surfaces a contract violation when the success body has the wrong shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true } }));
    const user = userEvent.setup();
    render(<FeedbackPage />);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Submit feedback" }));
    await waitFor(() =>
      expect(screen.getByText(/API contract violation on feedback\.submit/)).toBeInTheDocument()
    );
    expect(screen.queryByRole("heading", { name: /thanks/i })).not.toBeInTheDocument();
  });
});
