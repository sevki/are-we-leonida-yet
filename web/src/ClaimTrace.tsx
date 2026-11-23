import {
  BlockedIcon,
  CheckCircleIcon,
  FlagIcon,
  LightBulbIcon,
  LinkExternalIcon,
  PulseIcon,
  XCircleIcon,
  type Icon,
} from "@primer/octicons-react";
import type { ClaimEvent, ClaimKind } from "../../src/parse";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { Badge } from "@/components/ui/badge";
import { ago } from "./useLive";
import { repoUrl, useRepo } from "./repo";

const KIND: Record<ClaimKind, { Icon: Icon; status?: "running" | "pending"; color?: string }> = {
  // a live claim is work in progress, so its title shimmers
  claiming: { Icon: FlagIcon, status: "running" },
  status: { Icon: PulseIcon, status: "running" },
  done: { Icon: CheckCircleIcon, color: "text-green-500" },
  releasing: { Icon: XCircleIcon, color: "text-red-500" },
  blocked: { Icon: BlockedIcon, color: "text-amber-500" },
  finding: { Icon: LightBulbIcon, status: "pending" },
};

export function ClaimTrace({
  items,
  idOf,
  fresh,
  now,
  limit,
  empty,
}: {
  items: ClaimEvent[];
  idOf: (e: ClaimEvent) => string;
  fresh: ReadonlySet<string>;
  now: number;
  limit: number;
  empty: string;
}) {
  const repo = useRepo();
  if (!items.length)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <Trace className="gap-1">
      {items.slice(0, limit).map((e) => {
        const { Icon, status, color } = KIND[e.kind];
        const isNew = fresh.has(idOf(e));
        return (
          <TraceCollapsible
            key={idOf(e)}
            defaultOpen
            className={isNew ? "new-row rounded-md" : "rounded-md"}
          >
            <TraceCollapsibleTrigger >
              <TraceLine status={status}>
                <TraceIcon className={color}>
                  <Icon />
                </TraceIcon>
                <b className="font-medium text-foreground">{e.user}</b>
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <Badge variant="secondary">{e.kind}</Badge>
                  {e.itemIds.map((id) => (
                    <Badge key={id} variant="outline">
                      {id}
                    </Badge>
                  ))}
                  {e.refs.map((n) => (
                    <a
                      key={n}
                      href={repoUrl(repo, `/issues/${n}`)}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      #{n}
                    </a>
                  ))}
                </div>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent>
              <TraceTitle>{e.text}</TraceTitle>
              <TraceDescription>
                {ago(e.created_at, now)}{" "}
                <a
                  href={e.url}
                  className="ml-auto inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                >
                  comment <LinkExternalIcon size={12} />
                </a>
              </TraceDescription>
            </TraceCollapsibleContent>
          </TraceCollapsible>
        );
      })}
    </Trace>
  );
}
