import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

/** Horizontal ranking: one bar per name, with a tooltip and the count printed at the end of each bar. */
export function HBarChart({ data, label, color, nameWidth = 96 }: {
  data: { name: string; count: number }[]
  label: string
  color: string
  nameWidth?: number
}) {
  const config = { count: { label, color } } satisfies ChartConfig
  if (!data.length) return <p className="text-sm text-muted-foreground">nothing named yet</p>
  return (
    <ChartContainer config={config} className="w-full" style={{ height: data.length * 26 + 8 }}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 28, top: 0, bottom: 0 }}>
        <YAxis dataKey="name" type="category" width={nameWidth} tickLine={false} axisLine={false} interval={0} />
        <XAxis type="number" hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} isAnimationActive={false}>
          <LabelList dataKey="count" position="right" className="fill-foreground" fontSize={12} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
