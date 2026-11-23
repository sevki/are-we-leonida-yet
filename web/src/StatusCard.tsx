import { AlertIcon, CheckCircleIcon, XCircleIcon, type Icon } from "@primer/octicons-react"
import type { ProjectStatus, State } from "../../src/status"
import { Badge } from "@/components/ui/badge"

const ICON: Record<State, { Icon: Icon; color: string; label: string }> = {
  yes: { Icon: CheckCircleIcon, color: "text-green-500", label: "done" },
  partial: { Icon: AlertIcon, color: "text-amber-500", label: "in progress" },
  no: { Icon: XCircleIcon, color: "text-red-500", label: "not yet" },
}

/** "Are we Leonida yet?": the badge, plus the README's status table it is built from. */
export function StatusCard({ status }: { status: ProjectStatus }) {
  const total = status.rows.length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <img src="/badge/are-we-leonida-yet.svg" alt="are we Leonida yet?" className="h-5" />
        <span className="text-sm text-muted-foreground">{status.headline}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" title={`${status.yes} done, ${status.partial} in progress, ${status.no} not yet`}>
        <div className="bg-green-500" style={{ width: `${(status.yes / total) * 100}%` }} />
        <div className="bg-amber-500" style={{ width: `${(status.partial / total) * 100}%` }} />
        <div className="bg-red-500" style={{ width: `${(status.no / total) * 100}%` }} />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{status.yes} done</Badge>
        <Badge variant="outline">{status.partial} in progress</Badge>
        <Badge variant="outline">{status.no} not yet</Badge>
      </div>
      <ul className="space-y-1 text-sm">
        {status.rows.map((r) => {
          const { Icon, color, label } = ICON[r.state]
          return (
            <li key={r.what} className="flex items-start gap-2" title={r.text}>
              <Icon size={16} className={`mt-0.5 shrink-0 ${color}`} aria-label={label} />
              <span>{r.what}</span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Read from the Project status table in the repo's README, refreshed every few minutes. Embed the badge:{" "}
        <code className="rounded bg-muted px-1 py-0.5">{`![are we Leonida yet?](${location.origin}/badge/are-we-leonida-yet.svg)`}</code>
      </p>
    </div>
  )
}
