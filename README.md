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
- **Claim problems**: from the newest coordination-issue comments, items held by more than one person, items the
  board lists as up for grabs that are already claimed, and claims with no item ID. Derived and read-only: the
  comments and the board stay the source of truth, and it only shows where they disagree.
- **Competing PRs**: open PRs that are about the same work, found from item IDs in their text and from the claim
  comment they link (looked up once and cached). Several authors on one item is "competing"; one author is a split.
  It only sees the newest 300 open PRs, and says how many of them it could place.
- Live **pull request** and **issue** activity feeds (opened, merged, closed) in the style of the claims feed.
- A watcher count (open connections, so each tab counts) next to the Layout menu.
- AI-assisted PRs, with tools (Claude Code, Codex, Cursor, …) and models (Claude, GPT, GLM, Kimi, Qwen, …) counted
  separately, read from the `AI-assisted (Tool / Model)` note in PR bodies.
- An "Are we Leonida yet?" badge built from the Project status table in the Leonida README.
- A refresh bar that counts down to the server's real next poll.
- Honest staleness: a red "updates failing" badge with GitHub's reason (and the rate-limit reset time is honoured),
  an amber "no update" badge when nothing arrives, and "claims quiet for N min" when no claim comment has been posted.

The dashboard is a drag-and-resize grid. Use **Layout → Edit** to rearrange or hide panels, and **Export** /
**Import** to move a layout between browsers. Layouts are stored in the browser only.

## How it works

- `src/hub.ts`: one Durable Object (`StatusHub`). A 60 s alarm polls GitHub and broadcasts a snapshot to every connected
  WebSocket. History is kept in the object's SQLite storage. A once-a-minute cron is only a watchdog.
- `src/github.ts`, `src/parse.ts`, `src/board.ts`, `src/status.ts`: GitHub queries and the parsers for claims,
  the coordination board, AI-assisted notes and the README status table.
- `src/claimcheck.ts`, `src/dupes.ts`, `src/activity.ts`, `src/health.ts`: the claim-problem and competing-PR
  analysis, the opened/merged/closed events, and the poll-health record.
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

## Operating notes

- **GitHub search limit:** each poll makes 14 search calls against GitHub's limit of 30 a minute per token. Testing
  with the same token as the worker can make a poll fail for a minute; it recovers on its own.
- **Renames:** GitHub's search API does not follow a repository rename (it answers 422), so each poll first asks
  REST for the repo's current name and the page builds its links from it.
- **Deploys and the Durable Object:** a deploy does not replace a Durable Object that stays awake. Keep-alive pings
  are answered by `setWebSocketAutoResponse` so they don't wake it. If a deploy still doesn't take effect, a
  `renamed_classes` migration restarts the object and keeps its data.

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
