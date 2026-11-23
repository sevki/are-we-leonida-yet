import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { Activity } from "../../src/github"

const config = {
  claiming: { label: "claiming", color: "oklch(0.65 0.19 255)" },
  status: { label: "status", color: "oklch(0.75 0.12 215)" },
  blocked: { label: "blocked", color: "oklch(0.78 0.16 75)" },
  releasing: { label: "releasing", color: "oklch(0.65 0.22 25)" },
  done: { label: "done", color: "oklch(0.72 0.19 150)" },
  finding: { label: "finding", color: "oklch(0.65 0.2 300)" },
  other: { label: "other comments", color: "oklch(0.7 0 0)" },
} satisfies ChartConfig

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

/** Comments on the coordination issue per 10 minutes, stacked by command. */
export function ActivityChart({ activity }: { activity: Activity }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-full min-h-[120px] w-full">
      <BarChart data={activity.buckets} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="t" tickFormatter={time} tickLine={false} axisLine={false} minTickGap={40} />
        <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => (p[0] ? `${time(p[0].payload.t)} – ${time(p[0].payload.t + activity.bucketMs)}` : "")} />} />
        <ChartLegend content={<ChartLegendContent />} />
        {(Object.keys(config) as (keyof typeof config)[]).map((k) => (
          <Bar key={k} dataKey={k} stackId="a" fill={`var(--color-${k})`} isAnimationActive={false} />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
