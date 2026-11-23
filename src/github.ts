export interface RecentPR {
  number: number;
  title: string;
  user: string;
  created_at: string;
  url: string;
}

import { aiStats, parseClaim, type AiStats, type ClaimEvent } from "./parse";
import { itemPrefixes, parseBoard, type Board } from "./board";
import { findDuplicates, type Duplicates } from "./dupes";
import { checkClaims, type ClaimIssues } from "./claimcheck";
import type { ProjectStatus } from "./status";

export interface Snapshot {
  ts: number; // when this poll started (server clock)
  nextAt?: number; // when the next poll is scheduled to start (server clock); the UI counts down to it
  prOpen: number;
  prMerged: number;
  prClosed: number; // closed without merge
  issueOpen: number;
  issueClosed: number;
  recent: RecentPR[];
  ai: AiStats & { totalMarked: number }; // sample = newest PRs; totalMarked = all PRs with an AI-assisted note
  coordination: { issue: number; url: string; comments: number } | null;
  claims: ClaimEvent[]; // newest claim/status/blocked/done/... events
  duplicates?: Duplicates; // open PRs that name the same item
  claimIssues?: ClaimIssues; // double claims, claims without an ID, items listed free but claimed
  board: Board | null; // parsed from the coordination issue's generated body
  status?: ProjectStatus; // the README's "Project status" table (added by the Hub)
  activity?: Activity; // comment volume on the coordination issue (added by the Hub, which keeps the history)
}

export interface Activity {
  bucketMs: number;
  buckets: { t: number; claiming: number; status: number; blocked: number; releasing: number; done: number; finding: number; other: number }[];
}

/** One comment on the coordination issue, reduced to what the activity chart needs. */
export interface CommentStamp { id: number; ts: number; kind: string }

interface SearchResult {
  total_count: number;
  items: { number: number; title: string; body: string | null; comments: number; user: { login: string } | null; created_at: string; html_url: string }[];
}

async function gh<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "leonida-status-worker",
      "x-github-api-version": "2022-11-28",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function search(repo: string, q: string, token: string | undefined, perPage = 1, page = 1): Promise<SearchResult> {
  return gh(`/search/issues?q=${encodeURIComponent(`repo:${repo} ${q}`)}&sort=created&order=desc&per_page=${perPage}&page=${page}`, token);
}

interface RawComment { id: number; user: { login: string } | null; body: string; created_at: string; html_url: string }

/** The coordination issue rotates (#8186 -> #8344 -> #8504...), so look up the newest un-moved one each time. */
async function fetchClaims(repo: string, token?: string) {
  const found = await search(repo, 'is:issue is:open "Coordinating who works on what" in:title', token, 5);
  const issue = found.items.find((i) => !/moved to/i.test(i.title)) ?? found.items[0];
  if (!issue) return { coordination: null, claims: [] as ClaimEvent[], board: null, claimIssues: undefined, prefixes: new Set<string>(), stamps: [] as CommentStamp[] };
  const lastPage = Math.max(1, Math.ceil(issue.comments / 100));
  const pages = [lastPage, lastPage - 1].filter((p) => p >= 1);
  const comments = (await Promise.all(pages.map((p) => gh<RawComment[]>(`/repos/${repo}/issues/${issue.number}/comments?per_page=100&page=${p}`, token)))).flat();
  const board = parseBoard(issue.body); // the search result already carries the issue body
  const prefixes = itemPrefixes(board);
  const known = (id: string) => !prefixes.size || prefixes.has(id.slice(0, id.lastIndexOf("-")));
  const parsed = comments.map((c) => {
    const e = parseClaim(c);
    return { c, e: e && { ...e, itemIds: e.itemIds.filter(known) } };
  });
  const events = parsed.map((x) => x.e).filter((e): e is ClaimEvent => e !== null).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    coordination: { issue: issue.number, url: issue.html_url, comments: issue.comments },
    prefixes,
    claimIssues: checkClaims(events, comments.length, board?.grabIds ?? []),
    claims: events.slice(-60).reverse(),
    board,
    stamps: parsed.map(({ c, e }) => ({ id: c.id, ts: Date.parse(c.created_at), kind: e?.kind ?? "other" })),
  };
}

export async function fetchSnapshot(repo: string, token?: string): Promise<{ snap: Snapshot; stamps: CommentStamp[] }> {
  const [prOpen, prOpen2, prOpen3, prMerged, prClosed, issueOpen, issueClosed, sample1, sample2, aiTotal, claimData] = await Promise.all([
    search(repo, "is:pr is:open", token, 100),
    search(repo, "is:pr is:open", token, 100, 2),
    search(repo, "is:pr is:open", token, 100, 3),
    search(repo, "is:pr is:merged", token),
    search(repo, "is:pr is:closed is:unmerged", token),
    search(repo, "is:issue is:open", token),
    search(repo, "is:issue is:closed", token),
    search(repo, "is:pr", token, 100, 1),
    search(repo, "is:pr", token, 100, 2),
    search(repo, 'is:pr "AI-assisted" in:body', token),
    fetchClaims(repo, token),
  ]);
  const snap: Snapshot = {
    ts: Date.now(),
    prOpen: prOpen.total_count,
    prMerged: prMerged.total_count,
    prClosed: prClosed.total_count,
    issueOpen: issueOpen.total_count,
    issueClosed: issueClosed.total_count,
    recent: prOpen.items.slice(0, 10).map((i) => ({
      number: i.number,
      title: i.title,
      user: i.user?.login ?? "ghost",
      created_at: i.created_at,
      url: i.html_url,
    })),
    ai: { ...aiStats([...sample1.items, ...sample2.items].map((i) => i.body)), totalMarked: aiTotal.total_count },
    coordination: claimData.coordination,
    claims: claimData.claims,
    duplicates: findDuplicates(
      [...prOpen.items, ...prOpen2.items, ...prOpen3.items].map((i) => ({ number: i.number, title: i.title, user: i.user?.login ?? "ghost", body: i.body, created_at: i.created_at, url: i.html_url })),
      claimData.prefixes,
    ),
    claimIssues: claimData.claimIssues,
    board: claimData.board,
  };
  return { snap, stamps: claimData.stamps };
}
