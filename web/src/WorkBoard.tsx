import { useState } from "react"
import type { Board } from "../../src/board"
import type { ClaimIssues } from "../../src/claimcheck"
import type { Duplicates } from "../../src/dupes"
import { ago } from "./useLive"
import { Badge } from "@/components/ui/badge"
import { HBarChart } from "./HBarChart"

const PR = (n: number) => `https://github.com/ItsNotRexed/Leonida/pull/${n}`

export function Areas({ board }: { board: Board }) {
  const areas = board.areas.filter((a) => a.items.length).map((a) => ({ name: a.area, count: a.items.length }))
  return <HBarChart data={areas} label="claimed items" color="oklch(0.65 0.19 255)" nameWidth={190} />
}

export function Claimers({ board }: { board: Board }) {
  return <HBarChart data={board.topClaimers.slice(0, 10).map((c) => ({ name: c.user, count: c.count }))} label="claimed items" color="oklch(0.65 0.2 300)" nameWidth={130} />
}

export function ClaimHealth({ board }: { board: Board }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <b className="text-foreground">{board.stale.items.length + board.stale.more}</b> claims are 3+ hours old with no PR (the coordinator releases them at 12 hours):{" "}
        {board.stale.items.slice(0, 8).map((s) => `${s.id} ${s.user} (${s.hours}h)`).join(" · ")}
        {board.stale.items.length > 8 || board.stale.more ? " …" : ""}
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{board.claimed} claimed</Badge>
        <Badge variant="secondary">{board.upForGrabs} listed up for grabs</Badge>
        {board.review.map((r) => (
          <Badge key={r.label} variant="outline">{r.label}: {r.unchecked} unchecked / {r.checked} checked</Badge>
        ))}
      </div>
    </div>
  )
}

/** Merge chains: each PR comes after the ones it depends on. The first PR in a chain is the one that can land next. */
export function Chains({ chains }: { chains: number[][] }) {
  const [all, setAll] = useState(false)
  const sorted = [...chains].sort((a, b) => b.length - a.length)
  const shown = all ? sorted : sorted.slice(0, 12)
  const prs = new Set(chains.flat()).size
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {chains.length} chains covering {prs} PRs · longest {sorted[0]?.length ?? 0} · the highlighted PR is next to land, the rest wait on the one before
      </p>
      {shown.map((c) => (
        <div key={c[0]} className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">{c.length}</span>
          {c.map((n, i) => (
            <span key={n} className="inline-flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <a href={PR(n)}><Badge variant={i === 0 ? "default" : "outline"}>#{n}</Badge></a>
            </span>
          ))}
        </div>
      ))}
      {sorted.length > 12 && (
        <button className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setAll(!all)}>
          {all ? "show fewer" : `show all ${sorted.length} chains`}
        </button>
      )}
    </div>
  )
}

const ISSUE = "https://github.com/ItsNotRexed/Leonida/issues"

/** What the coordination thread alone can show is going wrong: two people on one item, claims nothing can track,
 *  and items the board still offers although someone has claimed them. Derived from the newest comments only. */
export function ClaimProblems({ issues, now }: { issues: ClaimIssues; now: number }) {
  const w = issues.window
  const mins = w.from && w.to ? Math.max(1, Math.round((Date.parse(w.to) - Date.parse(w.from)) / 60_000)) : 0
  const Item = ({ url, children }: { url: string; children: React.ReactNode }) => <a className="underline-offset-2 hover:underline" href={url}>{children}</a>
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        From the newest {w.comments} comments on the coordination issue ({w.claims} claims over about {mins} min). Comments and the board stay the source of truth; this only shows where they disagree.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <section className="space-y-1.5">
          <h3 className="font-medium"><Badge variant={issues.collisions.length ? "destructive" : "secondary"}>{issues.collisions.length}</Badge> items held by more than one person</h3>
          {issues.collisions.length === 0 && <p className="text-muted-foreground">None in this window.</p>}
          {issues.collisions.slice(0, 8).map((c) => (
            <p key={c.id} className="text-muted-foreground">
              <b className="text-foreground">{c.id}</b>{" "}
              {c.holders.map((h, i) => (
                <span key={h.user}>{i > 0 && " · "}<Item url={h.url}>{h.user}</Item></span>
              ))}{" "}
              <small>({c.gapSec}s between the first two)</small>
            </p>
          ))}
        </section>
        <section className="space-y-1.5">
          <h3 className="font-medium"><Badge variant="secondary">{issues.listedButClaimed.length}</Badge> listed up for grabs but already claimed</h3>
          {issues.listedButClaimed.length === 0 && <p className="text-muted-foreground">The board and the comments agree.</p>}
          {issues.listedButClaimed.map((c) => (
            <p key={c.id} className="text-muted-foreground">
              <b className="text-foreground">{c.id}</b> claimed by <Item url={c.url}>{c.user}</Item> {ago(c.at, now)}
            </p>
          ))}
          {issues.listedButClaimed.length > 0 && <p className="text-xs text-muted-foreground">The board is rebuilt by hand, so it can lag the comments.</p>}
        </section>
        <section className="space-y-1.5">
          <h3 className="font-medium"><Badge variant="secondary">{issues.noId.count}</Badge> of {w.claims} claims have no item ID</h3>
          <p className="text-xs text-muted-foreground">Allowed for work that is not listed, but nothing can track or deduplicate it.</p>
          {issues.noId.recent.slice(0, 4).map((c) => (
            <p key={c.url} className="truncate text-muted-foreground" title={c.text}>
              <Item url={c.url}>{c.user}</Item>: {c.text}
            </p>
          ))}
        </section>
      </div>
    </div>
  )
}

/** Open PRs that name the same item: the same work written more than once, or one piece of work split across PRs. */
export function CompetingPrs({ dupes, now }: { dupes: Duplicates; now: number }) {
  const [all, setAll] = useState(false)
  const shown = all ? dupes.groups : dupes.groups.slice(0, 6)
  const competing = dupes.groups.filter((g) => g.competing).length
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Among the newest {dupes.window.prs} open PRs, <b className="text-foreground">{competing}</b> items have PRs from more than one author and {dupes.groups.length - competing} have several PRs from one author.
        Only {dupes.window.named} of those PRs name an item in their title or body (most link their claim comment instead), so this under-counts.
      </p>
      {dupes.groups.length === 0 && <p className="text-muted-foreground">No two of them name the same item.</p>}
      {shown.map((g) => (
        <div key={g.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant={g.competing ? "destructive" : "secondary"}>{g.id}</Badge>
          <span className="text-xs text-muted-foreground">{g.competing ? `${new Set(g.prs.map((p) => p.user)).size} authors` : "one author"}, {g.prs.length} PRs</span>
          {g.prs.map((p) => (
            <a key={p.number} className="rounded-md bg-muted/50 px-1.5 py-0.5 text-xs hover:underline" href={p.url} title={`${p.title} (${ago(p.created_at, now)})`}>
              #{p.number} <span className="text-muted-foreground">{p.user}</span>
            </a>
          ))}
        </div>
      ))}
      {dupes.groups.length > 6 && (
        <button className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setAll(!all)}>
          {all ? "show fewer" : `show all ${dupes.groups.length}`}
        </button>
      )}
    </div>
  )
}
