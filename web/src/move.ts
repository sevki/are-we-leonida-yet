export interface Move { ts: number; change: number } // the move ending at `ts`

/** The steepest change over any `windowMs` stretch of a series, or null when the series is too short to tell.
 *  `points` must be sorted by ts. */
export function steepestMove(points: { ts: number }[], value: (i: number) => number, windowMs: number): Move | null {
  if (points.length < 2) return null
  let best: Move | null = null
  let j = 0
  for (let i = 1; i < points.length; i++) {
    while (points[i].ts - points[j].ts > windowMs) j++
    if (j === i) continue
    const change = value(i) - value(j)
    if (!best || Math.abs(change) > Math.abs(best.change)) best = { ts: points[i].ts, change }
  }
  return best && best.change !== 0 ? best : null
}

/** A window whose total change is at least this share of where it started is worth pointing out. */
export const NOTABLE = 0.2
