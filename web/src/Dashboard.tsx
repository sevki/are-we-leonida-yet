import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Responsive, useContainerWidth, type LayoutItem } from "react-grid-layout"
import { GrabberIcon, XIcon } from "@primer/octicons-react"
import { cn } from "cn"
import "react-grid-layout/css/styles.css"
import { BREAKPOINTS, COLS, defaultLayouts, PANEL_IDS, PANELS, type Ctx } from "./panels"

type Layouts = Record<string, readonly LayoutItem[]>
const KEY = "leonida-status:dashboard:v1"

function load(): { layouts?: Layouts; hidden: string[] } {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null")
    if (j && typeof j === "object") return { layouts: j.layouts, hidden: Array.isArray(j.hidden) ? j.hidden.filter((id: string) => PANEL_IDS.has(id)) : [] }
  } catch { /* private window, blocked storage, bad JSON: fall back to the default layout */ }
  return { hidden: [] }
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** Validates an exported layout. Unknown panels are dropped; anything malformed is rejected, never half-applied. */
function parseExport(text: string): { layouts: Layouts; hidden: string[] } {
  let j: any
  try { j = JSON.parse(text) } catch { throw new Error("That file is not valid JSON.") }
  if (!j || j.app !== "leonida-status" || !j.layouts || typeof j.layouts !== "object" || Array.isArray(j.layouts)) throw new Error("That file is not an exported layout.")
  const defaults = defaultLayouts() as Layouts
  const layouts: Layouts = {}
  for (const bp of Object.keys(defaults)) {
    const items = j.layouts[bp]
    if (items === undefined) { layouts[bp] = defaults[bp]; continue }
    if (!Array.isArray(items)) throw new Error(`Layout "${bp}" is malformed.`)
    layouts[bp] = items
      .filter((it: any) => it && PANEL_IDS.has(it.i))
      .map((it: any) => {
        if (![it.x, it.y, it.w, it.h].every(isNum) || it.w < 1 || it.h < 1 || it.x < 0 || it.y < 0) throw new Error(`Panel "${it.i}" has a bad position.`)
        return { i: it.i, x: it.x, y: it.y, w: it.w, h: it.h, ...(isNum(it.minW) && { minW: it.minW }), ...(isNum(it.minH) && { minH: it.minH }) }
      })
  }
  const hidden = Array.isArray(j.hidden) ? [...new Set<string>(j.hidden.filter((id: unknown): id is string => typeof id === "string" && PANEL_IDS.has(id)))] : []
  return { layouts, hidden }
}

/** Layout and hidden panels, persisted in this browser only. */
export function useDashboard() {
  const initial = useMemo(load, [])
  const [layouts, setLayouts] = useState<Layouts>(initial.layouts ?? defaultLayouts())
  const [hidden, setHidden] = useState<string[]>(initial.hidden)
  const dirty = useRef(false)

  useEffect(() => {
    if (!dirty.current) return
    try { localStorage.setItem(KEY, JSON.stringify({ layouts, hidden })) } catch { /* not persisted */ }
  }, [layouts, hidden])

  return {
    layouts, hidden,
    setLayouts: (l: Layouts) => { dirty.current = true; setLayouts(l) },
    hide: (id: string) => { dirty.current = true; setHidden((h) => [...h, id]) },
    show: (id: string) => { dirty.current = true; setHidden((h) => h.filter((x) => x !== id)) },
    /** Layout as a portable JSON document. */
    exportJson: () => JSON.stringify({ app: "leonida-status", version: 1, layouts, hidden }, null, 2),
    /** Replace the layout from an exported document. Throws a readable error if it is not one. */
    importJson: (text: string) => {
      const next = parseExport(text)
      dirty.current = true
      setLayouts(next.layouts)
      setHidden(next.hidden)
    },
    reset: () => {
      dirty.current = false
      try { localStorage.removeItem(KEY) } catch { /* ignore */ }
      setLayouts(defaultLayouts())
      setHidden([])
    },
  }
}

export type DashboardState = ReturnType<typeof useDashboard>

function Panel({ title, edit, onClose, children }: { title: string; edit: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10", edit && "outline-2 outline-dashed outline-primary/40")}>
      <div className={cn("panel-handle flex shrink-0 items-center gap-1 px-3 py-1.5 text-sm font-medium", edit && "cursor-grab bg-muted/50 active:cursor-grabbing")}>
        {edit && <GrabberIcon size={16} className="-ml-1 shrink-0 text-muted-foreground" />}
        <span className="truncate">{title}</span>
        {edit && (
          <button className="panel-close ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose} aria-label={`Hide ${title}`}>
            <XIcon size={16} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">{children}</div>
    </div>
  )
}

export function Dashboard({ ctx, edit, dash }: { ctx: Ctx; edit: boolean; dash: DashboardState }) {
  const { width, containerRef, mounted } = useContainerWidth()
  const visible = useMemo(() => PANELS.filter((p) => !dash.hidden.includes(p.id)), [dash.hidden])

  // Saved positions for the visible panels; any panel without one (new, or just un-hidden) goes at the bottom.
  const layouts = useMemo(() => {
    const defaults = defaultLayouts() as Layouts
    const out: Layouts = {}
    for (const bp of Object.keys(defaults)) {
      const saved = (dash.layouts[bp] ?? []).filter((it) => visible.some((p) => p.id === it.i))
      const have = new Set(saved.map((it) => it.i))
      const missing = (defaults[bp] ?? []).filter((it) => visible.some((p) => p.id === it.i) && !have.has(it.i)).map((it) => ({ ...it, y: 9999 }))
      out[bp] = [...saved, ...missing]
    }
    return out
  }, [dash.layouts, visible])

  return (
    <div ref={containerRef}>
      {mounted && (
        <Responsive
          width={width}
          layouts={layouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={30}
          margin={[12, 12]}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: edit, handle: ".panel-handle", cancel: ".panel-close" }}
          resizeConfig={{ enabled: edit }}
          // only a deliberate edit is saved, never the layout the grid generates on load
          onLayoutChange={(_, all) => { if (edit) dash.setLayouts(all as Layouts) }}
        >
          {visible.map((p) => (
            <div key={p.id}>
              <Panel title={p.title} edit={edit} onClose={() => dash.hide(p.id)}>{p.render(ctx)}</Panel>
            </div>
          ))}
        </Responsive>
      )}
    </div>
  )
}
