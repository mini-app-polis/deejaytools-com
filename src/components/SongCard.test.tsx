// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiSong } from "@/schemas";
import SongCard from "./SongCard";

function makeSong(over: Partial<ApiSong> = {}): ApiSong {
  return {
    id: "s1",
    user_id: "u1",
    partner_id: null,
    display_name: "My Song",
    original_filename: "my-song.mp3",
    drive_file_id: "drive123",
    drive_folder_id: null,
    processed_filename: null,
    division: "Novice",
    routine_name: "Routine A",
    personal_descriptor: null,
    season_year: null,
    is_legacy: false,
    created_at: 0,
    updated_at: 0,
    ...over,
  } as ApiSong;
}

describe("SongCard", () => {
  it("shows the song fields and calls onDelete with the id", async () => {
    const onDelete = vi.fn();
    render(<SongCard song={makeSong()} onDelete={onDelete} />);
    expect(screen.getByText("Novice")).toBeTruthy();
    expect(screen.getByText("Routine A")).toBeTruthy();
    expect(screen.queryByText("my-song.mp3")).toBeNull();
    expect(screen.queryByText("Open in Google Drive")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("s1");
  });

  it("shows a badge instead of Delete for a shared song", () => {
    render(<SongCard song={makeSong({ shared_with_me: true })} onDelete={vi.fn()} />);
    expect(screen.getByText("Shared with you")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("with showFile shows the file name and Drive link", () => {
    render(<SongCard song={makeSong()} showFile onDelete={vi.fn()} />);
    expect(screen.getByText("my-song.mp3")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Google Drive/ });
    expect(link.getAttribute("href")).toBe("https://drive.google.com/file/d/drive123/view");
  });

  it("with showFile shows a disabled placeholder for a legacy song", () => {
    render(<SongCard song={makeSong({ is_legacy: true })} showFile onDelete={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Legacy Song" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
