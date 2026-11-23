import { useEffect, useMemo, useState } from "react"
import type { Snapshot } from "../../src/github"
import type { HistoryPoint } from "./useLive"

export const RANGES = [
  { id: "15m", label: "15m", ms: 15 * 60_000, name: "15 minutes" },
  { id: "1h", label: "1h", ms: 3600_000, name: "hour" },
  { id: "6h", label: "6h", ms: 6 * 3600_000, name: "6 hours" },
  { id: "24h", label: "24h", ms: 24 * 3600_000, name: "24 hours" },
  { id: "7d", label: "7d", ms: 7 * 24 * 3600_000, name: "7 days" },
] as const
export type Range = (typeof RANGES)[number]

const KEY = "leonida-status:range:v1"
const LIVE_MS = 24 * 3600_000 // what the websocket already delivers; longer ranges are fetched
const REFETCH_MS = 5 * 60_000

function load(): Range {
  try {
    const id = localStorage.getItem(KEY)
    return RANGES.find((r) => r.id === id) ?? RANGES[3]
  } catch { return RANGES[3] }
}

/** The chosen time range, remembered in this browser, and the history that falls inside it. */
export function useRange(live: HistoryPoint[], snap: Snapshot | undefined) {
  const [range, setRangeState] = useState<Range>(load)
  const [far, setFar] = useState<HistoryPoint[]>()

  const setRange = (r: Range) => {
    setRangeState(r)
    try { localStorage.setItem(KEY, r.id) } catch { /* not remembered */ }
  }

  // beyond what the websocket carries, ask the server (it thins the series) and refresh now and then
  useEffect(() => {
    if (range.ms <= LIVE_MS) { setFar(undefined); return }
    let alive = true
    const get = async () => {
      try {
        const res = await fetch(`/api/stats?range=${range.ms}`, { cache: "no-store" })
        if (res.ok && alive) setFar(((await res.json()) as { history: HistoryPoint[] }).history)
      } catch { /* keep what we have */ }
    }
    get()
    const t = window.setInterval(get, REFETCH_MS)
    return () => { alive = false; clearInterval(t) }
  }, [range])

  const history = useMemo(() => {
    const now = snap?.ts ?? Date.now()
    if (range.ms <= LIVE_MS) return live.filter((p) => p.ts >= now - range.ms)
    const base = far ?? live
    const last = base.length ? base[base.length - 1].ts : 0
    return [...base, ...live.filter((p) => p.ts > last)]
  }, [range, live, far, snap?.ts])

  // how much of the range the recorded data actually covers (the dashboard only started recording at some point)
  const spanMs = history.length ? (snap?.ts ?? history[history.length - 1].ts) - history[0].ts : 0
  return { range, setRange, history, spanMs }
}
