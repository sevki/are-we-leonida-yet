import type { ClaimEvent } from "./parse";

/** Problems visible in the coordination issue's comments. Everything here is derived, never authoritative:
 *  the comments and the board stay the source of truth. */
export interface ClaimIssues {
  window: { comments: number; claims: number; from: string; to: string }; // what was analysed (the newest comments only)
  /** Items that more than one person currently holds: a claim by someone else came before the first holder released or finished. */
  collisions: { id: string; gapSec: number; holders: { user: string; url: string; at: string }[] }[];
  /** `claiming:` posts without an item ID. Allowed for unlisted work, but nothing can track them. */
  noId: { count: number; recent: { user: string; text: string; url: string; at: string }[] };
  /** Items the board lists as up for grabs although a claim for them stands in the comments. */
  listedButClaimed: { id: string; user: string; url: string; at: string }[];
}

export function checkClaims(events: ClaimEvent[], comments: number, grabIds: readonly string[]): ClaimIssues {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  // who holds each item right now, replaying the events in order
  const holders = new Map<string, Map<string, { url: string; at: string }>>();
  for (const e of sorted) {
    for (const id of e.itemIds) {
      const cur = holders.get(id) ?? new Map();
      if (e.kind === "claiming") cur.set(e.user, { url: e.url, at: e.created_at });
      else if (e.kind === "releasing") cur.delete(e.user);
      else if (e.kind === "done") cur.clear(); // the item is finished, whoever finished it
      holders.set(id, cur);
    }
  }

  const collisions: ClaimIssues["collisions"] = [];
  for (const [id, cur] of holders) {
    if (cur.size < 2) continue;
    const list = [...cur].map(([user, v]) => ({ user, ...v })).sort((a, b) => a.at.localeCompare(b.at));
    collisions.push({ id, gapSec: Math.round((Date.parse(list[1].at) - Date.parse(list[0].at)) / 1000), holders: list });
  }
  collisions.sort((a, b) => b.holders[b.holders.length - 1].at.localeCompare(a.holders[a.holders.length - 1].at));

  const claims = sorted.filter((e) => e.kind === "claiming");
  const noId = claims.filter((e) => e.itemIds.length === 0);

  const listedButClaimed = grabIds.flatMap((id) => {
    const first = [...(holders.get(id) ?? [])][0];
    return first ? [{ id, user: first[0], url: first[1].url, at: first[1].at }] : [];
  });

  return {
    window: { comments, claims: claims.length, from: sorted[0]?.created_at ?? "", to: sorted[sorted.length - 1]?.created_at ?? "" },
    collisions: collisions.slice(0, 50),
    noId: { count: noId.length, recent: noId.slice(-8).reverse().map((e) => ({ user: e.user, text: e.text, url: e.url, at: e.created_at })) },
    listedButClaimed,
  };
}
