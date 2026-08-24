import { describe, expect, it } from "vitest";
import type { ApiEventSongSubmission, ApiSong } from "@deejaytools/schemas";
import { buildFilledSlots } from "./entitySlots";

function song(overrides: Partial<ApiSong> & { id: string }): ApiSong {
  return {
    user_id: "u1",
    partner_id: null,
    managed_partnership_id: null,
    division: "Classic",
    display_name: "Routine",
    original_filename: "track.mp3",
    drive_file_id: null,
    drive_folder_id: null,
    processed_filename: null,
    routine_name: null,
    personal_descriptor: null,
    season_year: null,
    is_legacy: false,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  } as ApiSong;
}

function submission(songId: string): ApiEventSongSubmission {
  return {
    id: `sub_${songId}`,
    event_id: "ev1",
    song_id: songId,
    event_name: "Test",
    event_start_date: "2026-01-01",
    event_status: "upcoming",
    song_label: songId,
    division: "Classic",
    round: "prelims_and_finals",
    created_at: 1,
  };
}

describe("buildFilledSlots", () => {
  it("returns an empty map for no submissions", () => {
    expect(buildFilledSlots([], [song({ id: "a" })])).toEqual(new Map());
  });

  it("skips submissions whose song is absent from the songs list", () => {
    expect(buildFilledSlots([submission("missing")], [])).toEqual(new Map());
  });

  it("maps different divisions for one entity to different slots", () => {
    const songs = [
      song({ id: "a", division: "Classic", partner_id: "p1" }),
      song({ id: "b", division: "Showcase", partner_id: "p1" }),
    ];
    const filled = buildFilledSlots([submission("a")], songs);
    expect(filled.get("pt:p1::Classic")).toBe("a");
    expect(filled.get("pt:p1::Showcase")).toBeUndefined();
  });
});
