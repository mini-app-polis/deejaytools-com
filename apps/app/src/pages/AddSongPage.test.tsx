// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const apiGet = vi.fn();
const apiPost = vi.fn();
// Build the client object ONCE and return the same reference on every call.
// AddSongPage has `useEffect([api])` that re-runs the data load when `api`
// changes, and shows a full-page Skeleton while loading. A non-stable client
// reference would cause the effect to re-run on every render → loading stays
// true forever in tests.
const apiClient = {
  get: apiGet,
  post: apiPost,
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

const { getTokenMock } = vi.hoisted(() => ({
  getTokenMock: vi.fn<() => Promise<string | null>>(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
}));

import AddSongPage from "./AddSongPage";
import { toast } from "sonner";

function renderPage() {
  return render(
    <MemoryRouter>
      <AddSongPage />
    </MemoryRouter>
  );
}

describe("AddSongPage — mode toggle", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    getTokenMock.mockReset();
    getTokenMock.mockResolvedValue("fake-token");
  });

  it("shows the Upload for myself panel by default", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve([]);
      if (path === "/v1/auth/me") return Promise.resolve({ id: "u1", first_name: "U", last_name: "1" });
      return Promise.resolve([]);
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /add song/i })).toBeInTheDocument()
    );

    expect(screen.getByRole("button", { name: /upload for myself/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload for a managed partnership/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /claim from history/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/audio file/i)).toBeInTheDocument();
  });
});

describe("AddSongPage — managed partnerships load is non-fatal", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    getTokenMock.mockReset();
    getTokenMock.mockResolvedValue("fake-token");
  });

  it("still loads partners and the user profile when /v1/managed-partnerships rejects", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") {
        return Promise.resolve([
          { id: "partner-1", first_name: "Bob", last_name: "Jones", partner_role: "follower" },
        ]);
      }
      if (path === "/v1/auth/me") {
        return Promise.resolve({ id: "u1", first_name: "Ann", last_name: "One" });
      }
      if (path === "/v1/managed-partnerships") {
        return Promise.reject(new Error("Managed partnerships unavailable"));
      }
      return Promise.resolve([]);
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/uploading as:/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Ann One/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /partner/i })).toHaveTextContent(/bob jones/i);

    await user.click(screen.getByRole("button", { name: /upload for a managed partnership/i }));
    expect(
      await screen.findByText(/you have no managed partnerships yet/i)
    ).toBeInTheDocument();
  });
});

describe("AddSongPage — Claim from history", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    getTokenMock.mockReset();
    getTokenMock.mockResolvedValue("fake-token");
  });

  it("switches to the claim panel and searches /v1/legacy-songs as the user types", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve([]);
      if (path === "/v1/auth/me") return Promise.resolve({ id: "u1", first_name: "U", last_name: "1" });
      if (path.startsWith("/v1/legacy-songs")) {
        return Promise.resolve([
          {
            id: "L1",
            partnership: "Alice & Bob",
            division: "Classic",
            routine_name: "The Open 2025",
            descriptor: null,
            version: "The Open 2025",
            submitted_at: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderPage();

    // Wait past initial loads.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /claim from history/i })).toBeInTheDocument()
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /claim from history/i }));

    // Search input appears inline (no dialog).
    const search = await screen.findByLabelText(/search past songs/i);
    await user.type(search, "Alice");

    // Result row renders (debounced search hits the API).
    await waitFor(() => {
      expect(screen.getByText("Alice & Bob")).toBeInTheDocument();
    });
    expect(screen.getByText(/Classic · The Open 2025/)).toBeInTheDocument();
  });

  it("shows a partner-required error when claiming without a partner selected", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve([
        { id: "partner-1", first_name: "Bob", last_name: "Jones", partner_role: "follower" },
      ]);
      if (path === "/v1/auth/me") return Promise.resolve({ id: "u1", first_name: "U", last_name: "1" });
      if (path.startsWith("/v1/legacy-songs")) return Promise.resolve([
        {
          id: "L1",
          partnership: "Alice & Bob",
          division: "Classic",
          routine_name: "The Open 2025",
          descriptor: null,
          version: "The Open 2025",
          submitted_at: null,
        },
      ]);
      return Promise.resolve([]);
    });

    renderPage();

    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /claim from history/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: /claim from history/i }));

    const search = await screen.findByLabelText(/search past songs/i);
    await user.type(search, "Alice");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^claim$/i })).toBeInTheDocument()
    );

    // Click Claim without selecting a partner — should show an error, NOT call the API.
    await user.click(screen.getByRole("button", { name: /^claim$/i }));

    expect(
      await screen.findByText(/a partner is required to claim a song/i)
    ).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("calls POST /v1/songs/claim-legacy after selecting a partner and confirming", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") {
        return Promise.resolve([
          {
            id: "partner-1",
            first_name: "Bob",
            last_name: "Jones",
            partner_role: "follower",
          },
        ]);
      }
      if (path === "/v1/auth/me") return Promise.resolve({ id: "u1", first_name: "U", last_name: "1" });
      if (path.startsWith("/v1/legacy-songs")) {
        return Promise.resolve([
          {
            id: "L1",
            partnership: "Alice & Bob",
            division: "Classic",
            routine_name: "The Open 2025",
            descriptor: null,
            version: "The Open 2025",
            submitted_at: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });

    apiPost.mockResolvedValue({
      id: "song-new",
      partner_id: "partner-1",
      processed_filename: null,
      division: "Classic",
      routine_name: "The Open 2025",
      personal_descriptor: null,
      created_at: Date.now(),
      partner_first_name: "Bob",
      partner_last_name: "Jones",
    });

    renderPage();

    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /claim from history/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: /claim from history/i }));

    // Select a partner via the combobox trigger.
    const partnerTrigger = await screen.findByRole("combobox", { name: /partner/i });
    await user.click(partnerTrigger);
    await user.click(await screen.findByRole("option", { name: /bob jones/i }));

    // Type to trigger search.
    const search = screen.getByLabelText(/search past songs/i);
    await user.type(search, "Alice");

    // Wait for the Claim button.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^claim$/i })).toBeInTheDocument();
    });

    // First click shows the confirmation.
    await user.click(screen.getByRole("button", { name: /^claim$/i }));

    // Confirm step appears.
    const confirmBtn = await screen.findByRole("button", { name: /^confirm$/i });
    expect(screen.getByText(/add this song to your library/i)).toBeInTheDocument();

    // Confirming calls the API.
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        "/v1/songs/claim-legacy",
        expect.objectContaining({ legacy_song_id: "L1" })
      );
    });
  });

  it("shows the typing-prompt empty state when the search input is blank", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve([]);
      if (path === "/v1/auth/me") return Promise.resolve({ id: "u1", first_name: "U", last_name: "1" });
      if (path.startsWith("/v1/legacy-songs")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    renderPage();

    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /claim from history/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: /claim from history/i }));

    expect(
      await screen.findByText(/type a partnership or routine name to search/i)
    ).toBeInTheDocument();
  });
});

describe("AddSongPage — upload", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    getTokenMock.mockReset();
    getTokenMock.mockResolvedValue("fake-token");
    vi.mocked(toast.error).mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows Cabaret upload without a partner", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") {
        return Promise.resolve([
          {
            id: "partner-1",
            first_name: "Bob",
            last_name: "Jones",
            partner_role: "follower",
          },
        ]);
      }
      if (path === "/v1/auth/me") {
        return Promise.resolve({ id: "u1", first_name: "Ann", last_name: "One" });
      }
      return Promise.resolve([]);
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { complete: true, song: { id: "song-new" } } }),
    });

    renderPage();

    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByLabelText(/audio file/i)).toBeInTheDocument()
    );

    const partnerTrigger = screen.getByRole("combobox", { name: /partner/i });
    await user.click(partnerTrigger);
    await user.click(await screen.findByRole("option", { name: /no partner/i }));

    const divisionTrigger = screen.getByRole("combobox", { name: /division/i });
    await user.click(divisionTrigger);
    await user.click(await screen.findByRole("option", { name: /^cabaret$/i }));

    const file = new File(["audio"], "track.mp3", { type: "audio/mpeg" });
    await user.upload(screen.getByLabelText(/audio file/i), file);

    await user.click(screen.getByRole("button", { name: /upload song/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/v1/songs/upload/chunk"),
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(toast.error).not.toHaveBeenCalledWith(
      "A partner is required for this division."
    );
  });
});

describe("AddSongPage — Upload chunk loop", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  async function fillAndSubmitUpload(opts: { fileSizeBytes: number; division?: string }) {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /upload for myself/i })).toBeInTheDocument()
    );

    const fileBytes = new Uint8Array(opts.fileSizeBytes);
    const file = new File([fileBytes], "test.mp3", { type: "audio/mpeg" });
    const fileInput = screen.getByLabelText(/audio file/i) as HTMLInputElement;
    await user.upload(fileInput, file);

    const divisionTrigger = screen.getByRole("combobox", { name: /division/i });
    await user.click(divisionTrigger);
    await user.click(await screen.findByRole("option", { name: opts.division ?? "Classic" }));

    await user.click(screen.getByRole("button", { name: /upload song/i }));

    return { user };
  }

  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    getTokenMock.mockReset();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") {
        return Promise.resolve([
          { id: "partner-1", first_name: "Bob", last_name: "Jones", partner_role: "follower" },
        ]);
      }
      if (path === "/v1/auth/me") {
        return Promise.resolve({ id: "u1", first_name: "U", last_name: "1" });
      }
      return Promise.resolve([]);
    });
    fetchSpy = vi.spyOn(global, "fetch") as ReturnType<typeof vi.spyOn>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("refreshes the Clerk token before each chunk fetch", async () => {
    getTokenMock.mockResolvedValue("fresh-token");
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await fillAndSubmitUpload({ fileSizeBytes: 6 * 1024 * 1024 });

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(getTokenMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("aborts the upload with a session-expired message when getToken returns null", async () => {
    getTokenMock.mockResolvedValueOnce("valid-token").mockResolvedValueOnce(null);
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await fillAndSubmitUpload({ fileSizeBytes: 6 * 1024 * 1024 });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/session expired/i))
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the server returns 401", async () => {
    getTokenMock.mockResolvedValue("valid-token");
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 })
    );

    await fillAndSubmitUpload({ fileSizeBytes: 1024 });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Unauthorized"))
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("still retries on a transient 503 then succeeds", async () => {
    getTokenMock.mockResolvedValue("valid-token");
    fetchSpy
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /upload for myself/i })).toBeInTheDocument()
    );

    const file = new File([new Uint8Array(1024)], "test.mp3", { type: "audio/mpeg" });
    await user.upload(screen.getByLabelText(/audio file/i) as HTMLInputElement, file);

    const divisionTrigger = screen.getByRole("combobox", { name: /division/i });
    await user.click(divisionTrigger);
    await user.click(await screen.findByRole("option", { name: "Classic" }));

    vi.useFakeTimers();
    try {
      fireEvent.submit(screen.getByLabelText(/audio file/i).closest("form")!);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.runAllTimersAsync();

      expect(toast.success).toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("AddSongPage — managed partnership upload", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const samplePartnership = {
    id: "mp_1",
    user_id: "u1",
    leader_first_name: "Wendal",
    leader_last_name: "Smith",
    follower_first_name: "Lara",
    follower_last_name: "Jones",
    created_at: 1,
    updated_at: 2,
  };

  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    getTokenMock.mockReset();
    getTokenMock.mockResolvedValue("fake-token");
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/partners") return Promise.resolve([]);
      if (path === "/v1/auth/me") {
        return Promise.resolve({ id: "u1", first_name: "Ann", last_name: "One" });
      }
      if (path === "/v1/managed-partnerships") return Promise.resolve([samplePartnership]);
      return Promise.resolve([]);
    });
    fetchSpy = vi.spyOn(global, "fetch") as ReturnType<typeof vi.spyOn>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("uploads via /v1/songs/upload/chunk with managed_partnership_id", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ data: { received: true, complete: true }, meta: { version: "v1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /upload for a managed partnership/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: /upload for a managed partnership/i }));

    await waitFor(() => {
      expect(screen.getByText(/leader: wendal smith · follower: lara jones/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("combobox", { name: /^partner$/i })).toBeNull();

    const divisionTrigger = screen.getByRole("combobox", { name: /division/i });
    await user.click(divisionTrigger);
    await user.click(await screen.findByRole("option", { name: /^classic$/i }));

    const file = new File(["audio"], "routine.mp3", { type: "audio/mpeg" });
    await user.upload(screen.getByLabelText(/audio file/i), file);

    await user.click(screen.getByRole("button", { name: /upload song/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/v1/songs/upload/chunk"),
        expect.objectContaining({ method: "POST" })
      );
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.get("managed_partnership_id")).toBe("mp_1");
    expect(body.get("partner_id")).toBeNull();
    expect(body.get("division")).toBe("Classic");

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Song uploaded successfully.");
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(apiPost).not.toHaveBeenCalled();
  });
});
