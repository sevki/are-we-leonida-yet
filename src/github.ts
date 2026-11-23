export interface RecentPR {
  number: number;
  title: string;
  user: string;
  created_at: string;
  url: string;
}

import { aiStats, parseClaim, type AiStats, type ClaimEvent } from "./parse";
import { itemPrefixes, parseBoard, type Board } from "./board";
import { claimRefs, findDuplicates, type Duplicates, type ResolvedClaim } from "./dupes";
import { checkClaims, type ClaimIssues } from "./claimcheck";
import { itemEvents, reopenedEvents, type ItemEvent, type RawIssueEvent, type RawItem } from "./activity";
import type { ProjectStatus } from "./status";

export interface Snapshot {
  repo: string; // the repository's current full name (it can be renamed or transferred)
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
  prEvents?: ItemEvent[]; // newest opened / merged / closed pull requests
  issueEvents?: ItemEvent[]; // newest opened / closed issues
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
  items: (RawItem & { body: string | null; comments: number })[];
}

/** A failed GitHub call, with what a caller needs to react: the status, and when a rate limit lifts. */
export class GitHubError extends Error {
  constructor(public status: number, message: string, public resetAt?: number) {
    super(message);
  }
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
  if (!res.ok) {
    const text = await res.text();
    let detail = text.slice(0, 200);
    try { detail = (JSON.parse(text) as { message?: string }).message ?? detail; } catch { /* not JSON */ }
    // a rate limit says when it lifts: Retry-After (seconds), or the reset time when none is left
    const retry = Number(res.headers.get("retry-after"));
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const limited = (res.status === 403 || res.status === 429) && (retry > 0 || res.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(detail));
    const resetAt = limited ? (retry > 0 ? Date.now() + retry * 1000 : reset > 0 ? reset * 1000 : undefined) : undefined;
    throw new GitHubError(res.status, `GitHub ${res.status} on ${path.split("?")[0]}: ${detail}`, resetAt);
  }
  return res.json();
}

function search(repo: string, q: string, token: string | undefined, perPage = 1, page = 1, sort: "created" | "updated" = "created"): Promise<SearchResult> {
  return gh(`/search/issues?q=${encodeURIComponent(`repo:${repo} ${q}`)}&sort=${sort}&order=desc&per_page=${perPage}&page=${page}`, token);
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

/** The name GitHub knows the repository by today. A renamed or transferred repo keeps answering REST calls under its
 *  old name (a redirect), but search does not follow it and rejects the old name with a 422. */
async function canonicalName(repo: string, token?: string): Promise<string> {
  try {
    return (await gh<{ full_name: string }>(`/repos/${repo}`, token)).full_name || repo;
  } catch (e) {
    console.error("repo lookup failed, using the configured name", e);
    return repo;
  }
}

const RESOLVE_PER_POLL = 40; // new claim comments looked up per poll, so the first fill spreads over a few polls

/** Look up claim comments the PRs link to and that are not cached yet. Only a missing comment is remembered as
 *  missing; a rate limit or network error is retried on the next poll. */
async function resolveClaims(repo: string, token: string | undefined, wanted: number[], known: ReadonlyMap<number, ResolvedClaim>, known2: (id: string) => boolean): Promise<ResolvedClaim[]> {
  const todo = wanted.filter((id) => !known.has(id)).slice(0, RESOLVE_PER_POLL);
  const out: ResolvedClaim[] = [];
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(todo.slice(i, i + 10).map(async (id) => {
      try {
        const c = await gh<RawComment>(`/repos/${repo}/issues/comments/${id}`, token);
        const e = parseClaim(c);
        out.push({ id, ok: true, user: c.user?.login ?? "ghost", ids: (e?.itemIds ?? []).filter(known2), text: e?.text ?? "", url: c.html_url });
      } catch (err) {
        if (err instanceof GitHubError && err.status === 404) out.push({ id, ok: false, user: "", ids: [], text: "", url: "" });
        else console.error("claim lookup failed", id, err);
      }
    }));
  }
  return out;
}

export async function fetchSnapshot(
  configured: string,
  token?: string,
  known: ReadonlyMap<number, ResolvedClaim> = new Map(),
  kept: { pr: ItemEvent[]; issue: ItemEvent[] } = { pr: [], issue: [] }, // reopen events stored on earlier polls
): Promise<{ snap: Snapshot; stamps: CommentStamp[]; resolved: ResolvedClaim[]; reopened: { pr: ItemEvent[]; issue: ItemEvent[] } }> {
  const repo = await canonicalName(configured, token);
  const [prOpen, prOpen2, prOpen3, prMerged, prClosed, issueOpen, issueClosed, sample1, sample2, aiTotal, claimData, prEnded, issueNew, issueEnded, reopened] = await Promise.all([
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
    search(repo, "is:pr is:closed", token, 100, 1, "updated"), // recently closed or merged
    search(repo, "is:issue", token, 50), // newest issues
    search(repo, "is:issue is:closed", token, 50, 1, "updated"), // recently closed issues
    // reopen events exist only in the events feed. It is supplementary, so a failure there must not lose the poll.
    Promise.all([1, 2].map((p) => gh<RawIssueEvent[]>(`/repos/${repo}/issues/events?per_page=100&page=${p}`, token))).then((r) => reopenedEvents(r.flat()))
      .catch((e) => { console.error("issue events failed", String(e).slice(0, 200)); return { pr: [] as ItemEvent[], issue: [] as ItemEvent[] }; }),
  ]);
  const openPrs = [...prOpen.items, ...prOpen2.items, ...prOpen3.items].map((i) => ({ number: i.number, title: i.title, user: i.user?.login ?? "ghost", body: i.body, created_at: i.created_at, url: i.html_url }));
  const prefixes = claimData.prefixes;
  const resolved = await resolveClaims(repo, token, [...new Set(openPrs.flatMap((p) => claimRefs(p.body)))], known, (id) => !prefixes.size || prefixes.has(id.slice(0, id.lastIndexOf("-"))));
  const claimMap = new Map([...known, ...resolved.map((c): [number, ResolvedClaim] => [c.id, c])]);
  const snap: Snapshot = {
    repo,
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
    prEvents: itemEvents([sample1.items, sample2.items, prEnded.items], 40, [...kept.pr, ...reopened.pr]),
    issueEvents: itemEvents([issueNew.items, issueEnded.items], 40, [...kept.issue, ...reopened.issue]),
    duplicates: findDuplicates(openPrs, prefixes, claimMap),
    claimIssues: claimData.claimIssues,
    board: claimData.board,
  };
  return { snap, stamps: claimData.stamps, resolved, reopened };
}
