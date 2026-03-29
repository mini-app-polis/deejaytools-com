import { eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { pairs, partners, users } from "../db/schema.js";

/** "Leader First Last / Follower First Last" (slash separator). */
export function buildPairDisplayName(
  uaFirst: string | null,
  uaLast: string | null,
  ptFirst: string | null,
  ptLast: string | null
): string {
  const left = [uaFirst, uaLast].filter(Boolean).join(" ").trim() || "—";
  const right = [ptFirst, ptLast].filter(Boolean).join(" ").trim() || "—";
  return `${left} / ${right}`;
}

/** Batch load pair display strings for many pair IDs. */
export async function loadPairDisplayNames(
  pairIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (pairIds.length === 0) return map;

  const unique = [...new Set(pairIds)];
  const rows = await db
    .select({
      pairId: pairs.id,
      uaFirst: users.firstName,
      uaLast: users.lastName,
      ptFirst: partners.firstName,
      ptLast: partners.lastName,
    })
    .from(pairs)
    .innerJoin(users, eq(users.id, pairs.userAId))
    .leftJoin(partners, eq(partners.id, pairs.partnerBId))
    .where(inArray(pairs.id, unique));

  for (const r of rows) {
    map.set(r.pairId, buildPairDisplayName(r.uaFirst, r.uaLast, r.ptFirst, r.ptLast));
  }
  return map;
}
