// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERSON_SEARCH_DEBOUNCE_MS } from "@/lib/personSearch";
import type { ApiEventPerson } from "@/schemas";
import { fx } from "@/test/fixtures";

const { apiGet, apiClient } = vi.hoisted(() => {
  const get = vi.fn();
  return { apiGet: get, apiClient: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn(), postForm: vi.fn() } };
});
vi.mock("@/api/client", () => ({ useApiClient: () => apiClient }));

import PersonPicker from "./PersonPicker";
import { renderWithQueryClient } from "@/test/render";

const ada = fx.eventPerson({ user_id: "user_ada", display_name: "Ada Lovelace", email_masked: "a•••@example.com" });
const bob = fx.eventPerson({ user_id: "user_bob", display_name: "Bob Noemail", email_masked: null });

function Harness({ onPick }: { onPick: (p: ApiEventPerson | null) => void }) {
  const [value, setValue] = useState<ApiEventPerson | null>(null);
  return (
    <form onSubmit={(e) => { e.preventDefault(); throw new Error("the picker submitted the form"); }}>
      <PersonPicker
        id="pick"
        eventId="ev-1"
        label="Dancer"
        value={value}
        onChange={(p) => { setValue(p); onPick(p); }}
        hint="Ask an admin otherwise."
      />
    </form>
  );
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const peopleCalls = () => apiGet.mock.calls.map(([p]) => String(p)).filter((p) => p.includes("/people"));

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockResolvedValue([ada, bob]);
});

describe("PersonPicker", () => {
  it("is a labelled combobox with the help line", () => {
    renderWithQueryClient(<Harness onPick={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Dancer" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Only people connected to this event appear here. Ask an admin otherwise.")).toBeInTheDocument();
  });

  it("sends no request under two trimmed characters", async () => {
    renderWithQueryClient(<Harness onPick={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Dancer"), { target: { value: " a " } });
    expect(screen.getByRole("status")).toHaveTextContent("Type at least 2 characters to search.");
    await pause(PERSON_SEARCH_DEBOUNCE_MS + 100);
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("debounces typing into one event-scoped request with the trimmed query", async () => {
    renderWithQueryClient(<Harness onPick={vi.fn()} />);
    const input = screen.getByLabelText("Dancer");
    fireEvent.change(input, { target: { value: "ad" } });
    fireEvent.change(input, { target: { value: "ada" } });
    fireEvent.change(input, { target: { value: " ada l " } });
    expect(screen.getByRole("status")).toHaveTextContent("Searching…");
    expect(apiGet).not.toHaveBeenCalled();
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    expect(apiGet).toHaveBeenCalledWith("/v1/events/ev-1/people?q=ada%20l");
    expect(peopleCalls().every((p) => !p.startsWith("/v1/admin"))).toBe(true);
  });

  it("shows the masked email, or just the name when there is none", async () => {
    renderWithQueryClient(<Harness onPick={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Dancer"), { target: { value: "ad" } });
    expect(await screen.findByRole("option", { name: "Ada Lovelace · a•••@example.com" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bob Noemail" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
  });

  it("yields the user id when a result is clicked, and Change searches again", async () => {
    const onPick = vi.fn();
    renderWithQueryClient(<Harness onPick={onPick} />);
    fireEvent.change(screen.getByLabelText("Dancer"), { target: { value: "ad" } });
    fireEvent.click(await screen.findByRole("option", { name: /Ada Lovelace/ }));
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: "user_ada" }));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("group", { name: "Dancer" })).toHaveTextContent("Ada Lovelace · a•••@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Change dancer" }));
    expect(onPick).toHaveBeenLastCalledWith(null);
    const input = screen.getByRole("combobox", { name: "Dancer" });
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("picks with the arrow keys and Enter, without submitting the form", async () => {
    const onPick = vi.fn();
    renderWithQueryClient(<Harness onPick={onPick} />);
    const input = screen.getByLabelText("Dancer");
    fireEvent.change(input, { target: { value: "ad" } });
    await screen.findByRole("option", { name: /Ada Lovelace/ });
    expect(input).toHaveAttribute("aria-activedescendant", "pick-option-0");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", "pick-option-1");
    expect(screen.getByRole("option", { name: "Bob Noemail" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: "user_bob" }));
  });

  it("closes on Escape and blur, and reopens on focus or ArrowDown", async () => {
    renderWithQueryClient(<Harness onPick={vi.fn()} />);
    const input = screen.getByLabelText("Dancer");
    fireEvent.change(input, { target: { value: "ad" } });
    await screen.findByRole("option", { name: /Ada Lovelace/ });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    // Enter with the list closed picks nothing.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.blur(input);
    expect(input).toHaveAttribute("aria-expanded", "false");
    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("says when no one matches", async () => {
    apiGet.mockResolvedValue([]);
    renderWithQueryClient(<Harness onPick={vi.fn()} />);
    const input = screen.getByLabelText("Dancer");
    fireEvent.change(input, { target: { value: "zz" } });
    expect(await screen.findByText("No one connected to this event matches that.")).toBeInTheDocument();
    expect(screen.queryByRole("option")).toBeNull();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("shows the API's error", async () => {
    apiGet.mockRejectedValue(new Error("You do not have access to this event"));
    renderWithQueryClient(<Harness onPick={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Dancer"), { target: { value: "ad" } });
    expect(await screen.findByText("Couldn't search: You do not have access to this event")).toBeInTheDocument();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("with allUsers, searches every user through the admin search", async () => {
    apiGet.mockResolvedValue([
      fx.adminUser({ id: "user_ada", email: "ada@example.com", first_name: "Ada", last_name: "Lovelace" }),
      fx.adminUser({ id: "user_x", email: "x@example.com", first_name: null, last_name: null }),
    ]);
    const onPick = vi.fn();
    renderWithQueryClient(<PersonPicker id="pick" allUsers label="User" value={null} onChange={onPick} autoFocus />);
    const input = screen.getByRole("combobox", { name: "User" });
    expect(input).toHaveFocus();
    expect(screen.getByText("Any user can be found by name or email.")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: " ad " } });
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/admin/users?q=ad"));
    expect(peopleCalls()).toEqual([]);
    // The whole email shows; a user with no name is known by it alone.
    expect(await screen.findByRole("option", { name: "Ada Lovelace · ada@example.com" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "x@example.com" }));
    expect(onPick).toHaveBeenLastCalledWith({ user_id: "user_x", display_name: "x@example.com", email_masked: null });
  });

  it("with allUsers, says when no user matches", async () => {
    apiGet.mockResolvedValue([]);
    renderWithQueryClient(<PersonPicker id="pick" allUsers label="User" value={null} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("User"), { target: { value: "zz" } });
    expect(await screen.findByText("No user matches that.")).toBeInTheDocument();
  });

  it("drops a response that arrives after the query changed", async () => {
    let resolveFirst!: (v: ApiEventPerson[]) => void;
    apiGet.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));
    apiGet.mockResolvedValueOnce([bob]);
    renderWithQueryClient(<Harness onPick={vi.fn()} />);
    const input = screen.getByLabelText("Dancer");
    fireEvent.change(input, { target: { value: "ad" } });
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "bo" } });
    expect(await screen.findByRole("option", { name: "Bob Noemail" })).toBeInTheDocument();
    resolveFirst([ada]);
    await pause(10);
    expect(screen.queryByRole("option", { name: /Ada Lovelace/ })).toBeNull();
  });
});
