# Are We Leonida Yet?

A live status dashboard for [ProjectLeonida/Leonida](https://github.com/ProjectLeonida/Leonida), live at
**https://are-we-leonida-yet.sevki.app**.

> **Observing, not contributing.** This project doesn't aim to contribute to the development of Leonida.
> It watches how contribution and development speed change when open source unleashes its agent credits.

The repo sees hundreds of pull requests a day. This tracks the pace, who is working on what, and how far the
project is from booting.

## What it shows

- Open, merged and closed PRs and issues, with trend charts that each scale to their own range.
- The coordination issue ("Coordinating who works on what"): claims by area, top claimers, stale claims, the
  review queue, merge chains, and a live feed of `claiming:` / `status:` / `done:` / `blocked:` / `releasing:` comments.
- AI-assisted PRs, with tools (Claude Code, Codex, Cursor, …) and models (Claude, GPT, GLM, Kimi, Qwen, …) counted
  separately, read from the `AI-assisted (Tool / Model)` note in PR bodies.
- An "Are we Leonida yet?" badge built from the Project status table in the Leonida README.
- A refresh bar that counts down to the server's real next poll.

The dashboard is a drag-and-resize grid. Use **Layout → Edit** to rearrange or hide panels, and **Export** /
**Import** to move a layout between browsers. Layouts are stored in the browser only.

## How it works

- `src/hub.ts`: one Durable Object. A 60 s alarm polls GitHub and broadcasts a snapshot to every connected
  WebSocket. History is kept in the object's SQLite storage. A once-a-minute cron is only a watchdog.
- `src/github.ts`, `src/parse.ts`, `src/board.ts`, `src/status.ts`: GitHub queries and the parsers for claims,
  the coordination board, AI-assisted notes and the README status table.
- `src/webhook.ts`, `src/index.ts`: optional `POST /webhook` receiver (see below).
- `web/`: React 19, Vite, Tailwind 4, shadcn (Base UI), Recharts, react-grid-layout and Octicons. It builds into
  `public/`, which the worker serves as static assets.

## Badge

```md
![are we Leonida yet?](https://are-we-leonida-yet.sevki.app/badge/are-we-leonida-yet.svg)
```

A [shields.io endpoint](https://shields.io/badges/endpoint-badge) JSON is at `/badge/are-we-leonida-yet.json`.

## Run it

Needs Node, [pnpm](https://pnpm.io) and a GitHub token (unauthenticated GitHub allows only 60 requests an hour).

```sh
pnpm install
echo "GITHUB_TOKEN=$(gh auth token)" > .dev.vars   # gitignored
pnpm build
pnpm dev                                           # http://localhost:8787
pnpm typecheck
```

## Deploy

```sh
pnpm exec wrangler secret put GITHUB_TOKEN
pnpm run deploy        # not `pnpm deploy`, which is a different built-in command
```

The route in `wrangler.jsonc` attaches a custom domain, so change it to one you own. Set `REPO` there to track a
different repository, though the coordination-issue parsing is specific to Leonida's conventions.

## Webhooks (optional)

Polling every 60 s works without any setup. If you have admin on the tracked repo, a webhook makes updates
arrive within seconds: set a secret with `pnpm exec wrangler secret put WEBHOOK_SECRET`, then add a webhook with
payload URL `https://<your-domain>/webhook`, content type `application/json`, the same secret, and the **Pull
requests**, **Issues** and **Issue comments** events.

### The limitation today

GitHub only delivers webhooks for a repository to someone who can configure them there: **admin access to the
repo** (or an organisation-level webhook). Read access and a token aren't enough. The live site tracks
ProjectLeonida/Leonida, which this project doesn't own, so it has **no webhook and runs on the 60 s poll alone**. The
receiver is deployed but inert until the repo's owner adds the webhook above. If you run this against a repo you
administer, you get push-style updates.

Without admin access the only push-like alternative is GitHub's Events API, which is still polling and can lag
behind the repo, so it isn't used here.

The signature (`X-Hub-Signature-256`) is verified, and an event never updates counters itself: it only pulls the
next poll forward (3 s settle, 10 s minimum gap). Without a secret the endpoint rejects everything.

## Credits

Logo: ["Grand Theft Auto VI" icon by SlyDevil](https://www.steamgriddb.com/icon/122618) on SteamGridDB, as used by
the Leonida project. This site is unofficial and not affiliated with Rockstar Games or Take-Two.
