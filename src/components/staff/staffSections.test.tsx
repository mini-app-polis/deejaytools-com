// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx } from "@/test/fixtures";

const { apiGet, apiPost, apiPatch, apiPut, apiDel, apiClient, toastError, toastSuccess } = vi.hoisted(() => {
  const get = vi.fn();
  const post = vi.fn();
  const patch = vi.fn();
  const put = vi.fn();
  const del = vi.fn();
  return {
    apiGet: get,
    apiPost: post,
    apiPatch: patch,
    apiPut: put,
    apiDel: del,
    apiClient: { get, post, patch, put, del, postForm: vi.fn() },
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
  };
});
vi.mock("@/api/client", () => ({ useApiClient: () => apiClient }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ getToken: vi.fn() }) }));

import CheckinForSection from "./CheckinForSection";
import EventDetailsSection from "./EventDetailsSection";
import EventSessionsSection from "./EventSessionsSection";
import EventStaffSection from "./EventStaffSection";
import EventSubmissionsSection from "./EventSubmissionsSection";
import LiveQueueSection from "./LiveQueueSection";
import RunHistorySection from "./RunHistorySection";
import StaffPortal from "./StaffPortal";
import UploadForSection from "./UploadForSection";

const event = fx.event({ id: "ev-1", name: "Fall Fling", timezone: "America/Chicago" });
const NOW = Date.now();
const live = (id: string) =>
  fx.session({
    id, event_id: "ev-1", status: "in_progress", event_timezone: "America/Chicago",
    checkin_opens_at: NOW - 3_600_000, floor_trial_starts_at: NOW - 60_000, floor_trial_ends_at: NOW + 3_600_000,
    divisions: [{ id: "d-1", division_name: "Classic", is_priority: false, sort_order: 0, priority_run_limit: null }],
  });

function inRouter(node: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/here"]}>
      <Routes>
        <Route path="/here" element={node} />
        <Route path="/my-events" element={<p>my events page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  for (const fn of [apiGet, apiPost, apiPatch, apiPut, apiDel, toastError, toastSuccess]) fn.mockReset();
  apiGet.mockResolvedValue([]);
});

/** Every path a section called, on any method. */
function allPaths(): string[] {
  return [apiGet, apiPost, apiPatch, apiPut, apiDel].flatMap((fn) => fn.mock.calls.map(([p]) => String(p)));
}

const ada = fx.eventPerson({ user_id: "user_1", display_name: "Ada Lovelace", email_masked: "a•••@example.com" });

/** Search the person picker labelled `label` and pick the result named `name`. */
async function pickPerson(label: string, query: string, name: RegExp) {
  fireEvent.change(await screen.findByRole("combobox", { name: label }), { target: { value: query } });
  fireEvent.click(await screen.findByRole("option", { name }));
}

describe("EventSessionsSection", () => {
  beforeEach(() => {
    apiGet.mockImplementation((p: string) => Promise.resolve(p === "/v1/sessions?event_id=ev-1" ? [live("s-1")] : []));
  });

  async function openCreate() {
    inRouter(<EventSessionsSection event={event} />);
    fireEvent.click(await screen.findByRole("button", { name: "New session" }));
    return screen.findByRole("dialog");
  }

  it("refuses caps and limits the API would reject", async () => {
    const dialog = await openCreate();
    const pmax = within(dialog).getByLabelText("Active cap (priority)");
    const npmax = within(dialog).getByLabelText("Active cap (non-priority)");
    const runLimit = within(dialog).getByLabelText("Priority run limit");
    // Submit the form itself: the browser's own min check would stop a click.
    const form = within(dialog).getByRole("button", { name: "Create session" }).closest("form")!;
    const submitForm = () => fireEvent.submit(form);

    fireEvent.change(pmax, { target: { value: "-1" } });
    submitForm();
    expect(toastError).toHaveBeenLastCalledWith("Active cap (priority) must be a non-negative number");

    fireEvent.change(pmax, { target: { value: "2" } });
    fireEvent.change(npmax, { target: { value: "-1" } });
    submitForm();
    expect(toastError).toHaveBeenLastCalledWith("Active cap (non-priority) must be a non-negative number");

    fireEvent.change(npmax, { target: { value: "3" } });
    submitForm();
    expect(toastError).toHaveBeenLastCalledWith("Non-priority cap must be ≤ priority cap");

    fireEvent.change(npmax, { target: { value: "1" } });
    fireEvent.change(runLimit, { target: { value: "-2" } });
    submitForm();
    expect(toastError).toHaveBeenLastCalledWith("Priority run limit must be a non-negative number");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("marks a checked division as priority, with the run limit", async () => {
    apiPost.mockResolvedValue(live("s-2"));
    const dialog = await openCreate();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /^Showcase/ }));
    fireEvent.change(within(dialog).getByLabelText("Check-in opens"), { target: { value: "60" } });
    fireEvent.change(within(dialog).getByLabelText("Floor trial duration"), { target: { value: "90" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create session" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const body = apiPost.mock.calls[0]![1] as {
      checkin_opens_at: number; floor_trial_starts_at: number; floor_trial_ends_at: number;
      divisions: { division_name: string; is_priority: boolean; priority_run_limit: number }[];
    };
    expect(body.divisions.find((d) => d.division_name === "Showcase")).toMatchObject({ is_priority: true, priority_run_limit: 1 });
    expect(body.divisions.find((d) => d.division_name === "Classic")).toMatchObject({ is_priority: false, priority_run_limit: 0 });
    expect(body.floor_trial_starts_at - body.checkin_opens_at).toBe(60 * 60_000);
    expect(body.floor_trial_ends_at - body.floor_trial_starts_at).toBe(90 * 60_000);
  });

  it("reports which leg of an edit failed", async () => {
    inRouter(<EventSessionsSection event={event} />);
    apiPatch.mockRejectedValueOnce(new Error("bad window"));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Failed to update session fields: bad window"));

    apiPatch.mockResolvedValueOnce(live("s-1"));
    apiPut.mockRejectedValueOnce(new Error("nope"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Session fields saved, but failed to update divisions: nope")
    );
  });

  it("toasts failed create, status and delete calls", async () => {
    apiPost.mockRejectedValue(new Error("overlaps"));
    apiPatch.mockRejectedValue(new Error("no status"));
    apiDel.mockRejectedValue(new Error("no delete"));
    const dialog = await openCreate();
    fireEvent.click(within(dialog).getByRole("button", { name: "Create session" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("overlaps"));
    fireEvent.keyDown(dialog, { key: "Escape" });

    fireEvent.change(screen.getByRole("combobox", { name: /^Status of/ }), { target: { value: "cancelled" } });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("no status"));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("no delete"));
  });

  it("says when the event has no sessions, and toasts a failed load", async () => {
    apiGet.mockRejectedValue(new Error("down"));
    inRouter(<EventSessionsSection event={event} />);
    expect(await screen.findByText("This event has no sessions yet.")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("down");
  });
});

describe("LiveQueueSection", () => {
  it("moves an entry down and runs it incomplete", async () => {
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions?event_id=ev-1") return Promise.resolve([live("s-1")]);
      if (p === "/v1/queue/s-1/active") {
        return Promise.resolve([
          fx.queueEntry({ queueEntryId: "qe-1", position: 1, entityLabel: "First", notes: "fast start", songProcessedFilename: "a.mp3" }),
          fx.queueEntry({ queueEntryId: "qe-2", position: 2, entityLabel: "Second" }),
        ]);
      }
      if (p === "/v1/queue/s-1/priority") return Promise.resolve([fx.queueEntry({ queueEntryId: "qe-3", entityLabel: "Third" })]);
      return Promise.resolve([]);
    });
    apiPost.mockResolvedValue({ moved: true });
    inRouter(<LiveQueueSection event={event} />);
    expect(await screen.findByText("First")).toBeInTheDocument();
    expect(screen.getByText("Note: fast start")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]!);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/queue/move-down", { queueEntryId: "qe-1" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Run incomplete" })[0]!);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/queue/incomplete", { queueEntryId: "qe-1" }));
    fireEvent.click(await screen.findByRole("button", { name: /Updated|Updating|Refreshing/ }));
  });

  it("asks for a session when several exist, and toasts a failed action or load", async () => {
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions?event_id=ev-1") return Promise.resolve([live("s-1"), live("s-2")]);
      if (p === "/v1/queue/s-2/active") return Promise.resolve([fx.queueEntry({ queueEntryId: "qe-9", entityLabel: "Solo" })]);
      if (p === "/v1/queue/s-1/active") return Promise.reject(new Error("queue down"));
      return Promise.resolve([]);
    });
    apiPost.mockRejectedValue(new Error("cap reached"));
    inRouter(<LiveQueueSection event={event} />);
    expect(await screen.findByText("Choose a session above to manage its queue.")).toBeInTheDocument();
    const radios = within(screen.getByRole("radiogroup", { name: "Session" })).getAllByRole("radio");
    fireEvent.click(radios[0]!);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("queue down"));
    expect(await screen.findByRole("button", { name: /Couldn't refresh/ })).toBeInTheDocument();
    fireEvent.click(radios[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("cap reached"));
  });

  it("says when the event has no sessions", async () => {
    apiGet.mockRejectedValue(new Error("down"));
    inRouter(<LiveQueueSection event={event} />);
    expect(await screen.findByText("This event has no sessions yet.")).toBeInTheDocument();
  });
});

describe("RunHistorySection", () => {
  it("filters by session and division", async () => {
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions?event_id=ev-1") return Promise.resolve([live("s-1")]);
      if (p.startsWith("/v1/runs?")) {
        return Promise.resolve([
          fx.run({ id: "r-1", entity_label: "Ada", division_name: "Classic" }),
          fx.run({ id: "r-2", entity_label: "Cy", division_name: "Showcase" }),
        ]);
      }
      return Promise.resolve([]);
    });
    inRouter(<RunHistorySection event={event} />);
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Showcase (1)" }));
    expect(screen.queryByText("Ada")).toBeNull();
    const session = within(screen.getByRole("radiogroup", { name: "Session" })).getAllByRole("radio")[1]!;
    fireEvent.click(session);
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith("/v1/runs?limit=500&session_id=s-1")
    );
  });

  it("says when there are no runs, and toasts a failed load", async () => {
    apiGet.mockImplementation((p: string) => (p.startsWith("/v1/runs?") ? Promise.reject(new Error("no runs")) : Promise.resolve([])));
    inRouter(<RunHistorySection event={event} />);
    expect(await screen.findByText("No runs recorded yet.")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("no runs");
  });
});

describe("CheckinForSection", () => {
  it("says when no session is open and nothing is submitted", async () => {
    inRouter(<CheckinForSection event={event} />);
    expect(await screen.findByText("No session of this event is open for check-in.")).toBeInTheDocument();
    expect(screen.getByText("No songs submitted to this event yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();
  });

  it("checks in the picked submission's owner, with no dancer picked or typed", async () => {
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions?event_id=ev-1") return Promise.resolve([live("s-1")]);
      if (p === "/v1/events/ev-1/song-submissions") {
        return Promise.resolve([
          fx.adminEventSongSubmission({ id: "sub-1", song_id: "song-7", owner_user_id: "user_owner", division: "Classic", partnership_label: "Ada" }),
        ]);
      }
      return Promise.resolve([]);
    });
    apiPost.mockResolvedValue(fx.checkinCreated({ sessionId: "s-1" }));
    inRouter(<CheckinForSection event={event} />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(within(await screen.findByRole("radiogroup", { name: "Session" })).getAllByRole("radio")[0]!);
    fireEvent.click(await screen.findByRole("radio", { name: /^Ada/ }));
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/checkins", {
        sessionId: "s-1",
        songId: "song-7",
        divisionName: "Classic",
        on_behalf_of_user_id: "user_owner",
      })
    );
    expect(screen.queryByText("user_owner")).toBeNull();
    expect(allPaths().some((p) => p.includes("/people"))).toBe(false);
  });

  it("toasts a refused check-in", async () => {
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions?event_id=ev-1") return Promise.resolve([live("s-1")]);
      if (p === "/v1/events/ev-1/song-submissions") {
        return Promise.resolve([fx.adminEventSongSubmission({ id: "sub-1", owner_user_id: "user_1", division: "Showcase", partnership_label: "Ada" })]);
      }
      return Promise.resolve([]);
    });
    apiPost.mockRejectedValue(new Error("Song not found"));
    inRouter(<CheckinForSection event={event} />);
    fireEvent.click(within(await screen.findByRole("radiogroup", { name: "Session" })).getAllByRole("radio")[0]!);
    // The submission's division isn't one the session runs, so none is preselected.
    fireEvent.click(await screen.findByRole("radio", { name: /^Ada/ }));
    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Classic" }));
    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Song not found"));
    expect(apiPost).toHaveBeenCalledWith("/v1/checkins", expect.objectContaining({ on_behalf_of_user_id: "user_1" }));
    expect(allPaths().some((p) => p.startsWith("/v1/admin"))).toBe(false);
  });
});

describe("UploadForSection", () => {
  it("picks the dancer from the event's people, and lets them be changed", async () => {
    apiGet.mockImplementation((p: string) => Promise.resolve(p.startsWith("/v1/events/ev-1/people?") ? [ada] : []));
    inRouter(<UploadForSection event={event} />);
    expect(
      screen.getByText(/Only people connected to this event appear here\. For a dancer with no link to the event yet, ask an admin/)
    ).toBeInTheDocument();
    await pickPerson("Dancer", "ada", /^Ada Lovelace/);
    expect(await screen.findByText("Upload for: Ada Lovelace")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/people?q=ada");
    fireEvent.click(screen.getByRole("button", { name: "Change dancer" }));
    expect(screen.getByRole("combobox", { name: "Dancer" })).toHaveValue("");
    expect(allPaths().some((p) => p.startsWith("/v1/admin"))).toBe(false);
  });
});

describe("EventDetailsSection", () => {
  it("refuses an incomplete or inconsistent event", () => {
    inRouter(<EventDetailsSection event={event} onUpdated={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Save changes" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " " } });
    fireEvent.click(save);
    expect(toastError).toHaveBeenLastCalledWith("Name is required");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "" } });
    fireEvent.click(save);
    expect(toastError).toHaveBeenLastCalledWith("Start date is required");
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-06-05" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "" } });
    fireEvent.click(save);
    expect(toastError).toHaveBeenLastCalledWith("End date is required");
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-06-01" } });
    fireEvent.click(save);
    expect(toastError).toHaveBeenLastCalledWith("End date must be on or after start date");
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-06-06" } });
    fireEvent.change(screen.getByLabelText("Season year"), { target: { value: "26" } });
    fireEvent.click(save);
    expect(toastError).toHaveBeenLastCalledWith("Season year must be four digits");
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it("toasts a failed save or delete", async () => {
    apiPatch.mockRejectedValue(new Error("bad tz"));
    apiDel.mockRejectedValue(new Error("not yours"));
    inRouter(<EventDetailsSection event={event} onUpdated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Mars/Base" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("bad tz"));
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("not yours"));
    expect(screen.queryByText("my events page")).toBeNull();
  });
});

describe("EventStaffSection", () => {
  it("says when there is no staff, and toasts a failed load, grant or revoke", async () => {
    apiGet.mockRejectedValueOnce(new Error("staff down"));
    inRouter(<EventStaffSection event={event} />);
    expect(await screen.findByText(/No one is on this event.s staff yet/)).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("staff down");
    expect(screen.getByText(/Only people connected to this event appear here\. To add someone new to the event, ask an admin\./)).toBeInTheDocument();

    apiGet.mockImplementation((p: string) =>
      Promise.resolve(p.startsWith("/v1/events/ev-1/people?") ? [fx.eventPerson({ user_id: "user_x", display_name: "Xavier" })] : [])
    );
    apiPut.mockRejectedValue(new Error("User not found"));
    await pickPerson("Person", "xa", /^Xavier/);
    fireEvent.click(screen.getByRole("radio", { name: "Coordinator" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to staff" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("User not found"));
    expect(apiPut).toHaveBeenCalledWith("/v1/events/ev-1/staff/user_x/coordinator", undefined);
    expect(allPaths().some((p) => p.startsWith("/v1/admin"))).toBe(false);
  });

  it("toasts a failed revoke and keeps the row", async () => {
    apiGet.mockResolvedValue([fx.eventStaff({ user_id: "u2", role: "dj", email: "d@example.com" })]);
    apiDel.mockRejectedValue(new Error("Admin access required"));
    inRouter(<EventStaffSection event={event} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove d@example.com as DJ" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Admin access required"));
    expect(screen.getByText("d@example.com")).toBeInTheDocument();
  });
});

describe("EventSubmissionsSection", () => {
  it("toasts a failed load", async () => {
    apiGet.mockRejectedValue(new Error("Admin access required"));
    inRouter(<EventSubmissionsSection event={event} />);
    expect(await screen.findByText("No songs submitted to this event yet.")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("Admin access required");
  });
});

describe("StaffPortal", () => {
  it("says when the event can't be loaded", async () => {
    apiGet.mockRejectedValue(new Error("Event not found"));
    render(
      <MemoryRouter initialEntries={["/events/ev-x/coordinator"]}>
        <Routes>
          <Route
            path="/events/:eventId/coordinator"
            element={<StaffPortal roleLabel="Coordinator" portalSegment="coordinator" sections={[{ slug: "a", label: "A", render: () => <p>body</p> }]} />}
          />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("This event couldn't be loaded.")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("Event not found");
    expect(screen.queryByText("body")).toBeNull();
  });
});
