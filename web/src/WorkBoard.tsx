import { useState } from "react"
import type { Board } from "../../src/board"
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
