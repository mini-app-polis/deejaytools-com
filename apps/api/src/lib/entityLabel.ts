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
