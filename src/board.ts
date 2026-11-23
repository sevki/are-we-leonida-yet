/** Parser for the coordination issue's generated body (the tables the coordinator's script maintains). */

export interface OpenItem { id: string; user: string }
export interface OpenArea { area: string; items: OpenItem[] }
export interface ReviewRow { label: string; unchecked: number; checked: number }

export interface Board {
  updated: string | null; // as printed: "2026-11-23 19:32 UTC"
  areas: OpenArea[]; // "Open work": claimed item IDs per area
  claimed: number;
  topClaimers: { user: string; count: number }[];
  stale: { items: { id: string; user: string; hours: number }[]; more: number }; // claimed 3+ hours without a PR
  chains: number[][]; // merge order, left to right: each PR depends on the ones before it
  review: ReviewRow[];
  upForGrabs: number;
  grabIds: string[]; // the item IDs listed as up for grabs
}

export const ITEM_ID = /\b[A-Z][A-Z0-9]*-\d+\b/g;

/** Text of a `### Title` section (up to the next `### `), or "". */
function section(body: string, title: string): string {
  const i = body.search(new RegExp(`^### ${title}`, "m"));
  if (i < 0) return "";
  const rest = body.slice(i).split("\n").slice(1).join("\n");
  const end = rest.search(/^### /m);
  return end < 0 ? rest : rest.slice(0, end);
}

export function parseBoard(raw: string | null): Board | null {
  if (!raw) return null;
  const body = raw.replace(/\r\n?/g, "\n"); // GitHub serves issue bodies with CRLF, which defeats `$` anchors
  const pair = /\b([A-Z][A-Z0-9]*-\d+) `([^`]+)`/g;

  const areas: OpenArea[] = [];
  for (const part of section(body, "Open work").split(/^#### /m).slice(1)) {
    const [head, ...lines] = part.split("\n");
    const items = [...lines.join("\n").matchAll(pair)].map((m) => ({ id: m[1], user: m[2] }));
    areas.push({ area: head.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s*[(:].*$/, "").trim(), items });
  }
  const perUser = new Map<string, number>();
  for (const a of areas) for (const it of a.items) perUser.set(it.user, (perUser.get(it.user) ?? 0) + 1);

  const staleText = section(body, "Claimed for 3\\+ hours");
  const stale = {
    items: [...staleText.matchAll(/\b([A-Z][A-Z0-9]*-\d+) `([^`]+)` \((\d+)h\)/g)].map((m) => ({ id: m[1], user: m[2], hours: +m[3] })),
    more: Number(/and (\d+) more/.exec(staleText)?.[1] ?? 0),
  };

  const chains = section(body, "Merge chains")
    .split("\n")
    .filter((l) => l.startsWith("- #"))
    .map((l) => [...l.matchAll(/#(\d+)/g)].map((m) => +m[1]))
    .filter((c) => c.length >= 2);

  const review = [...section(body, "Ready for review").matchAll(/^- \*\*([^*]+)\*\* \((\d+) unchecked, (\d+) checked\)/gm)].map(
    (m) => ({ label: m[1], unchecked: +m[2], checked: +m[3] }),
  );

  const grabIds = section(body, "Up for grabs").split("\n").flatMap((l) => /^\| ([A-Z][A-Z0-9]*-\d+) \|/.exec(l)?.[1] ?? []);

  return {
    updated: /_Updated (.+?) by the coordinator/.exec(body)?.[1] ?? null,
    areas,
    claimed: areas.reduce((n, a) => n + a.items.length, 0),
    topClaimers: [...perUser].map(([user, count]) => ({ user, count })).sort((a, b) => b.count - a.count).slice(0, 15),
    stale,
    chains,
    review,
    upForGrabs: grabIds.length,
    grabIds,
  };
}
