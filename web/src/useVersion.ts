import { useEffect, useState } from "react"

const CHECK_MS = 60_000

/** The version this page was built from, and whether the deployed one has moved on. Checked every minute and when the
 *  tab comes back to the front, which is when a long-open page is most likely to be stale. */
export function useVersion() {
  const current = __APP_VERSION__
  const [latest, setLatest] = useState<string>()

  useEffect(() => {
    let live = true
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" })
        if (res.ok && live) setLatest(((await res.json()) as { version?: string }).version)
      } catch { /* offline: keep what we know */ }
    }
    check()
    const t = window.setInterval(check, CHECK_MS)
    const onShow = () => document.visibilityState === "visible" && check()
    document.addEventListener("visibilitychange", onShow)
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", onShow) }
  }, [])

  // a local `dev` build has no version to compare
  const outdated = current !== "dev" && latest !== undefined && latest !== "dev" && latest !== current
  return { current, latest, outdated }
}
