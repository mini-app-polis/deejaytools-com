// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.fn();
const apiClient = {
  get: apiGet,
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  postForm: vi.fn(),
};
vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: vi.fn(), isLoaded: true, isSignedIn: true, userId: "u1" }),
}));

// The chunk loop has its own tests (chunkedSongUpload.test, AddSongPage.test);
// here it is a stand-in that records what the form asks it to send.
const uploadSongInChunks = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chunkedSongUpload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chunkedSongUpload")>()),
  uploadSongInChunks,
}));

import SongUploadForm from "./SongUploadForm";
import { MAX_FILE_BYTES } from "@/lib/chunkedSongUpload";
import { toast } from "sonner";
import { fx } from "@/test/fixtures";
import { renderWithQueryClient } from "@/test/render";

const EXPECTED_UPLOAD_DIVISIONS = [
  "Classic",
  "Showcase",
  "Rising Star Classic",
  "Rising Star Showcase",
  "ProAm LeaderAm",
  "ProAm FollowerAm",
  "NovInt Routines",
  "Sophisticated",
  "Masters",
  "Juniors",
  "Young Adult",
  "Exhibition",
  "Superstar",
  "Carolina Shag Divisions",
];

function mockLoadedSelfForm() {
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/partners") {
      return Promise.resolve([fx.partner({ id: "p1", first_name: "Alex", last_name: "Lee", partner_role: "leader" })]);
    }
    if (path === "/v1/auth/me") {
      return Promise.resolve(fx.authMe({ id: "u1", first_name: "Alex", last_name: "Lee" }));
    }
    return Promise.resolve([]);
  });
}

function renderForm() {
  return renderWithQueryClient(
    <MemoryRouter>
      <SongUploadForm variant="self" />
    </MemoryRouter>
  );
}

describe("SongUploadForm division pills", () => {
  beforeEach(() => {
    apiGet.mockReset();
    mockLoadedSelfForm();
  });

  it("hides portal-only divisions from the division pills", async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByRole("radiogroup", { name: "Division" })).toBeInTheDocument();
    });

    for (const hidden of ["Teams", "Cabaret", "My Division Is Not Listed"]) {
      expect(screen.queryByRole("radio", { name: hidden })).not.toBeInTheDocument();
    }
  });

  it("shows the remaining divisions in the new display order", async () => {
    renderForm();

    const group = await screen.findByRole("radiogroup", { name: "Division" });
    const labels = [...group.querySelectorAll('[role="radio"]')].map((el) => el.textContent);
    expect(labels).toEqual(EXPECTED_UPLOAD_DIVISIONS);
  });

  it("renders one row per non-empty division group with no blank rows", async () => {
    renderForm();

    const group = await screen.findByRole("radiogroup", { name: "Division" });
    const rows = group.querySelectorAll(".flex.flex-wrap.gap-2");
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.querySelectorAll('[role="radio"]').length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------

function audioFile(size?: number): File {
  const file = new File([new Uint8Array(1024 * 1024)], "routine.mp3", { type: "audio/mpeg" });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

function chooseFile(file: File) {
  fireEvent.change(screen.getByLabelText(/audio file/i), { target: { files: [file] } });
}

function chooseDivision(name: string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

function submit() {
  fireEvent.submit(screen.getByLabelText(/audio file/i).closest("form")!);
}

describe("SongUploadForm — checks before uploading", () => {
  beforeEach(() => {
    uploadSongInChunks.mockReset();
    vi.mocked(toast.error).mockClear();
    mockLoadedSelfForm();
  });

  it("asks for a file first", async () => {
    renderForm();
    await screen.findByLabelText(/audio file/i);
    submit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Please select an audio file."));
    expect(uploadSongInChunks).not.toHaveBeenCalled();
  });

  it("refuses a file over the size limit", async () => {
    renderForm();
    await screen.findByLabelText(/audio file/i);
    chooseFile(audioFile(MAX_FILE_BYTES + 1));
    chooseDivision("Classic");
    submit();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That file is too large. Please choose an audio file under 100 MB.")
    );
    expect(uploadSongInChunks).not.toHaveBeenCalled();
  });

  it("asks for a division", async () => {
    renderForm();
    await screen.findByLabelText(/audio file/i);
    chooseFile(audioFile());
    submit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Please select a division."));
    expect(uploadSongInChunks).not.toHaveBeenCalled();
  });
});

describe("SongUploadForm — uploading", () => {
  beforeEach(() => {
    uploadSongInChunks.mockReset();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("uploads on a dancer's behalf with their partner, then resets the form", async () => {
    apiGet.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/v1/admin/users/u9/partners"
          ? [fx.partner({ id: "p9", first_name: "Sam", last_name: "Hart", partner_role: "follower" })]
          : []
      )
    );
    uploadSongInChunks.mockResolvedValue(undefined);
    const onUploaded = vi.fn();
    renderWithQueryClient(
      <MemoryRouter>
        <SongUploadForm
          variant="self"
          onBehalf={{ userId: "u9", label: "Dana Fox (dana@example.com)" }}
          onUploaded={onUploaded}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Uploading as:/)).toHaveTextContent("Dana Fox (dana@example.com)");
    expect(apiGet).toHaveBeenCalledWith("/v1/admin/users/u9/partners");
    expect(apiGet).not.toHaveBeenCalledWith("/v1/auth/me");

    chooseFile(audioFile());
    chooseDivision("Showcase");
    fireEvent.change(screen.getByLabelText(/routine \/ song name/i), { target: { value: "  Night Moves " } });
    submit();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Song uploaded successfully."));
    const [{ buildFormFields }] = uploadSongInChunks.mock.calls[0]!;
    expect(buildFormFields()).toEqual({
      division: "Showcase",
      routine_name: "Night Moves",
      personal_descriptor: "",
      partner_id: "p9",
      on_behalf_of_user_id: "u9",
    });
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/routine \/ song name/i)).toHaveValue("");
  });

  it("uploads for a dancer at an event as event staff: picks their partner and submits to the event", async () => {
    apiGet.mockReset();
    apiGet.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/v1/events/ev-1/people/u9/partners"
          ? [
              fx.partner({ id: "p9", first_name: "Sam", last_name: "Hart", partner_role: "follower" }),
              fx.partner({ id: "p8", first_name: "Kim", last_name: "Ode", partner_role: "follower" }),
            ]
          : []
      )
    );
    uploadSongInChunks.mockResolvedValue(undefined);
    renderWithQueryClient(
      <MemoryRouter>
        <SongUploadForm variant="self" onBehalf={{ userId: "u9", label: "Dana Fox", eventId: "ev-1" }} />
      </MemoryRouter>
    );

    const partner = await screen.findByRole("radiogroup", { name: "Partner" });
    expect(partner).toHaveTextContent("Sam Hart");
    expect(partner).toHaveTextContent("Kim Ode");
    expect(partner).toHaveTextContent("No partner");
    fireEvent.click(screen.getByRole("radio", { name: "Kim Ode" }));
    chooseFile(audioFile());
    chooseDivision("Classic");
    submit();

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Song uploaded and submitted to the event, ready for check-in.")
    );
    const [{ buildFormFields }] = uploadSongInChunks.mock.calls[0]!;
    expect(buildFormFields()).toEqual({
      division: "Classic",
      routine_name: "",
      personal_descriptor: "",
      partner_id: "p8",
      on_behalf_of_user_id: "u9",
      event_id: "ev-1",
      submit_to_event: "true",
    });
    // Through the event's own route; the admin-wide lookup is never called.
    expect(apiGet.mock.calls.some(([path]) => String(path).startsWith("/v1/admin"))).toBe(false);
  });

  it("lets event staff upload with no partner", async () => {
    apiGet.mockReset();
    apiGet.mockResolvedValue([]);
    uploadSongInChunks.mockResolvedValue(undefined);
    renderWithQueryClient(
      <MemoryRouter>
        <SongUploadForm variant="self" onBehalf={{ userId: "u9", label: "Dana Fox", eventId: "ev-1" }} />
      </MemoryRouter>
    );
    expect(await screen.findByRole("radio", { name: "No partner" })).toBeChecked();
    chooseFile(audioFile());
    chooseDivision("Classic");
    submit();
    await waitFor(() => expect(uploadSongInChunks).toHaveBeenCalled());
    const [{ buildFormFields }] = uploadSongInChunks.mock.calls[0]!;
    expect(buildFormFields()).toMatchObject({ partner_id: "", submit_to_event: "true" });
  });

  it("says plainly when the dancer already has a song in that division", async () => {
    apiGet.mockReset();
    apiGet.mockResolvedValue([]);
    const { UploadRefused } = await import("@/lib/chunkedSongUpload");
    uploadSongInChunks.mockRejectedValue(
      new UploadRefused("This entity already has a song submitted for Classic", 409, "ENTITY_SLOT_TAKEN")
    );
    const onUploaded = vi.fn();
    renderWithQueryClient(
      <MemoryRouter>
        <SongUploadForm
          variant="self"
          onBehalf={{ userId: "u9", label: "Dana Fox", eventId: "ev-1" }}
          onUploaded={onUploaded}
        />
      </MemoryRouter>
    );
    await screen.findByRole("radiogroup", { name: "Partner" });
    chooseFile(audioFile());
    chooseDivision("Classic");
    submit();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Dana Fox already has a song submitted for Classic at this event. Nothing was uploaded."
      )
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("shows progress while uploading", async () => {
    mockLoadedSelfForm();
    let finish!: () => void;
    uploadSongInChunks.mockImplementation(({ onProgress }) => {
      onProgress({ stage: "uploading", progress: 50, bytesSent: 512 * 1024 });
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    renderForm();
    await screen.findByLabelText(/audio file/i);
    chooseFile(audioFile());
    chooseDivision("Classic");
    submit();

    expect(await screen.findByText("Uploading… 0.5 of 1.0 MB")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByText("50%")).not.toBeInTheDocument());
  });

  it("reports a failed upload and lets the dancer try again", async () => {
    mockLoadedSelfForm();
    uploadSongInChunks.mockRejectedValue(new Error("Upload session expired"));
    renderForm();
    await screen.findByLabelText(/audio file/i);
    chooseFile(audioFile());
    chooseDivision("Classic");
    submit();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Upload session expired"));
    expect(screen.getByRole("button", { name: "Upload song" })).toBeEnabled();
  });
});
