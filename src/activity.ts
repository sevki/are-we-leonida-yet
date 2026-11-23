/** Opened / merged / closed events for pull requests and issues, built from search results. */
export interface ItemEvent {
  kind: "opened" | "merged" | "closed";
  number: number;
  title: string;
  user: string;
  at: string;
  url: string;
}

export interface RawItem {
  number: number;
  title: string;
  user: { login: string } | null;
  created_at: string;
  closed_at?: string | null;
  html_url: string;
  pull_request?: { merged_at?: string | null };
}

/** Every item gives an "opened" event, and a closed or merged one if it has ended. Items seen in several lists count once. */
export function itemEvents(lists: RawItem[][], limit = 40): ItemEvent[] {
  const out = new Map<string, ItemEvent>();
  for (const i of lists.flat()) {
    const base = { number: i.number, title: i.title, user: i.user?.login ?? "ghost", url: i.html_url };
    out.set(`opened:${i.number}`, { ...base, kind: "opened", at: i.created_at });
    const merged = i.pull_request?.merged_at;
    if (merged) out.set(`merged:${i.number}`, { ...base, kind: "merged", at: merged });
    else if (i.closed_at) out.set(`closed:${i.number}`, { ...base, kind: "closed", at: i.closed_at });
  }
  return [...out.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
