/**
 * Seed script: legacy_songs
 *
 * One-time import of the submitted music xlsx into the legacy_songs table.
 * Run after applying migration 0002_legacy_songs.sql:
 *
 *   tsx scripts/seed-legacy-songs.ts path/to/Copy_of__Submitted_Music.xlsx
 */

import "dotenv/config";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import XLSX from "xlsx";
import { bigint, index, pgTable, text } from "drizzle-orm/pg-core";

const legacySongs = pgTable(
  "legacy_songs",
  {
    id: text("id").primaryKey(),
    partnership: text("partnership").notNull(),
    division: text("division"),
    routineName: text("routine_name"),
    descriptor: text("descriptor"),
    version: text("version"),
    submittedAt: text("submitted_at"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    divisionIdx: index("idx_legacy_songs_division").on(t.division),
  })
);

function parseDate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const isoMatch = s.match(/^(\d{4}-\d{2}-0?\d{2})/);
  if (isoMatch) return isoMatch[1];
  const localeMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (localeMatch) {
    const [, m, d, y] = localeMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function clean(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === "" || s === "N/A" ? null : s;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/seed-legacy-songs.ts <path-to-xlsx>");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const client = postgres(url, { max: 3 });
  const db = drizzle(client, { logger: false });

  console.log(`Reading ${filePath}...`);
  const workbook = XLSX.readFile(filePath);

  const now = Date.now();
  const values: (typeof legacySongs.$inferInsert)[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

    for (const raw of data) {
      const partnership = clean(raw["Partnership"]);
      if (!partnership) continue;

      values.push({
        id: randomUUID(),
        partnership,
        division: clean(raw["Division"]),
        routineName: clean(raw["Routine Name"]),
        descriptor: clean(raw["Descriptor"]),
        version: clean(raw["Version"]),
        submittedAt: parseDate(raw["Timestamp"]),
        createdAt: now,
      });
    }
  }

  console.log(`Inserting ${values.length} rows...`);
  await db.insert(legacySongs).values(values);
  console.log("Done.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
