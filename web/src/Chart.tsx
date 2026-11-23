import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { HistoryPoint } from "./useLive"

export type SeriesKey = Exclude<keyof HistoryPoint, "ts">

export const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: "prOpen", label: "Open PRs", color: "oklch(0.65 0.19 255)" },
  { key: "prMerged", label: "Merged PRs", color: "oklch(0.72 0.19 150)" },
  { key: "prClosed", label: "Closed unmerged PRs", color: "oklch(0.7 0.14 60)" },
  { key: "issueOpen", label: "Open issues", color: "oklch(0.65 0.22 25)" },
  { key: "issueClosed", label: "Closed issues", color: "oklch(0.65 0.2 300)" },
]

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

/** One series with its own auto-fitted axis, so a line that moves by a few (merged PRs)
 *  is not flattened by one that moves by hundreds (open PRs). Fills its panel. */
export function SeriesPanel({ points, s }: { points: HistoryPoint[]; s: (typeof SERIES)[number] }) {
  const config = { [s.key]: { label: s.label, color: s.color } } satisfies ChartConfig
  const { lo, hi, last, delta } = useMemo(() => {
    const v = points.map((p) => p[s.key])
    const min = Math.min(...v), max = Math.max(...v)
    const pad = Math.max(1, Math.round((max - min) * 0.15)) // a flat line still gets a visible band
    return { lo: min - pad, hi: max + pad, last: v[v.length - 1], delta: v[v.length - 1] - v[0] }
  }, [points, s.key])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-baseline gap-2">
        <i className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
        <b className="text-lg font-semibold tabular-nums">{last.toLocaleString()}</b>
        <span className={`text-xs tabular-nums ${delta > 0 ? "text-green-500" : delta < 0 ? "text-red-500" : "text-muted-foreground"}`}>
          {delta > 0 ? "+" : ""}{delta.toLocaleString()} in window
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ChartContainer config={config} className="aspect-auto h-full min-h-[70px] w-full">
          <LineChart data={points} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={time} tickLine={false} axisLine={false} minTickGap={56} fontSize={11} />
            <YAxis domain={[lo, hi]} allowDecimals={false} width={46} tickLine={false} axisLine={false} fontSize={11} tickCount={3} tickFormatter={(v: number) => v.toLocaleString()} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => (p[0] ? new Date(p[0].payload.ts).toLocaleString() : "")} />} />
            <Line dataKey={s.key} stroke={`var(--color-${s.key})`} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  )
}
