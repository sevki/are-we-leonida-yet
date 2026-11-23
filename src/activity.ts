/** Opened / merged / closed events for pull requests and issues, built from search results. */
export interface ItemEvent {
  kind: "opened" | "merged" | "closed" | "reopened";
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

/** One entry of the repository's issue-events feed (`GET /repos/{repo}/issues/events`), which covers issues and PRs. */
export interface RawIssueEvent {
  event: string;
  created_at: string;
  actor: { login: string } | null;
  issue?: { number: number; title: string; html_url: string; pull_request?: unknown } | null;
}

/** Reopen events, split into pull requests and issues. Search results carry no reopen time, so this feed is the only
 *  source. The user is whoever reopened it, which is often not the author. */
export function reopenedEvents(raw: RawIssueEvent[]): { pr: ItemEvent[]; issue: ItemEvent[] } {
  const out = { pr: [] as ItemEvent[], issue: [] as ItemEvent[] };
  for (const e of raw) {
    if (e.event !== "reopened" || !e.issue) continue;
    const ev: ItemEvent = { kind: "reopened", number: e.issue.number, title: e.issue.title, user: e.actor?.login ?? "ghost", at: e.created_at, url: e.issue.html_url };
    (e.issue.pull_request ? out.pr : out.issue).push(ev);
  }
  return out;
}

/** Every item gives an "opened" event, and a closed or merged one if it has ended; `extra` adds events from elsewhere
 *  (reopens). Items seen in several lists count once, and an item reopened twice shows its latest reopen. */
export function itemEvents(lists: RawItem[][], limit = 40, extra: ItemEvent[] = []): ItemEvent[] {
  const out = new Map<string, ItemEvent>();
  for (const e of [...extra].sort((a, b) => a.at.localeCompare(b.at))) out.set(`${e.kind}:${e.number}`, e);
  for (const i of lists.flat()) {
    const base = { number: i.number, title: i.title, user: i.user?.login ?? "ghost", url: i.html_url };
    out.set(`opened:${i.number}`, { ...base, kind: "opened", at: i.created_at });
    const merged = i.pull_request?.merged_at;
    if (merged) out.set(`merged:${i.number}`, { ...base, kind: "merged", at: merged });
    else if (i.closed_at) out.set(`closed:${i.number}`, { ...base, kind: "closed", at: i.closed_at });
  }
  return [...out.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
