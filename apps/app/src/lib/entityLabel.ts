import type { ApiSong } from "@deejaytools/schemas";

/**
 * Compose the "who" label for a song's partnership or a pair entity.
 * Placeholder partners (kind: solo/team/other) are a single entity — render
 * just their name, never "owner & placeholder".
 */
export function partnershipDisplay(opts: {
  ownerName: string | null | undefined;
  partnerName: string | null | undefined;
  partnerKind?: string | null;
}): string {
  const owner = (opts.ownerName ?? "").trim();
  const partner = (opts.partnerName ?? "").trim();
  if (opts.partnerKind && opts.partnerKind !== "partner") {
    return partner || owner;
  }
  return partner ? `${owner} & ${partner}` : owner;
}

/** Who-label for a song row when owner and partner names may be composed. */
export function songPartnershipLabel(
  song: Pick<
    ApiSong,
    | "partner_id"
    | "partner_first_name"
    | "partner_last_name"
    | "partner_kind"
    | "managed_partnership_id"
    | "managed_leader_first_name"
    | "managed_leader_last_name"
    | "managed_follower_first_name"
    | "managed_follower_last_name"
  >,
  ownerName?: string | null
): string | null {
  if (song.managed_partnership_id) {
    const leader = [song.managed_leader_first_name, song.managed_leader_last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const follower = [song.managed_follower_first_name, song.managed_follower_last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (leader && follower) return `${leader} & ${follower}`;
    return leader || follower || null;
  }
  if (!song.partner_id) return null;
  const partnerName =
    [song.partner_first_name, song.partner_last_name].filter(Boolean).join(" ").trim() || null;
  if (!partnerName) return null;
  if (song.partner_kind && song.partner_kind !== "partner") {
    return partnerName;
  }
  if (ownerName?.trim()) {
    return partnershipDisplay({
      ownerName,
      partnerName,
      partnerKind: song.partner_kind,
    });
  }
  return partnerName;
}
