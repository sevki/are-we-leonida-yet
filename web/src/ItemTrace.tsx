import { GitMergeIcon, GitPullRequestClosedIcon, GitPullRequestIcon, IssueClosedIcon, IssueOpenedIcon, LinkExternalIcon, type Icon } from "@primer/octicons-react"
import type { ItemEvent } from "../../src/activity"
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { Badge } from "@/components/ui/badge"
import { ago } from "./useLive"

type Kind = ItemEvent["kind"]
const PR_KIND: Record<Kind, { Icon: Icon; color: string; label: string }> = {
  opened: { Icon: GitPullRequestIcon, color: "text-green-500", label: "opened" },
  merged: { Icon: GitMergeIcon, color: "text-purple-500", label: "merged" },
  closed: { Icon: GitPullRequestClosedIcon, color: "text-red-500", label: "closed" },
}
const ISSUE_KIND: Record<Kind, { Icon: Icon; color: string; label: string }> = {
  opened: { Icon: IssueOpenedIcon, color: "text-green-500", label: "opened" },
  merged: { Icon: IssueClosedIcon, color: "text-purple-500", label: "closed" }, // issues are not merged; kept for the type
  closed: { Icon: IssueClosedIcon, color: "text-purple-500", label: "closed" },
}

/** Opened / merged / closed pull requests or issues, newest first, in the same style as the claims feed. */
export function ItemTrace({ items, pr, fresh, now, limit, empty }: { items: ItemEvent[]; pr: boolean; fresh: ReadonlySet<string>; now: number; limit: number; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  const kinds = pr ? PR_KIND : ISSUE_KIND
  return (
    <Trace className="gap-1">
      {items.slice(0, limit).map((e) => {
        const { Icon, color, label } = kinds[e.kind]
        const id = eventId(e, pr)
        return (
          <TraceCollapsible key={id} defaultOpen className={fresh.has(id) ? "new-row rounded-md" : "rounded-md"}>
            <TraceCollapsibleTrigger>
              <TraceLine>
                <TraceIcon className={color}><Icon /></TraceIcon>
                <b className="font-medium text-foreground">{e.user}</b>
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <Badge variant="secondary">{label}</Badge>
                  <Badge variant="outline">#{e.number}</Badge>
                </div>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              <TraceTitle>{e.title}</TraceTitle>
              <TraceDescription className="pl-2 whitespace-nowrap">
                {ago(e.at, now)}{" "}
                <a href={e.url} className="ml-auto inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground">
                  {pr ? "pull request" : "issue"} <LinkExternalIcon size={12} />
                </a>
              </TraceDescription>
            </TraceCollapsibleContent>
          </TraceCollapsible>
        )
      })}
    </Trace>
  )
}

/** Stable id of an event, shared with the live hook so new rows can be highlighted. */
export const eventId = (e: ItemEvent, pr: boolean) => `${pr ? "pe" : "ie"}:${e.kind}:${e.number}`
