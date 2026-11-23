import { useEffect, useRef, useState } from "react"
import type { Snapshot } from "../../src/github"
import type { Health } from "../../src/health"

export type HistoryPoint = Pick<Snapshot, "ts" | "prOpen" | "prMerged" | "prClosed" | "issueOpen" | "issueClosed">
export const STAT_KEYS = ["prOpen", "prMerged", "prClosed", "issueOpen", "issueClosed"] as const
export type StatKey = (typeof STAT_KEYS)[number]
export type Flash = { dir: "up" | "down"; delta: number; n: number }

const HIGHLIGHT_MS = 8000

const itemIds = (s: Snapshot) => [
  ...s.recent.map((p) => `pr:${p.number}`),
  ...(s.claims ?? []).map((c) => `ev:${c.url}`),
  ...(s.prEvents ?? []).map((e) => `pe:${e.kind}:${e.number}`),
  ...(s.issueEvents ?? []).map((e) => `ie:${e.kind}:${e.number}`),
]
const totalPrs = (s: Snapshot) => s.prOpen + s.prMerged + s.prClosed

/** Live snapshot over WebSocket, plus what changed since the previous message. */
export function useLive() {
  const [snap, setSnap] = useState<Snapshot>()
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [connected, setConnected] = useState(false)
  const [flash, setFlash] = useState<Partial<Record<StatKey, Flash>>>({})
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())
  const [since, setSince] = useState({ prs: 0, merged: 0, claims: 0 })
  const [viewers, setViewers] = useState<number>()
  const [health, setHealth] = useState<Health>()
  const [skew, setSkew] = useState(0) // server clock minus this browser's clock, in ms
  const prev = useRef<Snapshot>(undefined)
  const seq = useRef(0)

  useEffect(() => {
    let ws: WebSocket | undefined
    let retry: number | undefined
    let closed = false
    const timers = new Set<number>()
    const later = (fn: () => void) => {
      const t = window.setTimeout(() => (timers.delete(t), fn()), HIGHLIGHT_MS)
      timers.add(t)
    }

    function apply(next: Snapshot, hist?: HistoryPoint[]) {
      const p = prev.current
      if (hist) setHistory(hist)
      else if (p) setHistory((h) => [...h, p])
      if (p && next.ts !== p.ts) {
        const f: Partial<Record<StatKey, Flash>> = {}
        for (const k of STAT_KEYS) {
          const d = next[k] - p[k]
          if (d !== 0) f[k] = { dir: d > 0 ? "up" : "down", delta: d, n: ++seq.current }
        }
        setFlash(f)
        later(() => setFlash({}))
        const old = new Set(itemIds(p))
        const added = itemIds(next).filter((i) => !old.has(i))
        if (added.length) {
          setFresh((s) => new Set([...s, ...added]))
          later(() => setFresh((s) => new Set([...s].filter((i) => !added.includes(i)))))
        }
        setSince((s) => ({
          prs: s.prs + Math.max(0, totalPrs(next) - totalPrs(p)),
          merged: s.merged + Math.max(0, next.prMerged - p.prMerged),
          claims: s.claims + added.filter((i) => i.startsWith("ev:")).length,
        }))
      }
      prev.current = next
      setSnap(next)
    }

    function connect() {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`)
      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => {
        if (e.data === "pong") return
        const m = JSON.parse(e.data)
        if (typeof m.serverNow === "number") setSkew(m.serverNow - Date.now())
        if (m.type === "health") {
          setHealth(m.health)
          return
        }
        if (m.type === "viewers") {
          setViewers(m.count)
          return
        }
        if (m.type === "next") {
          // the server pulled the next poll forward (a webhook arrived)
          if (prev.current) prev.current = { ...prev.current, nextAt: m.nextAt }
          setSnap((s) => (s ? { ...s, nextAt: m.nextAt } : s))
          return
        }
        if (m.health) setHealth(m.health)
        apply(m.snapshot, m.history)
      }
      ws.onclose = () => {
        setConnected(false)
        setViewers(undefined)
        if (!closed) retry = window.setTimeout(connect, 3000)
      }
    }
    connect()
    const ping = window.setInterval(() => ws?.readyState === 1 && ws.send("ping"), 30000)
    return () => {
      closed = true
      clearTimeout(retry)
      clearInterval(ping)
      timers.forEach(clearTimeout)
      ws?.close()
    }
  }, [])

  return { snap, history, connected, flash, fresh, since, skew, viewers, health }
}

export function useNow(ms = 15000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function ago(t: string | number, now: number) {
  const m = Math.max(0, Math.round((now - +new Date(t)) / 60000))
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}
