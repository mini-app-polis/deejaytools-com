// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const getToken = vi.fn();
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken }),
}));

// The chunked transport has its own tests; here we only care what the form
// hands it and how the form reacts to its progress and outcome.
const { uploadSongInChunks } = vi.hoisted(() => ({ uploadSongInChunks: vi.fn() }));
vi.mock("@/lib/chunkedSongUpload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chunkedSongUpload")>()),
  uploadSongInChunks,
}));

import SpecialUploadForm from "./SpecialUploadForm";
import { fx } from "@/test/fixtures";
import { toast } from "sonner";

const TEAM_A = fx.team({ id: "team-a", identifier: "Swing Kids" });
const TEAM_B = fx.team({ id: "team-b", identifier: "Rockets" });

type UploadArgs = {
  file: File;
  getToken: unknown;
  buildFormFields: () => Record<string, string>;
  onProgress: (p: { stage: string; progress: number; bytesSent: number }) => void;
};

function lastUpload(): UploadArgs {
  return uploadSongInChunks.mock.calls.at(-1)![0] as UploadArgs;
}

function audioFile(name = "mix.mp3", bytes = 2 * 1024 * 1024) {
  const f = new File(["x"], name, { type: "audio/mpeg" });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

function renderForm(teams: unknown[] | (() => Promise<unknown>) = [TEAM_A, TEAM_B]) {
  apiGet.mockImplementation((path: string) => {
    if (path === "/v1/teams") {
      return typeof teams === "function" ? teams() : Promise.resolve(teams);
    }
    return Promise.resolve([]);
  });
  return render(
    <MemoryRouter>
      <SpecialUploadForm />
    </MemoryRouter>
  );
}

function fileInput() {
  return screen.getByLabelText("Audio file") as HTMLInputElement;
}

describe("SpecialUploadForm", () => {
  beforeEach(() => {
    apiGet.mockReset();
    uploadSongInChunks.mockReset();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it("offers only the special divisions and keeps Upload disabled until one is chosen", async () => {
    renderForm();
    const group = await screen.findByRole("radiogroup", { name: "Division" });
    expect([...group.querySelectorAll('[role="radio"]')].map((r) => r.textContent)).toEqual([
      "Teams",
      "Cabaret",
      "Exhibition",
      "My Division Is Not Listed",
    ]);
    expect(screen.getByRole("button", { name: "Upload song" })).toBeDisabled();
  });

  it("asks for a team when Teams is chosen and pre-selects the first one", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole("radio", { name: "Teams" }));
    const teams = screen.getByRole("radiogroup", { name: "Team" });
    expect(teams).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Swing Kids" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText("Group Name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload song" })).toBeEnabled();
  });

  it("points to My Profile and blocks upload when the user has no team", async () => {
    const user = userEvent.setup();
    renderForm([]);

    await user.click(await screen.findByRole("radio", { name: "Teams" }));
    expect(screen.getByText(/you need a team to upload/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Profile" })).toHaveAttribute("href", "/my-profile");
    expect(screen.getByRole("button", { name: "Upload song" })).toBeDisabled();
  });

  it("asks for a group name for the other divisions", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole("radio", { name: "Cabaret" }));
    expect(screen.queryByRole("radiogroup", { name: "Team" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload song" })).toBeDisabled();
    await user.type(screen.getByLabelText("Group Name"), "   ");
    expect(screen.getByRole("button", { name: "Upload song" })).toBeDisabled();
    await user.type(screen.getByLabelText("Group Name"), "The Troupe");
    expect(screen.getByRole("button", { name: "Upload song" })).toBeEnabled();
  });

  it("requires an audio file", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole("radio", { name: "Teams" }));
    await user.click(screen.getByRole("button", { name: "Upload song" }));
    expect(toast.error).toHaveBeenCalledWith("Please select an audio file.");
    expect(uploadSongInChunks).not.toHaveBeenCalled();
  });

  it("rejects files over 100 MB before uploading", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole("radio", { name: "Teams" }));
    await user.upload(fileInput(), audioFile("huge.wav", 100 * 1024 * 1024 + 1));
    await user.click(screen.getByRole("button", { name: "Upload song" }));
    expect(toast.error).toHaveBeenCalledWith(
      "That file is too large. Please choose an audio file under 100 MB."
    );
    expect(uploadSongInChunks).not.toHaveBeenCalled();
  });

  it("uploads a team song with the team id, showing progress, then resets the form", async () => {
    let finish!: () => void;
    uploadSongInChunks.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve))
    );
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole("radio", { name: "Teams" }));
    await user.click(screen.getByRole("radio", { name: "Rockets" }));
    await user.type(screen.getByLabelText("Routine / Song name"), " Fever ");
    await user.type(screen.getByLabelText("Personal descriptor"), "v3");
    const file = audioFile();
    await user.upload(fileInput(), file);
    await user.click(screen.getByRole("button", { name: "Upload song" }));

    await waitFor(() => expect(uploadSongInChunks).toHaveBeenCalledTimes(1));
    const args = lastUpload();
    expect(args.file).toBe(file);
    expect(args.getToken).toBe(getToken);
    expect(args.buildFormFields()).toEqual({
      division: "Teams",
      entity_type: "team",
      team_id: "team-b",
      routine_name: "Fever",
      personal_descriptor: "v3",
    });
    expect(screen.getByRole("button", { name: "Uploading…" })).toBeDisabled();

    act(() => args.onProgress({ stage: "uploading", progress: 50, bytesSent: 1024 * 1024 }));
    expect(screen.getByText("Uploading… 1.0 of 2.0 MB")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    act(() => args.onProgress({ stage: "processing", progress: 90, bytesSent: 2 * 1024 * 1024 }));
    expect(screen.getByText(/processing your file/i)).toBeInTheDocument();
    act(() => args.onProgress({ stage: "finishing", progress: 99, bytesSent: 2 * 1024 * 1024 }));
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    await act(async () => finish());
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Song uploaded successfully."));
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Teams" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText("Routine / Song name")).toHaveValue("");
    expect(screen.getByLabelText("Personal descriptor")).toHaveValue("");
    expect(fileInput().files).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Upload song" })).toBeDisabled();
  });

  it("uploads a group song with the trimmed group name and blank optional fields", async () => {
    uploadSongInChunks.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole("radio", { name: "Exhibition" }));
    await user.type(screen.getByLabelText("Group Name"), "  The Troupe ");
    await user.upload(fileInput(), audioFile());
    await user.click(screen.getByRole("button", { name: "Upload song" }));

    await waitFor(() => expect(uploadSongInChunks).toHaveBeenCalled());
    expect(lastUpload().buildFormFields()).toEqual({
      division: "Exhibition",
      entity_type: "other",
      entity_name: "The Troupe",
      routine_name: "",
      personal_descriptor: "",
    });
  });

  it("shows the upload error and keeps what the user entered", async () => {
    uploadSongInChunks.mockRejectedValue(new Error("Drive is full"));
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole("radio", { name: "Cabaret" }));
    await user.type(screen.getByLabelText("Group Name"), "The Troupe");
    await user.upload(fileInput(), audioFile());
    await user.click(screen.getByRole("button", { name: "Upload song" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Drive is full"));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Group Name")).toHaveValue("The Troupe");
    expect(screen.getByRole("button", { name: "Upload song" })).toBeEnabled();
  });

  it("reports a failure to load teams and still renders the form", async () => {
    renderForm(() => Promise.reject(new Error("teams down")));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("teams down"));
    expect(await screen.findByRole("radiogroup", { name: "Division" })).toBeInTheDocument();
  });
});
