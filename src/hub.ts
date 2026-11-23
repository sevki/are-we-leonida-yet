import { DurableObject } from "cloudflare:workers";
import { fetchSnapshot, type Activity, type Snapshot } from "./github";
import { badgeSvg, parseStatus, shieldsJson, type ProjectStatus } from "./status";

const POLL_MS = 60_000;
const KEEP_MS = 7 * 24 * 3600_000;
const STATUS_MS = 5 * 60_000;
const SETTLE_MS = 3_000; // after a webhook, wait for GitHub's search index to catch up
const MIN_GAP_MS = 10_000; // never poll more often than this, however many webhooks arrive

export class Hub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS snapshots (
      ts INTEGER PRIMARY KEY, pr_open INTEGER, pr_merged INTEGER, pr_closed INTEGER,
      issue_open INTEGER, issue_closed INTEGER)`);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, ts INTEGER, kind TEXT)");
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (req.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      const latest = await this.latest();
      if (latest) pair[1].send(this.frame(latest, this.history(24 * 3600_000)));
      // the alarm is the clock; if it is somehow missing, restart it
      if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + 1_000);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === "/api/status") return Response.json((await this.status()) ?? null);
    if (url.pathname === "/badge/are-we-leonida-yet.svg" || url.pathname === "/badge/are-we-leonida-yet.json") {
      const st = await this.status();
      const cache = { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" };
      return url.pathname.endsWith(".svg")
        ? new Response(badgeSvg(st), { headers: { "content-type": "image/svg+xml; charset=utf-8", ...cache } })
        : Response.json(shieldsJson(st), { headers: cache });
    }
    if (url.pathname === "/api/stats") {
      const range = Math.min(Number(url.searchParams.get("range") ?? 24 * 3600_000), KEEP_MS);
      return Response.json({ snapshot: await this.latest(), history: this.history(range), serverNow: Date.now() });
    }
    return new Response("not found", { status: 404 });
  }

  private polling?: Promise<void>;

  /** One poll. The schedule is fixed from the poll's start, so the interval is exactly POLL_MS no matter how
   *  long GitHub takes, and `nextAt` is a promise the UI can count down to. */
  poll(): Promise<void> {
    return (this.polling ??= this.runPoll().finally(() => { this.polling = undefined; }));
  }

  private async runPoll(): Promise<void> {
    const started = Date.now();
    let next = started + POLL_MS;
    try {
      const { snap, stamps } = await fetchSnapshot(this.env.REPO, this.env.GITHUB_TOKEN);
      next = Math.max(next, Date.now() + 1_000); // a poll that overran its window schedules the next one just after it
      snap.ts = started;
      snap.nextAt = next;
      for (const c of stamps) this.ctx.storage.sql.exec("INSERT OR IGNORE INTO comments VALUES (?,?,?)", c.id, c.ts, c.kind);
      this.ctx.storage.sql.exec("DELETE FROM comments WHERE ts < ?", Date.now() - KEEP_MS);
      snap.activity = this.activity();
      snap.status = await this.status();
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?,?,?)",
        snap.ts, snap.prOpen, snap.prMerged, snap.prClosed, snap.issueOpen, snap.issueClosed,
      );
      this.ctx.storage.sql.exec("DELETE FROM snapshots WHERE ts < ?", Date.now() - KEEP_MS);
      await this.ctx.storage.put("latest", snap);
      const msg = this.frame(snap);
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(msg); } catch { /* closed */ }
      }
    } finally {
      // even a failed poll keeps the clock ticking
      await this.ctx.storage.setAlarm(next);
    }
  }

  /** A webhook arrived: pull the next poll forward. Still one clock (the alarm), so the schedule stays honest. */
  async poke(): Promise<void> {
    const last = (await this.latest())?.ts ?? 0;
    const target = Math.max(Date.now() + SETTLE_MS, last + MIN_GAP_MS);
    const due = await this.ctx.storage.getAlarm();
    if (this.polling || (due !== null && due <= target)) return; // already polling, or a poll is due sooner than we would ask for
    await this.ctx.storage.setAlarm(target);
    const msg = JSON.stringify({ type: "next", nextAt: target, serverNow: Date.now() });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* closed */ }
    }
  }

  /** The alarm is the clock. */
  async alarm(): Promise<void> {
    await this.poll().catch((e) => console.error("poll failed", e));
  }

  /** Cron is only a watchdog: it restarts the alarm if it is missing or the data has gone stale. */
  async watchdog(): Promise<void> {
    const latest = await this.latest();
    if ((await this.ctx.storage.getAlarm()) === null || !latest || Date.now() - latest.ts > 3 * POLL_MS) await this.poll();
  }

  /** Every frame carries the server's clock, so the browser can correct for its own clock being off. */
  private frame(snapshot: Snapshot, history?: unknown): string {
    return JSON.stringify({ type: "snapshot", snapshot, history, serverNow: Date.now() });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") ws.send("pong");
  }
  webSocketClose(ws: WebSocket, code: number) {
    // 1005/1006/1015 are reserved: a peer that closed without a status code reports one, and echoing it throws
    const echo = code >= 1000 && code < 5000 && ![1005, 1006, 1015].includes(code) ? code : 1000;
    try { ws.close(echo, "bye"); } catch { /* already closed */ }
  }

  /** The README's status table, refreshed at most every few minutes; falls back to the last good copy. */
  private async status(): Promise<ProjectStatus | undefined> {
    const cur = await this.ctx.storage.get<ProjectStatus>("status");
    if (cur && Date.now() - cur.fetchedAt < STATUS_MS) return cur;
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${this.env.REPO}/HEAD/README.md`, { headers: { "user-agent": "leonida-status-worker" } });
      if (!res.ok) throw new Error(`README ${res.status}`);
      const parsed = parseStatus(await res.text());
      if (parsed) {
        parsed.fetchedAt = Date.now();
        await this.ctx.storage.put("status", parsed);
        return parsed;
      }
      console.error("README has no readable Project status table");
    } catch (e) {
      console.error("status fetch failed", e);
    }
    return cur;
  }

  private async latest(): Promise<Snapshot | undefined> {
    return this.ctx.storage.get<Snapshot>("latest");
  }

  /** Comments on the coordination issue per 10 minutes over the last 12 hours, by command. */
  private activity(): Activity {
    const bucketMs = 10 * 60_000;
    const now = Date.now();
    // start at the earliest comment we hold (history builds up after a deploy), but show at least the last hour
    const oldest = Number(this.ctx.storage.sql.exec("SELECT MIN(ts) AS m FROM comments").one().m ?? now);
    const first = Math.floor(Math.max(now - 12 * 3600_000, Math.min(oldest, now - 3600_000)) / bucketMs) * bucketMs;
    const buckets = new Map<number, Activity["buckets"][number]>();
    for (let t = first; t <= now; t += bucketMs) buckets.set(t, { t, claiming: 0, status: 0, blocked: 0, releasing: 0, done: 0, finding: 0, other: 0 });
    for (const r of this.ctx.storage.sql.exec("SELECT ts, kind FROM comments WHERE ts >= ?", first).toArray()) {
      const b = buckets.get(Math.floor(Number(r.ts) / bucketMs) * bucketMs);
      if (b) b[r.kind as keyof Omit<typeof b, "t">]++;
    }
    return { bucketMs, buckets: [...buckets.values()] };
  }

  private history(rangeMs: number) {
    return this.ctx.storage.sql
      .exec(
        "SELECT ts, pr_open AS prOpen, pr_merged AS prMerged, pr_closed AS prClosed, issue_open AS issueOpen, issue_closed AS issueClosed FROM snapshots WHERE ts > ? ORDER BY ts",
        Date.now() - rangeMs,
      )
      .toArray();
  }
}
