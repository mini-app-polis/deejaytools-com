// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const apiGet = vi.fn();
const apiPost = vi.fn();
const apiPatch = vi.fn();
const apiDel = vi.fn();
const apiPut = vi.fn();
const apiClient = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  put: apiPut,
  del: apiDel,
  postForm: vi.fn(),
};

vi.mock("@/api/client", () => ({
  useApiClient: () => apiClient,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/useAuthMe", () => ({
  useAuthMe: () => ({
    me: { id: "admin_1", email: "admin@example.com", role: "admin" },
    loading: false,
    isAdmin: true,
  }),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: () => Promise.resolve("fake-token") }),
}));

import AdminPage from "./AdminPage";
import { toast } from "sonner";
import { fx } from "@/test/fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Each admin section is now its own route (`/admin/:section`), so tests
 * pick the section they want to exercise via `initialEntries`. Defaults
 * to the events page, which is also where bare `/admin` lands.
 */
function renderPage(path: string = "/admin/events") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/:section" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdminPage", () => {
  beforeEach(() => {
    // Reset all mocks including toast spies so prior-test calls don't leak.
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    apiGet.mockReset();
    apiPost.mockReset();
    apiPatch.mockReset();
    apiDel.mockReset();
  });

  it("renders the Admin heading and the events section without crashing", async () => {
    apiGet.mockResolvedValue([]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );
    // The Events section is the default landing page; assert the action
    // button it owns is visible, since the in-page tab strip no longer
    // exists (admin sections are now navbar-dropdown routes).
    expect(screen.getByRole("button", { name: /new event/i })).toBeInTheDocument();
  });

  it("shows loading skeleton for events before data arrives", async () => {
    // Delay the events response so we can capture the loading state.
    apiGet.mockImplementation((path: string) => {
      if (path === "/v1/events") {
        return new Promise(() => {});
      }
      return Promise.resolve([]);
    });
    renderPage();

    // The initial render should show a skeleton while loading=true.
    await waitFor(() => {
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  it("renders empty state for events when API returns empty array", async () => {
    apiGet.mockResolvedValue([]);
    renderPage();

    // Wait for the events table to render.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );

    // Events tab now groups into status boxes; empty events → "Active"/"Upcoming" boxes showing "None."
    expect(screen.getByRole("heading", { name: /^active$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/^none\.$/i).length).toBeGreaterThan(0);
  });

  it("shows toast error when events API call fails", async () => {
    const error = new Error("Failed to load events");
    // Reject the first call (events) and resolve all subsequent calls with []
    // so the component doesn't crash on runs/users/sessions endpoints.
    apiGet.mockRejectedValueOnce(error);
    apiGet.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load events");
    });
  });

  it("disables the Create Event submit button when name is empty", async () => {
    apiGet.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    // Wait for page to load.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );

    // Open the New Event dialog.
    await user.click(screen.getByRole("button", { name: /new event/i }));

    await waitFor(() => {
      const h2s = screen.getAllByText(/new event/i);
      expect(h2s.length).toBeGreaterThan(0);
    });

    // Submit the form directly (bypasses HTML5 required-field validation so the
    // React onSubmit handler can run its own guards, e.g. "Name is required").
    const submitBtn = screen.getByRole("button", { name: /create event/i });
    fireEvent.submit(submitBtn.closest("form")!);

    // Should show a validation error toast.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Name is required");
    });
  });

  it("shows toast error when event creation fails on the API", async () => {
    apiGet.mockResolvedValue([]);
    const createError = new Error("Event name already exists");
    apiPost.mockRejectedValueOnce(createError);

    const user = userEvent.setup();
    renderPage();

    // Wait for page to load.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );

    // Open the New Event dialog.
    await user.click(screen.getByRole("button", { name: /new event/i }));

    await waitFor(() => {
      const headers = screen.getAllByText(/new event/i);
      expect(headers.length).toBeGreaterThan(0);
    });

    // Submit directly (bypasses HTML5 required-field validation).
    const submitBtn = screen.getByRole("button", { name: /create event/i });
    fireEvent.submit(submitBtn.closest("form")!);

    // Validation fires before the API call: toast.error("Name is required").
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Name is required");
    });
  });

  it("renders the right section for each /admin/<section> route", async () => {
    apiGet.mockResolvedValue([]);

    // Events section → owns the "New Event" button.
    const { unmount } = renderPage("/admin/events");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /new event/i })).toBeInTheDocument()
    );
    unmount();

    // Sessions section → owns the "New Session" button.
    const sessionsRender = renderPage("/admin/sessions");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /new session/i })).toBeInTheDocument()
    );
    sessionsRender.unmount();

    // Users section → owns the user search input placeholder.
    renderPage("/admin/users");
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/search by name or email/i)).toBeInTheDocument()
    );
  });

  it("shows error toast when session creation is missing required fields", async () => {
    apiGet.mockResolvedValue([]);
    const user = userEvent.setup();
    // The Sessions section is now its own route — render it directly
    // rather than clicking a tab that no longer exists.
    renderPage("/admin/sessions");

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /admin/i })).toBeInTheDocument()
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new session/i })).toBeInTheDocument();
    });

    // Open the New Session dialog.
    const newSessionBtn = screen.getByRole("button", { name: /new session/i });
    await user.click(newSessionBtn);

    await waitFor(() => {
      const headers = screen.getAllByText(/new session/i);
      expect(headers.length).toBeGreaterThan(0);
    });

    // Submit directly (bypasses HTML5 required-field validation so the
    // React onSubmit handler runs and checks sessEventId first).
    const submitBtn = screen.getByRole("button", { name: /create session/i });
    fireEvent.submit(submitBtn.closest("form")!);

    // Should show validation error.
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Select an event");
    });
  });

  it("renders Run History with All events and All sessions card pickers", async () => {
    apiGet.mockResolvedValue([]);
    renderPage("/admin/runs");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^all events$/i })).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /^all sessions$/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/runs\?limit=500$/)
      );
    });
  });

  it("shows partnership breakdown chips and combined filter empty state", async () => {
    const mockRuns = [
      {
        id: "run-1",
        completed_at: 3,
        division_name: "Classic",
        session_id: "s1",
        session_floor_trial_starts_at: 1,
        event_id: "e1",
        event_name: "Test Event",
        song_id: "song-1",
        song_label: "Song A",
        entity_label: "Alice & Bob",
        entity_key: "pair:pair-1",
        completed_by_label: "Admin",
      },
      {
        id: "run-2",
        completed_at: 2,
        division_name: "Teams",
        session_id: "s1",
        session_floor_trial_starts_at: 1,
        event_id: "e1",
        event_name: "Test Event",
        song_id: "song-2",
        song_label: "Song B",
        entity_label: "Alice & Bob",
        entity_key: "pair:pair-1",
        completed_by_label: "Admin",
      },
      {
        id: "run-3",
        completed_at: 1,
        division_name: "Classic",
        session_id: "s1",
        session_floor_trial_starts_at: 1,
        event_id: "e1",
        event_name: "Test Event",
        song_id: "song-3",
        song_label: "Song C",
        entity_label: "Carol Solo",
        entity_key: "solo:user-1",
        completed_by_label: "Admin",
      },
    ];
    apiGet.mockImplementation((path: string) => {
      if (path.startsWith("/v1/runs")) return Promise.resolve(mockRuns);
      return Promise.resolve([]);
    });

    const user = userEvent.setup();
    renderPage("/admin/runs");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /all partnerships \(2\)/i })).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /alice & bob \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /carol solo \(1\)/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^teams \(1\)$/i }));
    await user.click(screen.getByRole("button", { name: /carol solo \(1\)/i }));

    await waitFor(() =>
      expect(screen.getByText(/no runs match the active filters/i)).toBeInTheDocument()
    );
    expect(screen.getAllByRole("button", { name: /clear all filters/i }).length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Behaviour per section, with schema-valid data
// ---------------------------------------------------------------------------

/** 7:00 AM CDT on Saturday May 23 2026. */
const SAT_7AM = Date.UTC(2026, 4, 23, 12, 0);
const MIN = 60_000;

const EV_ACTIVE = fx.event({ id: "e1", name: "Swing Fling", status: "active", start_date: "2026-05-22", end_date: "2026-05-24" });
const EV_UPCOMING = fx.event({ id: "e2", name: "Future Fest", status: "upcoming", start_date: "2026-11-01", end_date: "2026-11-02", season_year: "2027" });
const EV_DONE = fx.event({ id: "e3", name: "Old Jam", status: "completed", start_date: "2025-03-01", end_date: "2025-03-02" });
const EV_CANCELLED = fx.event({ id: "e4", name: "Rained Out", status: "cancelled", start_date: "2025-04-01", end_date: "2025-04-02" });

const SESS_OPEN = fx.session({
  id: "s1",
  event_id: "e1",
  status: "checkin_open",
  date: "2026-05-23",
  event_timezone: "America/Chicago",
  checkin_opens_at: SAT_7AM - 45 * MIN,
  floor_trial_starts_at: SAT_7AM,
  floor_trial_ends_at: SAT_7AM + 180 * MIN,
  active_priority_max: 5,
  active_non_priority_max: 3,
  divisions: [
    { id: "d1", division_name: "Classic", is_priority: true, sort_order: 0, priority_run_limit: 2 },
    { id: "d2", division_name: "Showcase", is_priority: false, sort_order: 1, priority_run_limit: null },
  ],
});
const SESS_DONE = fx.session({
  id: "s2",
  event_id: "e3",
  status: "completed",
  date: "2025-03-01",
  event_timezone: "America/Chicago",
  checkin_opens_at: Date.UTC(2025, 2, 1, 18, 0),
  floor_trial_starts_at: Date.UTC(2025, 2, 1, 19, 0),
  floor_trial_ends_at: Date.UTC(2025, 2, 1, 21, 0),
});
const SESS_OPEN_TITLE = "Saturday - 7:00 AM - May 23, 2026";

type GetRoutes = Record<string, unknown | ((path: string) => unknown)>;

/** Route GETs by path (query string ignored); unknown paths return []. */
function routeGets(routes: GetRoutes) {
  apiGet.mockImplementation((path: string) => {
    const base = path.split("?")[0];
    if (base in routes) {
      const r = routes[base];
      if (typeof r === "function") {
        try {
          return Promise.resolve((r as (p: string) => unknown)(path));
        } catch (e) {
          return Promise.reject(e);
        }
      }
      return Promise.resolve(r);
    }
    return Promise.resolve([]);
  });
}

/** The page's form labels are siblings of their controls, not `for=` linked. */
function field(label: string | RegExp) {
  const el = screen.getByText(label, { selector: "label" });
  return el.parentElement!.querySelector("input, select") as HTMLInputElement;
}

function renderWithDetailRoutes(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/:section" element={<AdminPage />} />
        <Route path="/events/:id" element={<p>event detail page</p>} />
        <Route path="/sessions/:id" element={<p>session detail page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function resetAll() {
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
  apiGet.mockReset();
  apiPost.mockReset();
  apiPatch.mockReset();
  apiPut.mockReset();
  apiDel.mockReset();
}

describe("AdminPage — Events section", () => {
  beforeEach(resetAll);

  it("buckets events by status and only shows completed/cancelled when asked", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE, EV_UPCOMING, EV_DONE, EV_CANCELLED] });
    const user = userEvent.setup();
    renderPage("/admin/events");

    expect(await screen.findByText("Swing Fling")).toBeInTheDocument();
    expect(screen.getByText("Future Fest")).toBeInTheDocument();
    expect(screen.queryByText("Old Jam")).not.toBeInTheDocument();
    expect(screen.queryByText("Rained Out")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^completed$/i })).not.toBeInTheDocument();

    const [showCompleted, showCancelled] = screen.getAllByRole("checkbox");
    await user.click(showCompleted);
    expect(screen.getByRole("heading", { name: /^completed$/i })).toBeInTheDocument();
    expect(screen.getByText("Old Jam")).toBeInTheDocument();

    await user.click(showCancelled);
    expect(screen.getByRole("heading", { name: /^cancelled$/i })).toBeInTheDocument();
    expect(screen.getByText("Rained Out")).toBeInTheDocument();
  });

  it("navigates to the event detail page when a row is clicked, but not from its buttons", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE] });
    const user = userEvent.setup();
    renderWithDetailRoutes("/admin/events");

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.queryByText("event detail page")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit event" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "✕" }));

    await user.click(screen.getByText("Swing Fling"));
    expect(await screen.findByText("event detail page")).toBeInTheDocument();
  });

  it("creates an event, defaulting the season year from the start date", async () => {
    routeGets({ "/v1/events": [] });
    const created = fx.event({
      id: "new-1",
      name: "Halloween Swing",
      start_date: "2026-10-30",
      end_date: "2026-11-01",
      season_year: "2027",
      timezone: "America/New_York",
    });
    apiPost.mockResolvedValue(created);
    const user = userEvent.setup();
    renderPage("/admin/events");

    await user.click(await screen.findByRole("button", { name: /new event/i }));
    await user.type(field("Name"), "  Halloween Swing ");
    fireEvent.change(field("Start date"), { target: { value: "2026-10-30" } });
    // October rolls the season over to the next year.
    expect(field("Season year")).toHaveValue("2027");
    fireEvent.change(field("End date"), { target: { value: "2026-11-01" } });
    await user.selectOptions(field("Timezone"), "America/New_York");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/events", {
        name: "Halloween Swing",
        start_date: "2026-10-30",
        end_date: "2026-11-01",
        timezone: "America/New_York",
        season_year: "2027",
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Event created");
    expect(screen.queryByRole("heading", { name: "New event" })).not.toBeInTheDocument();
    expect(screen.getByText("Halloween Swing")).toBeInTheDocument();
  });

  it("keeps a season year the admin typed when the start date changes", async () => {
    routeGets({ "/v1/events": [] });
    const user = userEvent.setup();
    renderPage("/admin/events");

    await user.click(await screen.findByRole("button", { name: /new event/i }));
    await user.type(field("Season year"), "2030");
    fireEvent.change(field("Start date"), { target: { value: "2026-10-30" } });
    expect(field("Season year")).toHaveValue("2030");
  });

  it("pulls the end date forward when the start date moves past it", async () => {
    routeGets({ "/v1/events": [] });
    const user = userEvent.setup();
    renderPage("/admin/events");

    await user.click(await screen.findByRole("button", { name: /new event/i }));
    fireEvent.change(field("Start date"), { target: { value: "2026-05-01" } });
    fireEvent.change(field("End date"), { target: { value: "2026-05-02" } });
    fireEvent.change(field("Start date"), { target: { value: "2026-05-10" } });
    expect(field("End date")).toHaveValue("2026-05-10");
  });

  type EventForm = { name: string; start?: string; end?: string; season?: string };
  it.each<[EventForm, string]>([
    [{ name: "X" }, "Start date is required"],
    [{ name: "X", start: "2026-05-01" }, "End date is required"],
    [{ name: "X", start: "2026-05-10", end: "2026-05-01" }, "End date must be on or after start date"],
    [{ name: "X", start: "2026-05-01", end: "2026-05-02", season: "26" }, "Season year must be four digits"],
  ])("rejects an invalid event form %j with %s", async (form, message) => {
    routeGets({ "/v1/events": [] });
    const user = userEvent.setup();
    renderPage("/admin/events");

    await user.click(await screen.findByRole("button", { name: /new event/i }));
    await user.type(field("Name"), form.name);
    if (form.start) fireEvent.change(field("Start date"), { target: { value: form.start } });
    // Set end after start so the start handler doesn't clamp it.
    if (form.end) fireEvent.change(field("End date"), { target: { value: form.end } });
    if (form.season) {
      await user.clear(field("Season year"));
      await user.type(field("Season year"), form.season);
    }
    fireEvent.submit(screen.getByRole("button", { name: "Create event" }).closest("form")!);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("shows the API's message and keeps the dialog open when creation fails", async () => {
    routeGets({ "/v1/events": [] });
    apiPost.mockRejectedValue(new Error("Event name already exists"));
    const user = userEvent.setup();
    renderPage("/admin/events");

    await user.click(await screen.findByRole("button", { name: /new event/i }));
    await user.type(field("Name"), "Dup");
    fireEvent.change(field("Start date"), { target: { value: "2026-05-01" } });
    fireEvent.change(field("End date"), { target: { value: "2026-05-01" } });
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Event name already exists"));
    expect(screen.getByRole("heading", { name: "New event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create event" })).toBeEnabled();
  });

  it("edits an event with a PATCH pre-filled from the row and updates it in place", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE] });
    apiPatch.mockResolvedValue({ ...EV_ACTIVE, name: "Swing Fling 2026" });
    const user = userEvent.setup();
    renderPage("/admin/events");

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(field("Name")).toHaveValue("Swing Fling");
    expect(field("Start date")).toHaveValue("2026-05-22");
    expect(field("Season year")).toHaveValue("2026");
    expect(field("Timezone")).toHaveValue("America/Chicago");

    // Editing the start date must not overwrite the stored season year.
    fireEvent.change(field("Start date"), { target: { value: "2026-05-21" } });
    expect(field("Season year")).toHaveValue("2026");

    await user.type(field("Name"), " 2026");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/v1/events/e1", {
        name: "Swing Fling 2026",
        start_date: "2026-05-21",
        end_date: "2026-05-24",
        timezone: "America/Chicago",
        season_year: "2026",
      })
    );
    expect(apiPost).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Event updated");
    expect(await screen.findByText("Swing Fling 2026")).toBeInTheDocument();
  });

  it("deletes an event only after confirmation", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE, EV_UPCOMING] });
    apiDel.mockResolvedValue({ deleted: true });
    const user = userEvent.setup();
    renderPage("/admin/events");

    await screen.findByText("Swing Fling");
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("This will permanently delete Swing Fling");

    // Cancel first: nothing is deleted.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(apiDel).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    const confirm = await screen.findByRole("dialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/events/e1"));
    expect(toast.success).toHaveBeenCalledWith("Event deleted");
    await waitFor(() => expect(screen.queryByText("Swing Fling")).not.toBeInTheDocument());
    expect(screen.getByText("Future Fest")).toBeInTheDocument();
  });

  it("keeps the event and shows the error when deletion fails", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE] });
    apiDel.mockRejectedValue(new Error("Event has sessions"));
    const user = userEvent.setup();
    renderPage("/admin/events");

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Event has sessions"));
    expect(screen.getByText("Swing Fling")).toBeInTheDocument();
  });
});

describe("AdminPage — Sessions section", () => {
  beforeEach(resetAll);

  it("lists active sessions with their event and times, hiding completed until toggled", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE, EV_DONE], "/v1/sessions": [SESS_OPEN, SESS_DONE] });
    const user = userEvent.setup();
    renderPage("/admin/sessions");

    const title = await screen.findByText(SESS_OPEN_TITLE);
    const row = title.closest("tr")!;
    expect(row).toHaveTextContent("Swing Fling");
    expect(row).toHaveTextContent("CDT");
    expect(row).toHaveTextContent("checkin_open");
    expect(row).toHaveTextContent("6:15 AM");
    expect(row).toHaveTextContent("10:00 AM");
    expect(screen.queryByText(/March 1, 2025/)).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText(/March 1, 2025/)).toBeInTheDocument();
  });

  it("navigates to the session page on row click", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE], "/v1/sessions": [SESS_OPEN] });
    const user = userEvent.setup();
    renderWithDetailRoutes("/admin/sessions");

    await user.click(await screen.findByText(SESS_OPEN_TITLE));
    expect(await screen.findByText("session detail page")).toBeInTheDocument();
  });

  it("creates a session in the event's timezone with every division and the chosen priorities", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE], "/v1/sessions": [] });
    apiPost.mockResolvedValue(SESS_OPEN);
    const user = userEvent.setup();
    renderPage("/admin/sessions");

    await user.click(await screen.findByRole("button", { name: /new session/i }));
    // The first event and its start date are pre-selected.
    expect(field("Event")).toHaveValue("e1");
    expect(field("Date")).toHaveValue("2026-05-22");
    fireEvent.change(field("Date"), { target: { value: "2026-05-23" } });
    expect(screen.getByText(/^Start time/, { selector: "label" })).toHaveTextContent("(CDT)");
    await user.selectOptions(field("Check-in opens"), "45");
    await user.selectOptions(field("Floor trial duration"), "180");
    await user.clear(field("Priority run limit"));
    await user.type(field("Priority run limit"), "2");
    await user.click(screen.getByRole("checkbox", { name: /^Classic/ }));
    expect(screen.getByRole("checkbox", { name: /^Classic/ }).closest("label")).toHaveTextContent(
      "Classicpriority"
    );

    await user.click(screen.getByRole("button", { name: "Create session" }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const [path, body] = apiPost.mock.calls[0];
    expect(path).toBe("/v1/sessions");
    expect(body).toMatchObject({
      event_id: "e1",
      name: "Saturday, May 23, 2026",
      date: "2026-05-23",
      floor_trial_starts_at: SAT_7AM,
      checkin_opens_at: SAT_7AM - 45 * MIN,
      floor_trial_ends_at: SAT_7AM + 180 * MIN,
      active_priority_max: 6,
      active_non_priority_max: 4,
    });
    expect(body.divisions).toHaveLength(17);
    expect(body.divisions[0]).toEqual({
      division_name: "Classic",
      is_priority: true,
      sort_order: 0,
      priority_run_limit: 2,
    });
    expect(body.divisions[1]).toEqual({
      division_name: "Showcase",
      is_priority: false,
      sort_order: 1,
      priority_run_limit: 0,
    });
    expect(toast.success).toHaveBeenCalledWith("Session created");
    // The list is reloaded after a save.
    await waitFor(() =>
      expect(apiGet.mock.calls.filter(([p]) => p === "/v1/sessions")).toHaveLength(2)
    );
  });

  it("changes the date to the newly selected event's start date", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE, EV_UPCOMING], "/v1/sessions": [] });
    const user = userEvent.setup();
    renderPage("/admin/sessions");

    await user.click(await screen.findByRole("button", { name: /new session/i }));
    await user.selectOptions(field("Event"), "e2");
    expect(field("Date")).toHaveValue("2026-11-01");
  });

  type Caps = { priority?: string; nonPriority?: string; runLimit?: string };
  it.each<[Caps, string]>([
    [{ priority: "-1" }, "Active cap (priority) must be a non-negative number"],
    [{ nonPriority: "-1" }, "Active cap (non-priority) must be a non-negative number"],
    [{ priority: "2", nonPriority: "3" }, "Non-priority cap must be ≤ priority cap"],
    [{ runLimit: "-1" }, "Priority run limit must be a non-negative number"],
  ])("rejects session caps %j with %s", async (caps, message) => {
    routeGets({ "/v1/events": [EV_ACTIVE], "/v1/sessions": [] });
    const user = userEvent.setup();
    renderPage("/admin/sessions");

    await user.click(await screen.findByRole("button", { name: /new session/i }));
    if (caps.priority) fireEvent.change(field("Active cap (priority)"), { target: { value: caps.priority } });
    if (caps.nonPriority) fireEvent.change(field("Active cap (non-priority)"), { target: { value: caps.nonPriority } });
    if (caps.runLimit) fireEvent.change(field("Priority run limit"), { target: { value: caps.runLimit } });
    fireEvent.submit(screen.getByRole("button", { name: "Create session" }).closest("form")!);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("requires a date and start time", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE], "/v1/sessions": [] });
    const user = userEvent.setup();
    renderPage("/admin/sessions");

    await user.click(await screen.findByRole("button", { name: /new session/i }));
    fireEvent.change(field("Date"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create session" }).closest("form")!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Date is required"));

    fireEvent.change(field("Date"), { target: { value: "2026-05-23" } });
    fireEvent.change(field(/^Start time/), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create session" }).closest("form")!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Start time is required"));
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("pre-fills the edit form from the session and saves with PATCH then PUT", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE], "/v1/sessions": [SESS_OPEN] });
    apiPatch.mockResolvedValue(SESS_OPEN);
    apiPut.mockResolvedValue(SESS_OPEN);
    const user = userEvent.setup();
    renderPage("/admin/sessions");

    await screen.findByText(SESS_OPEN_TITLE);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("heading", { name: "Edit session" })).toBeInTheDocument();
    expect(field(/^Start time/)).toHaveValue("07:00");
    expect(field("Check-in opens")).toHaveValue("45");
    expect(field("Floor trial duration")).toHaveValue("180");
    expect(field("Active cap (priority)")).toHaveValue(5);
    expect(field("Active cap (non-priority)")).toHaveValue(3);
    expect(field("Priority run limit")).toHaveValue(2);
    expect(screen.getByRole("checkbox", { name: /^Classic/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^Showcase/ })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(apiPut).toHaveBeenCalled());
    expect(apiPatch).toHaveBeenCalledWith(
      "/v1/sessions/s1",
      expect.objectContaining({
        event_id: "e1",
        floor_trial_starts_at: SAT_7AM,
        checkin_opens_at: SAT_7AM - 45 * MIN,
        floor_trial_ends_at: SAT_7AM + 180 * MIN,
        active_priority_max: 5,
        active_non_priority_max: 3,
      })
    );
    const [putPath, putBody] = apiPut.mock.calls[0];
    expect(putPath).toBe("/v1/sessions/s1/divisions");
    expect(putBody.divisions[0]).toMatchObject({ division_name: "Classic", is_priority: true, priority_run_limit: 2 });
    expect(apiPost).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Session updated");
  });

  it("says which leg failed when the field update succeeds but the divisions update does not", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE], "/v1/sessions": [SESS_OPEN] });
    apiPatch.mockResolvedValue(SESS_OPEN);
    apiPut.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderPage("/admin/sessions");

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Session fields saved, but failed to update divisions: boom"
      )
    );
    expect(screen.getByRole("heading", { name: "Edit session" })).toBeInTheDocument();
  });

  it("does not touch divisions when the field update fails", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE], "/v1/sessions": [SESS_OPEN] });
    apiPatch.mockRejectedValue(new Error("nope"));
    const user = userEvent.setup();
    renderPage("/admin/sessions");

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to update session fields: nope")
    );
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("deletes a session after a cascade warning", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE], "/v1/sessions": [SESS_OPEN] });
    apiDel.mockResolvedValue({ deleted: true });
    const user = userEvent.setup();
    renderPage("/admin/sessions");

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(SESS_OPEN_TITLE);
    expect(dialog).toHaveTextContent(/cascade-delete every check-in/);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/sessions/s1"));
    expect(toast.success).toHaveBeenCalledWith("Session deleted");
    await waitFor(() => expect(screen.queryByText(SESS_OPEN_TITLE)).not.toBeInTheDocument());
  });

  it("keeps the session and shows the error when deletion fails", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE], "/v1/sessions": [SESS_OPEN] });
    apiDel.mockRejectedValue(new Error("Session in progress"));
    const user = userEvent.setup();
    renderPage("/admin/sessions");

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Session in progress"));
    expect(screen.getByText(SESS_OPEN_TITLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });
});

describe("AdminPage — Run History section", () => {
  beforeEach(resetAll);

  it("hides upcoming events until 'Show future events' is on, and refetches by event then session", async () => {
    routeGets({
      "/v1/events": [EV_ACTIVE, EV_UPCOMING],
      "/v1/sessions": [SESS_OPEN, SESS_DONE],
      "/v1/runs": [],
    });
    const user = userEvent.setup();
    renderPage("/admin/runs");

    await screen.findByRole("button", { name: /swing fling/i });
    expect(screen.queryByRole("button", { name: /future fest/i })).not.toBeInTheDocument();
    expect(screen.getByText("No runs recorded yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /show future events/i }));
    expect(screen.getByRole("button", { name: /future fest/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /swing fling/i }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/runs?limit=500&event_id=e1"));
    expect(await screen.findByText("No runs recorded for Swing Fling yet.")).toBeInTheDocument();
    // Only that event's sessions are offered.
    expect(screen.queryByRole("button", { name: /March 1, 2025/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: SESS_OPEN_TITLE }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/runs?limit=500&session_id=s1"));
    expect(
      await screen.findByText(`No runs recorded for ${SESS_OPEN_TITLE} yet.`)
    ).toBeInTheDocument();
  });

  it("clears an upcoming event selection when future events are hidden again", async () => {
    routeGets({ "/v1/events": [EV_ACTIVE, EV_UPCOMING], "/v1/runs": [] });
    const user = userEvent.setup();
    renderPage("/admin/runs");

    const toggle = await screen.findByRole("checkbox", { name: /show future events/i });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: /future fest/i }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/runs?limit=500&event_id=e2"));

    apiGet.mockClear();
    await user.click(toggle);
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/runs?limit=500"));
    expect(screen.getByText("No runs recorded yet.")).toBeInTheDocument();
  });

  it("renders each run with its entity, song, session and who completed it", async () => {
    const runs = [
      fx.run({
        id: "r1",
        session_id: "s1",
        event_id: "e1",
        event_name: "Swing Fling",
        entity_label: "Ann & Bo",
        song_label: "Ann & Bo Classic 2026",
        completed_by_label: "DJ Kai",
      }),
      fx.run({
        id: "r2",
        session_id: "gone",
        event_id: "e1",
        session_floor_trial_starts_at: SAT_7AM,
        entity_label: "Cy & Di",
      }),
      fx.run({ id: "r3", session_id: "gone", entity_label: "Ed Solo", entity_key: "solo:ed" }),
    ];
    routeGets({ "/v1/events": [EV_ACTIVE], "/v1/sessions": [SESS_OPEN], "/v1/runs": runs });
    renderPage("/admin/runs");

    const first = (await screen.findByText("Ann & Bo", { selector: "p" })).parentElement!;
    expect(first).toHaveTextContent("Ann & Bo Classic 2026");
    expect(first).toHaveTextContent(`${SESS_OPEN_TITLE} · Swing Fling`);
    expect(first.parentElement).toHaveTextContent("by DJ Kai");
    // A session no longer in the list falls back to the run's own start time,
    // shown in the event's timezone.
    expect(screen.getByText("Cy & Di", { selector: "p" }).parentElement).toHaveTextContent(
      SESS_OPEN_TITLE
    );
    expect(screen.getByText("Ed Solo", { selector: "p" }).parentElement).toHaveTextContent(
      "Unknown session"
    );
    expect(screen.getByText("3 runs")).toBeInTheDocument();
  });

  it("warns when the fetch limit is hit and collapses partnerships beyond ten", async () => {
    const runs = Array.from({ length: 500 }, (_, i) =>
      fx.run({ id: `r${i}`, entity_key: `pair:${i % 11}`, entity_label: `Pair ${i % 11}` })
    );
    routeGets({ "/v1/runs": runs });
    const user = userEvent.setup();
    renderPage("/admin/runs");

    expect(
      await screen.findByText(/showing the first 500 runs only/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all partnerships \(11\)/i })).toBeInTheDocument();
    const showAll = screen.getByRole("button", { name: "Show all (1)" });
    await user.click(showAll);
    expect(screen.queryByRole("button", { name: /^show all/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Pair \d+ \(\d+\)$/ })).toHaveLength(11);
  });

  it("filters by division and partnership, describing and clearing the active filters", async () => {
    const runs = [
      fx.run({ id: "r1", division_name: "Classic", entity_key: "pair:a", entity_label: "Ann & Bo" }),
      fx.run({ id: "r2", division_name: "Showcase", entity_key: "pair:a", entity_label: "Ann & Bo" }),
      fx.run({ id: "r3", division_name: "  ", entity_key: "pair:c", entity_label: "Cy & Di" }),
    ];
    routeGets({ "/v1/runs": runs });
    const user = userEvent.setup();
    renderPage("/admin/runs");

    // Blank division names are grouped as "Unspecified".
    await user.click(await screen.findByRole("button", { name: "Unspecified (1)" }));
    expect(screen.getByText("Division: Unspecified")).toBeInTheDocument();
    expect(screen.getAllByText("Cy & Di", { selector: "p" })).toHaveLength(1);
    expect(screen.queryByText("Ann & Bo", { selector: "p" })).not.toBeInTheDocument();

    // Clicking an active chip again toggles it off.
    await user.click(screen.getByRole("button", { name: "Unspecified (1)" }));
    expect(screen.queryByText(/^Division:/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ann & Bo (2)" }));
    expect(screen.getByText("Partnership: Ann & Bo")).toBeInTheDocument();
    expect(screen.getAllByText("Ann & Bo", { selector: "p" })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Unspecified (1)" }));
    expect(
      screen.getByText(/no runs match the active filters\. showing runs in unspecified for ann & bo\./i)
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /clear all filters/i })[0]);
    expect(screen.getAllByText(/& /, { selector: "p.font-medium" })).toHaveLength(3);
    expect(screen.queryByText(/^Filters:/)).not.toBeInTheDocument();
  });

  it("refreshes on demand and reports a load failure", async () => {
    let fail = false;
    routeGets({
      "/v1/runs": () => {
        if (fail) throw new Error("runs down");
        return [];
      },
    });
    const user = userEvent.setup();
    renderPage("/admin/runs");

    await screen.findByText("0 runs");
    fail = true;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("runs down"));
  });
});

describe("AdminPage — Songs section", () => {
  beforeEach(resetAll);

  const SONG_A = fx.adminSong({
    id: "a",
    song_label: "Ann & Bo Classic 2026 v01",
    division: "Classic",
    season_year: "2026",
    routine_name: "Fever",
    personal_descriptor: "98%",
    is_legacy: true,
    created_at: 3,
    owner: { id: "u1", email: "ann@example.com", full_name: "Ann Lee" },
    partner: { id: "p1", full_name: "Bo Kim", linked_user_email: "bo@example.com" },
  });
  const SONG_B = fx.adminSong({
    id: "b",
    song_label: "Cy Showcase 2025 v02",
    division: "Showcase",
    season_year: "2025",
    created_at: 2,
    deleted_at: 5,
    owner: { id: "u2", email: "cy@example.com", full_name: null },
  });

  it("shows each song's owner, partner, division and status badges", async () => {
    routeGets({ "/v1/admin/songs": [SONG_A, SONG_B] });
    renderPage("/admin/songs");

    const cardA = (await screen.findByText(SONG_A.song_label)).closest("div.rounded-lg")!;
    expect(within(cardA as HTMLElement).getByText("Legacy")).toBeInTheDocument();
    expect(cardA).toHaveTextContent("Ann Lee");
    expect(cardA).toHaveTextContent("ann@example.com");
    expect(cardA).toHaveTextContent("Bo Kim");
    expect(cardA).toHaveTextContent("linked: bo@example.com");
    expect(cardA).toHaveTextContent("Fever");
    expect(cardA).toHaveTextContent("98%");

    const cardB = screen.getByText(SONG_B.song_label).closest("div.rounded-lg")!;
    expect(within(cardB as HTMLElement).getByText("deleted")).toBeInTheDocument();
    // No full name: the email stands in as the owner label, and there's no partner.
    expect(cardB).toHaveTextContent("cy@example.com");
    expect(cardB).toHaveTextContent("Partner—");
    expect(screen.getByText("2 songs")).toBeInTheDocument();
  });

  it("filters by year and division, with an empty state when nothing matches", async () => {
    routeGets({ "/v1/admin/songs": [SONG_A, SONG_B] });
    const user = userEvent.setup();
    renderPage("/admin/songs");

    await screen.findByText(SONG_A.song_label);
    const years = screen.getByRole("radiogroup", { name: "Filter by year" });
    const divisions = screen.getByRole("radiogroup", { name: "Filter by division" });
    expect(within(years).getAllByRole("radio").map((r) => r.textContent)).toEqual(["All", "2026", "2025"]);

    await user.click(within(years).getByRole("radio", { name: "2025" }));
    expect(screen.queryByText(SONG_A.song_label)).not.toBeInTheDocument();
    expect(screen.getByText(SONG_B.song_label)).toBeInTheDocument();
    expect(screen.getByText("1 song")).toBeInTheDocument();

    await user.click(within(divisions).getByRole("radio", { name: "Classic" }));
    expect(screen.getByText("No songs match the selected filters.")).toBeInTheDocument();
  });

  it("debounces the search box into one query and says when nothing matches", async () => {
    routeGets({ "/v1/admin/songs": (p: string) => (p.includes("q=") ? [] : [SONG_A]) });
    const user = userEvent.setup();
    renderPage("/admin/songs");

    await screen.findByText(SONG_A.song_label);
    await user.type(screen.getByPlaceholderText(/search by song/i), "zzz");

    expect(await screen.findByText('No songs match "zzz".')).toBeInTheDocument();
    const songCalls = apiGet.mock.calls.map(([p]) => p as string).filter((p) => p.startsWith("/v1/admin/songs"));
    expect(songCalls).toContain("/v1/admin/songs?q=zzz");
    expect(songCalls.filter((p) => p.includes("q=z") && p !== "/v1/admin/songs?q=zzz")).toEqual([]);
  });

  it("asks for deleted songs when 'Show deleted' is ticked", async () => {
    routeGets({ "/v1/admin/songs": [] });
    const user = userEvent.setup();
    renderPage("/admin/songs");

    expect(await screen.findByText("No songs yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /show deleted/i }));
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith("/v1/admin/songs?include_deleted=true")
    );
  });

  it("reports a failed load", async () => {
    routeGets({
      "/v1/admin/songs": () => {
        throw new Error("songs down");
      },
    });
    renderPage("/admin/songs");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("songs down"));
  });
});

describe("AdminPage — Test check-in section", () => {
  beforeEach(resetAll);

  it("requires a session before injecting", async () => {
    routeGets({ "/v1/sessions": [SESS_OPEN] });
    const user = userEvent.setup();
    renderPage("/admin/test-checkin");

    await user.click(await screen.findByRole("button", { name: "Test check-in" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Select a session"));
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("requires leader and follower names", async () => {
    routeGets({ "/v1/sessions": [SESS_OPEN] });
    const user = userEvent.setup();
    renderPage("/admin/test-checkin");

    await user.click(await screen.findByRole("radio", { name: SESS_OPEN_TITLE }));
    await user.clear(field("Leader last name"));
    await user.click(screen.getByRole("button", { name: "Test check-in" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Leader first and last name are required")
    );

    await user.type(field("Leader last name"), "X");
    await user.clear(field("Follower first name"));
    await user.click(screen.getByRole("button", { name: "Test check-in" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Follower first and last name are required")
    );
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("injects a check-in with the chosen session, division and trimmed names, then reloads", async () => {
    routeGets({ "/v1/sessions": [SESS_OPEN], "/v1/admin/checkins/test": [] });
    apiPost.mockResolvedValue({
      ...fx.checkinCreated({ initialQueue: "priority" }),
      pair: fx.leadingPair(),
    });
    const user = userEvent.setup();
    renderPage("/admin/test-checkin");

    await user.click(await screen.findByRole("radio", { name: SESS_OPEN_TITLE }));
    await user.click(
      within(screen.getByRole("radiogroup", { name: "Division" })).getByRole("radio", { name: "Showcase" })
    );
    await user.clear(field("Leader last name"));
    await user.type(field("Leader last name"), " Smith ");
    await user.clear(field("Follower last name"));
    await user.type(field("Follower last name"), "Jones");
    await user.click(screen.getByRole("button", { name: "Test check-in" }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/admin/checkins", {
        sessionId: "s1",
        divisionName: "Showcase",
        leaderFirstName: "Leader",
        leaderLastName: "Smith",
        followerFirstName: "Follower",
        followerLastName: "Jones",
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Checked in to priority queue");
    await waitFor(() =>
      expect(apiGet.mock.calls.filter(([p]) => p === "/v1/admin/checkins/test")).toHaveLength(2)
    );
    // Name fields are reset with fresh random tags for the next injection.
    expect(field("Leader last name").value).toMatch(/^\d{4}$/);
  });

  it("shows the API error when injection fails", async () => {
    routeGets({ "/v1/sessions": [SESS_OPEN] });
    apiPost.mockRejectedValue(new Error("Session closed"));
    const user = userEvent.setup();
    renderPage("/admin/test-checkin");

    await user.click(await screen.findByRole("radio", { name: SESS_OPEN_TITLE }));
    await user.click(screen.getByRole("button", { name: "Test check-in" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Session closed"));
  });

  it("lists existing test check-ins with their queue position", async () => {
    routeGets({
      "/v1/sessions": [SESS_OPEN],
      "/v1/admin/checkins/test": [
        fx.testInjection({ pair_id: "p1", leader_name: "L1", follower_name: "F1", session_id: "s1", division_name: "Classic", queue_status: "active", position: 1 }),
        fx.testInjection({ pair_id: "p2", leader_name: "L2", queue_status: "priority", position: 2 }),
        fx.testInjection({ pair_id: "p3", leader_name: "L3", queue_status: "non_priority", position: null }),
        fx.testInjection({ pair_id: "p4", leader_name: "L4", queue_status: "off_queue" }),
      ],
    });
    renderPage("/admin/test-checkin");

    const first = (await screen.findByText("L1 & F1")).closest("div.rounded-lg")!;
    expect(first).toHaveTextContent(`${SESS_OPEN_TITLE} · Classic`);
    expect(first).toHaveTextContent("Active #1");
    expect(screen.getByText("L2").closest("div.rounded-lg")).toHaveTextContent("No session");
    expect(screen.getByText("Priority #2")).toBeInTheDocument();
    expect(screen.getByText("Non-priority #?")).toBeInTheDocument();
    expect(screen.getByText("Off queue")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /existing test check-ins/i })).toHaveTextContent("(4)");
  });

  it("deletes all test check-ins after confirmation", async () => {
    routeGets({
      "/v1/admin/checkins/test": [
        fx.testInjection({ pair_id: "p1" }),
        fx.testInjection({ pair_id: "p2" }),
      ],
    });
    apiDel.mockResolvedValue({ deleted: 2 });
    const user = userEvent.setup();
    renderPage("/admin/test-checkin");

    await screen.findAllByText("Test Leader");
    await user.click(screen.getByRole("button", { name: "Delete all" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("This will remove 2 check-ins");
    await user.click(within(dialog).getByRole("button", { name: "Delete all" }));

    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/v1/admin/checkins/test"));
    expect(toast.success).toHaveBeenCalledWith("Deleted 2 check-ins");
    expect(await screen.findByText("No test check-ins yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete all" })).toBeDisabled();
  });

  it("keeps the list when deleting all fails", async () => {
    routeGets({ "/v1/admin/checkins/test": [fx.testInjection({ pair_id: "p1" })] });
    apiDel.mockRejectedValue(new Error("nope"));
    const user = userEvent.setup();
    renderPage("/admin/test-checkin");

    await screen.findByText("Test Leader");
    await user.click(screen.getByRole("button", { name: "Delete all" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("This will remove 1 check-in —");
    await user.click(within(dialog).getByRole("button", { name: "Delete all" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("nope"));
    expect(screen.getByText("Test Leader")).toBeInTheDocument();
  });

  it("disables Delete all when there are none", async () => {
    routeGets({ "/v1/admin/checkins/test": [] });
    renderPage("/admin/test-checkin");
    expect(await screen.findByText("No test check-ins yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete all" })).toBeDisabled();
  });
});

describe("AdminPage — Users section", () => {
  beforeEach(resetAll);

  const ME = fx.adminUser({ id: "admin_1", email: "admin@example.com", role: "admin", first_name: "Ada", last_name: "Min" });
  const ALICE = fx.adminUser({ id: "u2", email: "alice@example.com", first_name: "Alice", last_name: null, song_count: 3, partner_count: 1 });
  const BOB = fx.adminUser({ id: "u3", email: "bob@example.com", role: "admin" });

  it("lists users with role and counts, and no role toggle on the admin's own row", async () => {
    routeGets({ "/v1/admin/users": [ME, ALICE, BOB] });
    renderPage("/admin/users");

    const meRow = (await screen.findByText("admin@example.com")).closest("tr")!;
    expect(meRow).toHaveTextContent("Ada Min");
    expect(meRow).toHaveTextContent("(you)");
    expect(within(meRow).queryByRole("button")).not.toBeInTheDocument();

    const aliceRow = screen.getByText("alice@example.com").closest("tr")!;
    expect(aliceRow).toHaveTextContent("Alice");
    expect(aliceRow).toHaveTextContent("user");
    expect(within(aliceRow).getByRole("button", { name: "Make admin" })).toBeInTheDocument();

    const bobRow = screen.getByText("bob@example.com").closest("tr")!;
    expect(bobRow).toHaveTextContent("—");
    expect(within(bobRow).getByRole("button", { name: "Revoke admin" })).toBeInTheDocument();
    expect(screen.getByText("3 users")).toBeInTheDocument();
  });

  it("promotes a user and reflects the server's response", async () => {
    routeGets({ "/v1/admin/users": [ME, ALICE] });
    apiPatch.mockResolvedValue({ ...ALICE, role: "admin" });
    const user = userEvent.setup();
    renderPage("/admin/users");

    await user.click(await screen.findByRole("button", { name: "Make admin" }));
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/v1/admin/users/u2/role", { role: "admin" })
    );
    expect(toast.success).toHaveBeenCalledWith("alice@example.com is now an admin");
    expect(await screen.findByRole("button", { name: "Revoke admin" })).toBeInTheDocument();
  });

  it("demotes an admin", async () => {
    routeGets({ "/v1/admin/users": [BOB] });
    apiPatch.mockResolvedValue({ ...BOB, role: "user" });
    const user = userEvent.setup();
    renderPage("/admin/users");

    await user.click(await screen.findByRole("button", { name: "Revoke admin" }));
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/v1/admin/users/u3/role", { role: "user" })
    );
    expect(toast.success).toHaveBeenCalledWith("bob@example.com is now a regular user");
  });

  it("shows the error and leaves the role unchanged when the update fails", async () => {
    routeGets({ "/v1/admin/users": [ALICE] });
    apiPatch.mockRejectedValue(new Error("Forbidden"));
    const user = userEvent.setup();
    renderPage("/admin/users");

    await user.click(await screen.findByRole("button", { name: "Make admin" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Forbidden"));
    expect(screen.getByRole("button", { name: "Make admin" })).toBeEnabled();
  });

  it("searches with a debounced query and reports no matches", async () => {
    routeGets({ "/v1/admin/users": (p: string) => (p.includes("q=") ? [] : [ALICE]) });
    const user = userEvent.setup();
    renderPage("/admin/users");

    await screen.findByText("alice@example.com");
    await user.type(screen.getByPlaceholderText(/search by name or email/i), " nobody ");
    expect(await screen.findByText('No users match "nobody".')).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/v1/admin/users?q=nobody");
  });

  it("shows an empty state with no users and reports a failed refresh", async () => {
    let fail = false;
    routeGets({
      "/v1/admin/users": () => {
        if (fail) throw new Error("users down");
        return [];
      },
    });
    const user = userEvent.setup();
    renderPage("/admin/users");

    expect(await screen.findByText("No users yet.")).toBeInTheDocument();
    fail = true;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("users down"));
  });

  it("falls back to the events section for an unknown slug", async () => {
    routeGets({});
    renderPage("/admin/nope");
    expect(await screen.findByRole("button", { name: /new event/i })).toBeInTheDocument();
  });
});
