// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
/** The caller's staff roles, as their /v1/auth/me record lists them. */
const me = vi.hoisted(() => ({ eventRoles: [] as { event_id: string; role: string }[] }));
vi.mock("@/hooks/useAuthMe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useAuthMe")>()),
  useAuthMe: () => ({ eventRoles: me.eventRoles }),
}));

import CheckinForSection from "./CheckinForSection";
import EventDetailsSection from "./EventDetailsSection";
import EventSessionsSection from "./EventSessionsSection";
import EventStaffSection from "./EventStaffSection";
import EventSubmissionsSection from "./EventSubmissionsSection";
import LiveQueueSection from "./LiveQueueSection";
import RunHistorySection from "./RunHistorySection";
import StaffPortal from "./StaffPortal";
import UploadForSection from "./UploadForSection";
import { renderWithQueryClient } from "@/test/render";
import type { QueryClient } from "@tanstack/react-query";

const event = fx.event({ id: "ev-1", name: "Fall Fling", timezone: "America/Chicago" });
const NOW = Date.now();
const live = (id: string) =>
  fx.session({
    id, event_id: "ev-1", status: "in_progress", event_timezone: "America/Chicago",
    checkin_opens_at: NOW - 3_600_000, floor_trial_starts_at: NOW - 60_000, floor_trial_ends_at: NOW + 3_600_000,
    divisions: [{ id: "d-1", division_name: "Classic", is_priority: false, sort_order: 0, priority_run_limit: null }],
  });

const threeDaysAgo = (id: string) => {
  const t = NOW - 3 * 86_400_000;
  return fx.session({ ...live(id), status: "completed", checkin_opens_at: t - 3_600_000, floor_trial_starts_at: t, floor_trial_ends_at: t + 3_600_000 });
};

/**
 * Puts the caller's /v1/auth/me record in the cache, as the nav bar would
 * have, and returns whether it has since been invalidated.
 */
function seedMe(client: QueryClient): () => boolean {
  client.setQueryData(["auth.me", "user_me"], fx.authMe({ id: "user_me" }));
  return () => client.getQueryState(["auth.me", "user_me"])?.isInvalidated ?? false;
}

function inRouter(node: React.ReactNode) {
  return renderWithQueryClient(
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
  me.eventRoles = [];
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
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith("Active cap (priority) must be a non-negative number"));

    fireEvent.change(pmax, { target: { value: "2" } });
    fireEvent.change(npmax, { target: { value: "-1" } });
    submitForm();
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith("Active cap (non-priority) must be a non-negative number"));

    fireEvent.change(npmax, { target: { value: "3" } });
    submitForm();
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith("Non-priority cap must be ≤ priority cap"));

    fireEvent.change(npmax, { target: { value: "1" } });
    fireEvent.change(runLimit, { target: { value: "-2" } });
    submitForm();
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith("Priority run limit must be a non-negative number"));
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

  it("says when the event has no sessions", async () => {
    apiGet.mockResolvedValue([]);
    inRouter(<EventSessionsSection event={event} />);
    expect(await screen.findByText("This event has no sessions yet.")).toBeInTheDocument();
  });

  it("shows a failed sessions load inline, not as no sessions", async () => {
    apiGet.mockRejectedValue(new Error("down"));
    inRouter(<EventSessionsSection event={event} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load sessions: down");
    expect(screen.queryByText("This event has no sessions yet.")).not.toBeInTheDocument();
  });
});

describe("LiveQueueSection", () => {
  it("moves an entry down and runs it incomplete", async () => {
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions?event_id=ev-1") return Promise.resolve([live("s-1")]);
      if (p === "/v1/queue/s-1/active/staff") {
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
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Run incomplete" })[0]).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: "Run incomplete" })[0]!);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/queue/incomplete", { queueEntryId: "qe-1" }));
    fireEvent.click(await screen.findByRole("button", { name: /Updated|Updating|Refreshing/ }));
  });

  it("asks for a session when several exist, shows a failed load, and toasts a failed action", async () => {
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions?event_id=ev-1") return Promise.resolve([live("s-1"), live("s-2")]);
      if (p === "/v1/queue/s-2/active/staff") return Promise.resolve([fx.queueEntry({ queueEntryId: "qe-9", entityLabel: "Solo" })]);
      if (p === "/v1/queue/s-1/active/staff") return Promise.reject(new Error("queue down"));
      return Promise.resolve([]);
    });
    apiPost.mockRejectedValue(new Error("cap reached"));
    inRouter(<LiveQueueSection event={event} />);
    expect(await screen.findByText("Choose a session above to manage its queue.")).toBeInTheDocument();
    const radios = within(screen.getByRole("radiogroup", { name: "Session" })).getAllByRole("radio");
    fireEvent.click(radios[0]!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the queues: queue down");
    expect(screen.getByRole("button", { name: /Couldn't refresh/ })).toBeInTheDocument();
    fireEvent.click(radios[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("cap reached"));
  });

  it("asks before withdrawing, and locks every action while one is in flight", async () => {
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions?event_id=ev-1") return Promise.resolve([live("s-1")]);
      if (p === "/v1/queue/s-1/active/staff") {
        return Promise.resolve([
          fx.queueEntry({ queueEntryId: "qe-1", position: 1, entityLabel: "First" }),
          fx.queueEntry({ queueEntryId: "qe-2", position: 2, entityLabel: "Second" }),
        ]);
      }
      return Promise.resolve([]);
    });
    const pending: ((v: unknown) => void)[] = [];
    apiPost.mockImplementation(() => new Promise((r) => pending.push(r)));
    inRouter(<LiveQueueSection event={event} />);
    await screen.findByText("First");

    // Withdraw asks first; cancelling posts nothing.
    fireEvent.click(screen.getAllByRole("button", { name: "Withdraw" })[1]!);
    const dialog = await screen.findByRole("dialog", { name: /withdraw from the queue/i });
    expect(dialog).toHaveTextContent("Second (Classic) will be removed from the queue");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiPost).not.toHaveBeenCalled();

    // A double click on Move down sends one request, and every action waits for it.
    const moveDown = screen.getByRole("button", { name: "Move down" });
    fireEvent.click(moveDown);
    fireEvent.click(moveDown);
    expect(apiPost).toHaveBeenCalledTimes(1);
    for (const name of ["Run complete", "Run incomplete", "Move down", "Withdraw"]) {
      for (const b of screen.getAllByRole("button", { name })) expect(b).toBeDisabled();
    }
    pending[0]!({ moved: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "Move down" })).toBeEnabled());

    // Confirming withdraws, and the dialog stays locked until the request ends.
    fireEvent.click(screen.getAllByRole("button", { name: "Withdraw" })[1]!);
    const confirm = within(await screen.findByRole("dialog")).getByRole("button", { name: "Withdraw" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(apiPost).toHaveBeenCalledTimes(2);
    expect(apiPost).toHaveBeenLastCalledWith("/v1/queue/withdraw", { queueEntryId: "qe-2" });
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Withdrawing…" })).toBeDisabled();
    pending[1]!({ withdrawn: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each([
    ["dj", true],
    ["event-manager", false],
    ["coordinator", false],
  ])("shows the processed filename under the song label to a %s: %s", async (role, shown) => {
    me.eventRoles = [{ event_id: "ev-1", role }];
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions?event_id=ev-1") return Promise.resolve([live("s-1")]);
      if (p === "/v1/queue/s-1/active/staff") {
        return Promise.resolve([
          fx.queueEntry({
            queueEntryId: "qe-1",
            entityLabel: "Ada & Bob",
            songDisplayName: "Ada & Bob - Classic - Waltz - v02",
            songProcessedFilename: "Ada_Bob_Classic_2027_Waltz_v02.mp3",
          }),
        ]);
      }
      return Promise.resolve([]);
    });
    inRouter(<LiveQueueSection event={event} />);
    expect(await screen.findByText("Classic · Ada & Bob - Classic - Waltz - v02")).toBeInTheDocument();
    if (shown) {
      expect(screen.getByText("Ada_Bob_Classic_2027_Waltz_v02.mp3")).toHaveClass("text-xs");
    } else {
      expect(screen.queryByText(/_2027_/)).not.toBeInTheDocument();
    }
  });

  it("says when the event has no sessions", async () => {
    apiGet.mockResolvedValue([]);
    inRouter(<LiveQueueSection event={event} />);
    expect(await screen.findByText("This event has no sessions yet.")).toBeInTheDocument();
  });

  it("shows a failed sessions load, not an empty event", async () => {
    apiGet.mockRejectedValue(new Error("down"));
    inRouter(<LiveQueueSection event={event} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load sessions: down");
    expect(screen.queryByText("This event has no sessions yet.")).not.toBeInTheDocument();
  });

  it("asks for no pair or song lists for an event's queue", async () => {
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions?event_id=ev-1") return Promise.resolve([live("s-1")]);
      if (p === "/v1/queue/s-1/active/staff") return Promise.resolve([fx.queueEntry({ entityLabel: "—", songId: "song-1" })]);
      return Promise.resolve([]);
    });
    inRouter(<LiveQueueSection event={event} />);
    expect(await screen.findByText("Classic · song-1")).toBeInTheDocument();
    expect(allPaths()).not.toContain("/v1/partners/leading-pairs");
    expect(allPaths()).not.toContain("/v1/songs");
  });

  it("with today, lists today's sessions across events live first and fills labels the rows leave out", async () => {
    const earlier = fx.session({
      ...live("s-done"),
      event_id: "ev-2",
      status: "completed",
      checkin_opens_at: NOW - 120_000,
      floor_trial_starts_at: NOW - 90_000,
    });
    const old = threeDaysAgo("s-old");
    apiGet.mockImplementation((p: string) => {
      if (p === "/v1/sessions") return Promise.resolve([earlier, old, live("s-1")]);
      if (p === "/v1/partners/leading-pairs") return Promise.resolve([fx.leadingPair({ id: "pair-9", display_name: "Pair From Map" })]);
      if (p === "/v1/songs") return Promise.resolve([fx.song({ id: "song-9", partnership_label: "Pair", division: "Classic", routine_name: "Opener" })]);
      if (p === "/v1/queue/s-1/active/staff") {
        return Promise.resolve([
          fx.queueEntry({ queueEntryId: "qe-1", entityLabel: "—", entityPairId: "pair-9", songId: "song-9", songProcessedFilename: "Pair_Classic.mp3" }),
        ]);
      }
      return Promise.resolve([]);
    });
    inRouter(<LiveQueueSection today />);

    // The one live session is opened straight away, though it starts later.
    expect(await screen.findByText("Pair From Map")).toBeInTheDocument();
    const radios = within(screen.getByRole("radiogroup", { name: "Session" })).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveTextContent("(completed)");
    expect(screen.getByText(/^Classic · Pair - Classic - Opener/)).toBeInTheDocument();
    // Not a DJ of any event, yet the filename shows: only admins reach this view.
    expect(screen.getByText("Pair_Classic.mp3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Pair From Map (Classic) will be removed");
  });

  it("takes the chosen session from its caller when given, and sizes the choice", async () => {
    apiGet.mockImplementation((p: string) =>
      Promise.resolve(p === "/v1/sessions?event_id=ev-1" ? [live("s-1"), live("s-2")] : [])
    );
    const onSessionIdChange = vi.fn();
    inRouter(
      <LiveQueueSection event={event} sessionId="s-2" onSessionIdChange={onSessionIdChange} selectorClassName="sized" />
    );
    const group = await screen.findByRole("radiogroup", { name: "Session" });
    expect(group.parentElement).toHaveClass("sized");
    const radios = within(group).getAllByRole("radio");
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    fireEvent.click(radios[0]!);
    expect(onSessionIdChange).toHaveBeenCalledWith("s-1");
    // The caller decides: until it passes the new id, the old one stays chosen.
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
  });

  it("with today, says when nothing is scheduled for today", async () => {
    apiGet.mockImplementation((p: string) =>
      Promise.resolve(p === "/v1/sessions" ? [threeDaysAgo("s-old")] : [])
    );
    inRouter(<LiveQueueSection today />);
    expect(await screen.findByText(/no floor-trial sessions scheduled for today/i)).toBeInTheDocument();
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

  it("says when there are no runs", async () => {
    apiGet.mockResolvedValue([]);
    inRouter(<RunHistorySection event={event} />);
    expect(await screen.findByText("No runs recorded yet.")).toBeInTheDocument();
  });

  it("shows a failed runs load inline, not as no runs", async () => {
    apiGet.mockImplementation((p: string) => (p.startsWith("/v1/runs?") ? Promise.reject(new Error("no runs")) : Promise.resolve([])));
    inRouter(<RunHistorySection event={event} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load run history: no runs");
    expect(screen.queryByText("No runs recorded yet.")).not.toBeInTheDocument();
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
  it("refuses an incomplete or inconsistent event", async () => {
    inRouter(<EventDetailsSection event={event} onUpdated={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Save changes" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " " } });
    fireEvent.click(save);
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith("Name is required"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "" } });
    fireEvent.click(save);
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith("Start date is required"));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-06-05" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "" } });
    fireEvent.click(save);
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith("End date is required"));
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-06-01" } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(toastError).toHaveBeenLastCalledWith("End date must be on or after start date")
    );
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it("sends the trimmed name with the dates and timezone", async () => {
    apiPatch.mockResolvedValue(event);
    inRouter(<EventDetailsSection event={event} onUpdated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Spring Swing  " } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-06-05" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-06-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(apiPatch.mock.calls[0]![1]).toEqual({
      name: "Spring Swing",
      start_date: "2026-06-05",
      end_date: "2026-06-05",
      timezone: event.timezone,
    });
  });

  it("offers no season year field, and leaves the season out of the update", async () => {
    apiPatch.mockResolvedValue(event);
    inRouter(<EventDetailsSection event={event} onUpdated={vi.fn()} />);
    expect(screen.queryByLabelText(/season/i)).toBeNull();
    expect(screen.queryByText(/season/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    expect(apiPatch.mock.calls[0]![1]).not.toHaveProperty("season_year");
  });

  it("toasts a failed save or delete", async () => {
    apiPatch.mockRejectedValue(new Error("bad tz"));
    apiDel.mockRejectedValue(new Error("not yours"));
    const meInvalidated = seedMe(inRouter(<EventDetailsSection event={event} onUpdated={vi.fn()} />).queryClient);
    fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Mars/Base" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("bad tz"));
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("not yours"));
    expect(screen.queryByText("my events page")).toBeNull();
    expect(meInvalidated()).toBe(false);
  });

  it("refreshes the caller's record after a save and after a delete", async () => {
    apiPatch.mockResolvedValue({ ...event, name: "Fall Fling II" });
    apiDel.mockResolvedValue({ deleted: true });
    const { queryClient } = inRouter(<EventDetailsSection event={event} onUpdated={vi.fn()} />);
    let meInvalidated = seedMe(queryClient);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fall Fling II" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Event updated"));
    expect(meInvalidated()).toBe(true);

    meInvalidated = seedMe(queryClient);

    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("my events page")).toBeInTheDocument();
    expect(meInvalidated()).toBe(true);
  });
});

describe("EventStaffSection", () => {
  it("shows a failed staff load inline, and toasts a failed grant", async () => {
    apiGet.mockRejectedValueOnce(new Error("staff down"));
    inRouter(<EventStaffSection event={event} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the staff: staff down");
    expect(screen.queryByText(/No one is on this event.s staff yet/)).not.toBeInTheDocument();
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
    const meInvalidated = seedMe(inRouter(<EventStaffSection event={event} />).queryClient);
    fireEvent.click(await screen.findByRole("button", { name: "Remove d@example.com as DJ" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Admin access required"));
    expect(screen.getByText("d@example.com")).toBeInTheDocument();
    expect(meInvalidated()).toBe(false);
  });

  it("refreshes the caller's record after a revoke, which may be their own", async () => {
    apiGet.mockResolvedValue([fx.eventStaff({ user_id: "u2", role: "dj", email: "d@example.com" })]);
    apiDel.mockResolvedValue({ deleted: true });
    const meInvalidated = seedMe(inRouter(<EventStaffSection event={event} />).queryClient);
    fireEvent.click(await screen.findByRole("button", { name: "Remove d@example.com as DJ" }));
    await waitFor(() => expect(meInvalidated()).toBe(true));
  });

  it("refreshes the caller's record after a grant, which may be their own", async () => {
    apiGet.mockImplementation((p: string) =>
      Promise.resolve(p.startsWith("/v1/events/ev-1/people?") ? [fx.eventPerson({ user_id: "user_x", display_name: "Xavier" })] : [])
    );
    apiPut.mockResolvedValue(fx.eventStaff({ user_id: "user_x", role: "coordinator", email: "x@example.com" }));
    const meInvalidated = seedMe(inRouter(<EventStaffSection event={event} />).queryClient);
    await pickPerson("Person", "xa", /^Xavier/);
    fireEvent.click(screen.getByRole("radio", { name: "Coordinator" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to staff" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(meInvalidated()).toBe(true);
  });
});

describe("EventSubmissionsSection", () => {
  it("shows a failed load inline, not as no submissions", async () => {
    apiGet.mockRejectedValue(new Error("Admin access required"));
    inRouter(<EventSubmissionsSection event={event} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the submissions: Admin access required");
    expect(screen.queryByText("No songs submitted to this event yet.")).not.toBeInTheDocument();
  });
});

describe("StaffPortal", () => {
  it("says when the event can't be loaded", async () => {
    apiGet.mockRejectedValue(new Error("Event not found"));
    renderWithQueryClient(
      <MemoryRouter initialEntries={["/events/ev-x/coordinator"]}>
        <Routes>
          <Route
            path="/events/:eventId/coordinator"
            element={<StaffPortal roleLabel="Coordinator" portalSegment="coordinator" sections={[{ slug: "a", label: "A", render: () => <p>body</p> }]} />}
          />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this event: Event not found");
    expect(screen.queryByText("body")).toBeNull();
  });
});
