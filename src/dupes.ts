import { itemIdsIn } from "./board";

export interface OpenPr { number: number; title: string; user: string; body: string | null; created_at: string; url: string }

/** A claim comment a PR links to, looked up once and cached (comments do not change). `ok: false` is a comment that
 *  no longer exists, remembered so it is not asked for again. */
export interface ResolvedClaim { id: number; ok: boolean; user: string; ids: string[]; text: string; url: string }

const CLAIM_LINK = /github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+#issuecomment-(\d+)/gi;

/** Ids of the claim comments a PR body links to ("Claim: .../issues/9522#issuecomment-7114943216"). */
export function claimRefs(body: string | null): number[] {
  return [...new Set([...(body ?? "").matchAll(CLAIM_LINK)].map((m) => Number(m[1])))];
}

export interface DuplicateGroup {
  key: string; // an item ID, or "claim:<comment id>" for a claim that names no item
  label: string; // what to show: the item ID, or the claim's description
  competing: boolean; // more than one author: two people did the same work. One author with several PRs is usually a split.
  prs: { number: number; title: string; user: string; created_at: string; url: string }[]; // oldest first
}

/** Open PRs that are about the same work, from the item IDs in their text and from the claims they link. Derived from
 *  the newest open PRs only; the comments and the board stay the source of truth. */
export interface Duplicates {
  window: { prs: number; named: number; linked: number; unresolved: number };
  groups: DuplicateGroup[];
}

export function findDuplicates(prs: OpenPr[], prefixes: ReadonlySet<string>, claims: ReadonlyMap<number, ResolvedClaim>): Duplicates {
  const groups = new Map<string, { label: string; prs: Map<number, OpenPr> }>();
  const add = (key: string, label: string, pr: OpenPr) => {
    const g = groups.get(key) ?? { label, prs: new Map() };
    g.prs.set(pr.number, pr);
    groups.set(key, g);
  };
  let named = 0, linked = 0, unresolved = 0;
  for (const pr of prs) {
    const keys = new Set<string>();
    for (const id of itemIdsIn(`${pr.title}\n${pr.body ?? ""}`, prefixes)) { keys.add(id); add(id, id, pr); }
    const refs = claimRefs(pr.body);
    if (refs.length) linked++;
    for (const ref of refs) {
      const c = claims.get(ref);
      if (!c) { unresolved++; continue; }
      if (!c.ok) continue;
      if (c.ids.length) for (const id of c.ids) { keys.add(id); add(id, id, pr); }
      else { keys.add(`claim:${ref}`); add(`claim:${ref}`, c.text || `claim ${ref}`, pr); }
    }
    if (keys.size) named++;
  }
  const out: DuplicateGroup[] = [];
  for (const [key, g] of groups) {
    if (g.prs.size < 2) continue;
    const sorted = [...g.prs.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    out.push({
      key,
      label: g.label,
      competing: new Set(sorted.map((p) => p.user)).size > 1,
      prs: sorted.map(({ number, title, user, created_at, url }) => ({ number, title, user, created_at, url })),
    });
  }
  // competing groups first, then the biggest, then the most recent
  out.sort((a, b) => Number(b.competing) - Number(a.competing) || b.prs.length - a.prs.length || b.prs[b.prs.length - 1].created_at.localeCompare(a.prs[a.prs.length - 1].created_at));
  return { window: { prs: prs.length, named, linked, unresolved }, groups: out.slice(0, 40) };
}
