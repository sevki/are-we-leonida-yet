import type { ReactNode } from "react"
import type { LayoutItem } from "react-grid-layout"
import type { Snapshot } from "../../src/github"
import { Badge } from "@/components/ui/badge"
import { ActivityChart } from "./ActivityChart"
import { SERIES, SeriesPanel } from "./Chart"
import { ClaimTrace } from "./ClaimTrace"
import { HBarChart } from "./HBarChart"
import { StatusCard } from "./StatusCard"
import { ago, STAT_KEYS, type Flash, type HistoryPoint, type StatKey } from "./useLive"
import { Areas, Chains, ClaimHealth, ClaimProblems, Claimers } from "./WorkBoard"

export interface Ctx {
  snap: Snapshot
  history: HistoryPoint[]
  flash: Partial<Record<StatKey, Flash>>
  fresh: ReadonlySet<string>
  now: number
}

export interface PanelDef {
  id: string
  title: string
  w: number // default size on the 12-column grid
  h: number // in rows
  at?: { x: number; y: number } // default position on the 12-column grid; narrower grids are packed automatically
  minW?: number
  minH?: number
  render: (c: Ctx) => ReactNode
}

const fmt = (n: number) => n.toLocaleString()
const signed = (n: number | null) => (n == null ? "–" : (n > 0 ? "+" : "") + n.toFixed(1))
const empty = (what: string) => <p className="text-sm text-muted-foreground">{what} isn't available yet.</p>

const rate = (c: Ctx, key: keyof HistoryPoint) => {
  const p = c.history.find((h) => h.ts >= c.snap.ts - 3600e3)
  const dt = p ? (c.snap.ts - p.ts) / 3600e3 : 0
  return p && dt > 0.01 ? (c.snap[key] - p[key]) / dt : null
}

function BigNumber({ value, flash }: { value: string; flash?: Flash }) {
  return (
    <div className="relative flex h-full items-center">
      {/* keyed by n so every change replays the animation */}
      {flash && <i key={`f${flash.n}`} className={`flash ${flash.dir}`} />}
      {flash && <Badge key={`d${flash.n}`} variant={flash.dir === "up" ? "default" : "destructive"} className="delta absolute top-0 right-0">{flash.delta > 0 ? "+" : ""}{flash.delta}</Badge>}
      <b className="text-3xl font-semibold tabular-nums">{value}</b>
    </div>
  )
}

const LABELS: Record<StatKey, string> = { prOpen: "Open PRs", prMerged: "Merged PRs", prClosed: "Closed unmerged", issueOpen: "Open issues", issueClosed: "Closed issues" }

export const PANELS: PanelDef[] = [
  ...STAT_KEYS.map((k, i): PanelDef => ({ id: `stat-${k}`, title: LABELS[k], w: 2, h: 3, at: { x: i * 2, y: 0 }, minW: 1, minH: 2, render: (c) => <BigNumber value={fmt(c.snap[k])} flash={c.flash[k]} /> })),
  {
    id: "rates", title: "Per hour", w: 2, h: 3, at: { x: 10, y: 0 }, minW: 1, minH: 2,
    render: (c) => (
      <div className="flex h-full flex-col justify-center gap-1 text-sm">
        <div><b className="text-xl tabular-nums">{signed(rate(c, "prMerged"))}</b> <span className="text-muted-foreground">merged</span></div>
        <div><b className="text-xl tabular-nums">{signed(rate(c, "prOpen"))}</b> <span className="text-muted-foreground">open PR change</span></div>
      </div>
    ),
  },
  { id: "status", title: "Are we Leonida yet?", w: 3, h: 14, at: { x: 0, y: 3 }, minW: 2, minH: 5, render: (c) => (c.snap.status ? <StatusCard status={c.snap.status} /> : empty("The README status")) },
  ...SERIES.map((s, i): PanelDef => ({ id: `trend-${s.key}`, title: s.label, w: 3, h: 7, at: { x: 3 + (i % 3) * 3, y: 3 + Math.floor(i / 3) * 7 }, minW: 2, minH: 4, render: (c) => <SeriesPanel points={[...c.history, c.snap]} s={s} /> })),
  {
    id: "ai-tools", title: "AI-assisted PRs: tools", w: 4, h: 9, at: { x: 0, y: 25 }, minW: 2, minH: 3,
    render: (c) => (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {c.snap.ai.sample ? Math.round((c.snap.ai.assisted / c.snap.ai.sample) * 100) : 0}% of the newest {c.snap.ai.sample} PRs carry an AI-assisted note ({fmt(c.snap.ai.totalMarked)} of {fmt(c.snap.prOpen + c.snap.prMerged + c.snap.prClosed)} overall). {c.snap.ai.unnamed} name no tool or model; some name several.
        </p>
        <HBarChart data={c.snap.ai.tools} label="PRs" color="oklch(0.65 0.19 255)" />
      </div>
    ),
  },
  { id: "ai-models", title: "AI-assisted PRs: models", w: 3, h: 7, at: { x: 9, y: 10 }, minW: 2, minH: 3, render: (c) => <HBarChart data={c.snap.ai.models} label="PRs" color="oklch(0.72 0.19 150)" /> },
  { id: "areas", title: "Claimed items by area", w: 4, h: 9, at: { x: 4, y: 25 }, minW: 2, minH: 4, render: (c) => (c.snap.board ? <Areas board={c.snap.board} /> : empty("The board")) },
  { id: "claimers", title: "Most claims held", w: 4, h: 9, at: { x: 8, y: 25 }, minW: 2, minH: 4, render: (c) => (c.snap.board ? <Claimers board={c.snap.board} /> : empty("The board")) },
  { id: "claim-health", title: "Stale claims and review queue", w: 12, h: 5, at: { x: 0, y: 34 }, minW: 3, minH: 3, render: (c) => (c.snap.board ? <ClaimHealth board={c.snap.board} /> : empty("The board")) },
  {
    id: "claim-problems", title: "Claim problems", w: 12, h: 10, at: { x: 0, y: 39 }, minW: 3, minH: 4,
    render: (c) => (c.snap.claimIssues ? <ClaimProblems issues={c.snap.claimIssues} now={c.now} /> : empty("Claim problems")),
  },
  {
    id: "activity", title: "Comments on the coordination issue", w: 12, h: 8, at: { x: 0, y: 17 }, minW: 3, minH: 4,
    render: (c) => (c.snap.activity ? <div className="h-full"><ActivityChart activity={c.snap.activity} /></div> : empty("Comment activity")),
  },
  { id: "chains", title: "Merge chains", w: 12, h: 10, at: { x: 0, y: 49 }, minW: 3, minH: 4, render: (c) => (c.snap.board?.chains.length ? <Chains chains={c.snap.board.chains} /> : empty("Merge chains")) },
  {
    id: "claims", title: "Latest claim activity", w: 6, h: 16, at: { x: 0, y: 59 }, minW: 3, minH: 4,
    render: (c) => <ClaimTrace items={c.snap.claims ?? []} idOf={(e) => `ev:${e.url}`} fresh={c.fresh} now={c.now} limit={25} empty="none found" />,
  },
  {
    id: "recent", title: "Newest open PRs", w: 6, h: 16, at: { x: 6, y: 59 }, minW: 3, minH: 4,
    render: (c) => (
      <ul className="space-y-1 text-sm">
        {c.snap.recent.map((p) => (
          <li key={p.number} className={`rounded-md px-2 py-1 ${c.fresh.has(`pr:${p.number}`) ? "new-row" : ""}`}>
            <a className="hover:underline" href={p.url}>#{p.number} {p.title}</a>{" "}
            <small className="text-muted-foreground">by {p.user} · {ago(p.created_at, c.now)}</small>
          </li>
        ))}
      </ul>
    ),
  },
]

export const PANEL_IDS = new Set(PANELS.map((p) => p.id))

// ---- default layouts: a left-to-right shelf packer per breakpoint; the grid's compactor tidies the gaps ----
export const BREAKPOINTS = { lg: 1100, md: 700, sm: 0 }
export const COLS = { lg: 12, md: 8, sm: 2 }

const scaleW = (w: number, cols: number) =>
  cols === 12 ? w : cols === 8 ? Math.min(8, Math.max(2, Math.ceil((w * 8) / 12))) : w <= 2 ? 1 : 2

export function pack(cols: number): LayoutItem[] {
  let x = 0, y = 0, rowH = 0
  return PANELS.map((d) => {
    const w = scaleW(d.w, cols)
    if (x + w > cols) { x = 0; y += rowH; rowH = 0 }
    const fixed = cols === 12 ? d.at : undefined
    const item: LayoutItem = { i: d.id, x: fixed?.x ?? x, y: fixed?.y ?? y, w, h: d.h, minW: Math.min(d.minW ?? 1, w), minH: d.minH ?? 2 }
    if (fixed) return item
    x += w
    rowH = Math.max(rowH, d.h)
    return item
  })
}

export const defaultLayouts = () => ({ lg: pack(12), md: pack(8), sm: pack(2) })
