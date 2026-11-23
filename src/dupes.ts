import { itemIdsIn } from "./board";

export interface OpenPr { number: number; title: string; user: string; body: string | null; created_at: string; url: string }

/** Open PRs that name the same item. Derived from the newest open PRs only, and only from item IDs written in the
 *  title or body (most PRs name their claim by a comment link instead, which this cannot match to an item). */
export interface DuplicateGroup {
  id: string;
  competing: boolean; // more than one author: two people did the same item. One author with several PRs is usually a split.
  prs: { number: number; title: string; user: string; created_at: string; url: string }[]; // oldest first
}
export interface Duplicates {
  window: { prs: number; named: number }; // PRs looked at, and how many of them name an item at all
  groups: DuplicateGroup[];
}

export function findDuplicates(prs: OpenPr[], prefixes: ReadonlySet<string>): Duplicates {
  const byItem = new Map<string, OpenPr[]>();
  let named = 0;
  for (const pr of prs) {
    const ids = itemIdsIn(`${pr.title}\n${pr.body ?? ""}`, prefixes);
    if (ids.length) named++;
    for (const id of ids) byItem.set(id, [...(byItem.get(id) ?? []), pr]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [id, list] of byItem) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    groups.push({
      id,
      competing: new Set(sorted.map((p) => p.user)).size > 1,
      prs: sorted.map(({ number, title, user, created_at, url }) => ({ number, title, user, created_at, url })),
    });
  }
  // competing groups first, then the biggest, then the most recent
  groups.sort((a, b) => Number(b.competing) - Number(a.competing) || b.prs.length - a.prs.length || b.prs[b.prs.length - 1].created_at.localeCompare(a.prs[a.prs.length - 1].created_at));
  return { window: { prs: prs.length, named }, groups: groups.slice(0, 40) };
}
