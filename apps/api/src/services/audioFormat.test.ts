import { describe, expect, it } from "vitest";
import { detectAudioFormat } from "./audioFormat.js";

describe("detectAudioFormat", () => {
  it("detects MP3 with ID3v2 header", () => {
    const bytes = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(20)]);
    expect(detectAudioFormat(bytes)).toBe("audio/mpeg");
  });

  it("detects MP3 with raw MPEG frame sync", () => {
    const bytes = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectAudioFormat(bytes)).toBe("audio/mpeg");
  });

  it("detects WAV", () => {
    const bytes = Buffer.from("RIFF\x00\x00\x00\x00WAVE", "binary");
    expect(detectAudioFormat(bytes)).toBe("audio/wav");
  });

  it("detects FLAC", () => {
    const bytes = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(20)]);
    expect(detectAudioFormat(bytes)).toBe("audio/flac");
  });

  it("detects M4A (ftyp box)", () => {
    const bytes = Buffer.from([
      0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70,
      0x4d, 0x34, 0x41, 0x20, 0, 0, 0, 0,
    ]);
    expect(detectAudioFormat(bytes)).toBe("audio/mp4");
  });

  it("returns null for non-audio (plain text)", () => {
    const bytes = Buffer.from("Hello, world! This is a text file.");
    expect(detectAudioFormat(bytes)).toBeNull();
  });

  it("returns null for too-short buffer", () => {
    expect(detectAudioFormat(Buffer.from("hi"))).toBeNull();
  });

  it("returns null for a PDF", () => {
    const bytes = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(20)]);
    expect(detectAudioFormat(bytes)).toBeNull();
  });
});
