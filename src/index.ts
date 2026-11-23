import { StatusHub } from "./hub";
import { RELEVANT_EVENTS, validSignature } from "./webhook";
export { StatusHub };

declare global {
  interface Env {
    HUB: DurableObjectNamespace<StatusHub>;
    ASSETS: Fetcher;
    REPO: string;
    GITHUB_TOKEN?: string;
    APP_VERSION?: string; // set by `pnpm run deploy`: what is deployed, from `git describe`
    WEBHOOK_SECRET?: string; // optional: set it and add a webhook on the repo to get updates as they happen
  }
}

const hub = (env: Env) => env.HUB.get(env.HUB.idFromName("main"));

const MAX_BODY = 5_000_000;

/** GitHub webhook receiver. It never trusts the payload: the signature must match, and the event only nudges the poller. */
async function webhook(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: { allow: "POST" } });
  if (!env.WEBHOOK_SECRET) return new Response("webhook not configured", { status: 503 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return new Response("payload too large", { status: 413 });
  const body = await req.text();
  if (!(await validSignature(env.WEBHOOK_SECRET, body, req.headers.get("x-hub-signature-256")))) return new Response("bad signature", { status: 401 });

  const event = req.headers.get("x-github-event") ?? "";
  if (event === "ping") return new Response("pong");
  if (!RELEVANT_EVENTS.has(event)) return new Response("ignored", { status: 202 });
  try {
    // a signed delivery for some other repository is not ours to act on
    const repo = (JSON.parse(body) as { repository?: { full_name?: string } }).repository?.full_name;
    if (repo && repo.toLowerCase() !== env.REPO.toLowerCase()) return new Response("other repository", { status: 202 });
  } catch {
    return new Response("bad payload", { status: 400 });
  }
  await hub(env).poke();
  return new Response("queued", { status: 202 });
}

export default {
  fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname === "/webhook") return webhook(req, env);
    // answered by the worker itself, not the Durable Object, so it always reflects the code that is actually deployed
    if (pathname === "/api/version") return Response.json({ version: env.APP_VERSION ?? "dev" }, { headers: { "cache-control": "no-store" } });
    if (pathname === "/ws" || pathname.startsWith("/api/") || pathname.startsWith("/badge/")) return hub(env).fetch(req);
    return env.ASSETS.fetch(req);
  },
  async scheduled(_c, env, ctx) {
    ctx.waitUntil(hub(env).watchdog().catch((e) => console.error("watchdog failed", e)));
  },
} satisfies ExportedHandler<Env>;
