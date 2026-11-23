import { useMemo, useRef, useState } from "react"
import { ChevronDownIcon, DownloadIcon, EyeIcon, MarkGithubIcon, PencilIcon, PlusIcon, SyncIcon, UploadIcon } from "@primer/octicons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dashboard, useDashboard } from "./Dashboard"
import { PANELS } from "./panels"
import { ago, useLive, useNow } from "./useLive"

const REFRESH_MS = 60_000 // fallback when a snapshot predates `nextAt`
const LATE_MS = 15_000 // this long past the promised time with no update counts as late

/** Counts down from the snapshot's start to the server's promised next poll. Both are server-clock times, and
 *  `skew` converts this browser's clock to the server's, so it stays accurate even if the local clock is off. */
function RefreshBar({ ts, nextAt, skew, now, connected }: { ts: number; nextAt?: number; skew: number; now: number; connected: boolean }) {
  const due = nextAt ?? ts + REFRESH_MS
  const duration = Math.max(1_000, due - ts)
  // Measured once per snapshot. Recomputing it on later renders would change `animation-delay` under a running
  // animation, and that shifts the animation's position (the bar would jump ahead each time the page re-renders).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const elapsed = useMemo(() => Math.min(Math.max(0, Date.now() + skew - ts), duration), [ts, due])
  const late = now + skew - due > LATE_MS
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label="Time until the next refresh"
      title={late ? "The next update is late" : `Next refresh at ${new Date(due - skew).toLocaleTimeString()}`}
    >
      {/* keyed by ts: a new snapshot remounts the bar and restarts the animation; the negative delay resumes mid-window */}
      <div
        key={`${ts}-${due}`}
        className={`refresh-fill h-full origin-left rounded-full ${late ? "bg-amber-500" : connected ? "bg-primary" : "bg-muted-foreground"}`}
        style={{ animationDuration: `${duration}ms`, animationDelay: `-${elapsed}ms` }}
      />
    </div>
  )
}

export default function App() {
  const { snap, history, connected, flash, fresh, since, skew, viewers } = useLive()
  const now = useNow()
  const dash = useDashboard()
  const [edit, setEdit] = useState(() => new URLSearchParams(location.search).has("edit"))
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const hiddenPanels = PANELS.filter((p) => dash.hidden.includes(p.id))

  function onExport() {
    const url = URL.createObjectURL(new Blob([dash.exportJson()], { type: "application/json" }))
    const a = Object.assign(document.createElement("a"), { href: url, download: "are-we-leonida-yet-layout.json" })
    a.click()
    URL.revokeObjectURL(url)
    setMessage({ ok: true, text: "Layout exported." })
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // so choosing the same file again still fires
    if (!file) return
    try {
      if (file.size > 1_000_000) throw new Error("That file is too large to be a layout.")
      dash.importJson(await file.text())
      setMessage({ ok: true, text: `Imported layout from ${file.name}.` })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Import failed." })
    }
  }

  return (
    <main className="w-full space-y-3 p-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <img src="/logo.png" alt="Leonida logo" width={44} height={44} className="size-11 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold">Are We Leonida Yet?</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={`size-2 rounded-full ${connected ? "bg-green-500" : "bg-destructive"}`} />
            {connected ? "live" : "reconnecting…"} ·
            <a className="underline underline-offset-2" href="https://github.com/ItsNotRexed/Leonida">ItsNotRexed/Leonida</a>
            {snap && <>· updated {ago(snap.ts, now)}</>}
          </p>
        </div>
        {since.prs + since.claims > 0 && (
          <div className="rounded-lg bg-card px-3 py-1.5 text-sm ring-1 ring-foreground/10">
            Since you opened this page: <b>+{since.prs}</b> PRs, <b>+{since.merged}</b> merged, <b>+{since.claims}</b> claim updates
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
          {viewers !== undefined && (
            <Badge variant="secondary" title={`${viewers} open ${viewers === 1 ? "connection" : "connections"} watching live (each tab counts)`} aria-label={`${viewers} watching`}>
              <EyeIcon size={12} aria-hidden="true" /> {viewers.toLocaleString()}
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant={edit ? "default" : "outline"} size="sm" />}>
              Layout <ChevronDownIcon size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEdit(!edit)}><PencilIcon size={16} /> {edit ? "Done editing" : "Edit"}</DropdownMenuItem>
              <DropdownMenuItem onClick={onExport}><DownloadIcon size={16} /> Export</DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInput.current?.click()}><UploadIcon size={16} /> Import</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={dash.reset}><SyncIcon size={16} /> Reset to default</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {snap && <RefreshBar ts={snap.ts} nextAt={snap.nextAt} skew={skew} now={now} connected={connected} />}

      {message && (
        <div role="status" className={`flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm ring-1 ${message.ok ? "ring-foreground/10" : "text-destructive ring-destructive/40"}`}>
          {message.text}
          <button className="ml-auto text-xs underline underline-offset-2" onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}

      {edit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-foreground/10">
          <span className="text-muted-foreground">Drag a panel by its title bar, resize from its bottom-right corner, hide it with ×.</span>
          {hiddenPanels.length > 0 && <span className="text-muted-foreground">Add back:</span>}
          {hiddenPanels.map((p) => (
            <Button key={p.id} variant="secondary" size="xs" onClick={() => dash.show(p.id)}>
              <PlusIcon data-icon="inline-start" /> {p.title}
            </Button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">Saved in this browser only.</span>
        </div>
      )}

      {snap ? <Dashboard ctx={{ snap, history, flash, fresh, now }} edit={edit} dash={dash} /> : <p className="text-muted-foreground">waiting for the first snapshot…</p>}

      <footer className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <EyeIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            <b className="font-medium text-foreground">Observing, not contributing.</b> This project doesn't aim to contribute to the development of Leonida.
            It watches how contribution and development speed change when open source unleashes its agent credits.
          </p>
        </div>
        <p className="flex items-center gap-2">
          <img src="/logo.png" alt="" width={16} height={16} className="size-4 shrink-0" />
          <span>
            <b className="font-medium text-foreground">Logo credit:</b>{" "}
            <a className="underline underline-offset-2" href="https://www.steamgriddb.com/icon/122618">"Grand Theft Auto VI" icon by SlyDevil</a> on SteamGridDB,
            as used by the <a className="underline underline-offset-2" href="https://github.com/ItsNotRexed/Leonida">Leonida</a> project.
            This site is unofficial and not affiliated with Rockstar Games or Take-Two.
          </span>
        </p>
        <p className="flex items-center gap-2">
          <MarkGithubIcon size={16} className="shrink-0" aria-hidden="true" />
          <span>
            <b className="font-medium text-foreground">Source:</b>{" "}
            <a className="underline underline-offset-2" href="https://github.com/sevki/are-we-leonida-yet">sevki/are-we-leonida-yet</a>. Issues and pull requests welcome.
          </span>
        </p>
      </footer>
    </main>
  )
}
