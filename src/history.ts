/** Thin a time-sorted series to at most `max` points by keeping the last point of each equal time bucket, so a week of
 *  one-minute samples is a few hundred points instead of ten thousand. The newest point is always kept. */
export function thin<T extends { ts: number }>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const bucket = Math.ceil((rows[rows.length - 1].ts - rows[0].ts + 1) / max);
  const out: T[] = [];
  let cur = -1;
  for (const r of rows) {
    const b = Math.floor((r.ts - rows[0].ts) / bucket);
    if (b === cur) out[out.length - 1] = r;
    else { out.push(r); cur = b; }
  }
  return out;
}
