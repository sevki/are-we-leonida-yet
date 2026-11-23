/** Parser for the "Project status" table in the Leonida README, and the "are we Leonida yet?" badge built from it. */

export type State = "yes" | "partial" | "no";
export interface StatusRow { what: string; state: State; text: string }
export interface ProjectStatus {
  headline: string; // e.g. "Early. The game does not boot yet."
  rows: StatusRow[];
  yes: number;
  partial: number;
  no: number;
  boot: StatusRow | null; // the row about booting / being playable
  bootState: State;
  fetchedAt: number;
}

const clean = (s: string) =>
  s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "").replace(/\s+/g, " ").trim();

const STATE: Record<string, State> = { "✅": "yes", "⚠": "partial", "❌": "no" };

/** Returns null when there is no readable status table, so a README rewrite degrades to "unknown" rather than a wrong answer. */
export function parseStatus(readme: string): ProjectStatus | null {
  const text = readme.replace(/\r\n?/g, "\n");
  const i = text.search(/^## Project status\s*$/m);
  if (i < 0) return null;
  const rest = text.slice(i).split("\n").slice(1).join("\n");
  const end = rest.search(/^## /m);
  const sec = end < 0 ? rest : rest.slice(0, end);

  const rows: StatusRow[] = [];
  for (const line of sec.split("\n")) {
    const m = /^\|\s*(.+?)\s*\|\s*(✅|⚠️?|❌)\s*(.*?)\s*\|?\s*$/u.exec(line);
    if (!m) continue; // headers, separators, rows in some other shape
    const detail = clean(m[3]);
    rows.push({ what: clean(m[1]), state: STATE[m[2].replace("️", "")], text: detail.length > 200 ? detail.slice(0, 197) + "…" : detail });
  }
  if (!rows.length) return null;

  const first = sec.split("\n").find((l) => l.trim()) ?? "";
  const bold = /\*\*(.+?)\*\*/.exec(first)?.[1];
  const boot = rows.find((r) => /\bboot|playable/i.test(r.what)) ?? null;
  const headline = clean(bold ?? first);
  return {
    headline,
    rows,
    yes: rows.filter((r) => r.state === "yes").length,
    partial: rows.filter((r) => r.state === "partial").length,
    no: rows.filter((r) => r.state === "no").length,
    boot,
    bootState: boot?.state ?? (/does not boot|not boot/i.test(headline) ? "no" : "partial"),
    fetchedAt: 0,
  };
}

const COLOR = { yes: "#4c1", partial: "#dfb317", no: "#e05d44", unknown: "#9f9f9f" };
const WORD = { yes: "yes", partial: "partly", no: "not yet" };

export function badgeParts(s: ProjectStatus | undefined) {
  if (!s) return { label: "are we Leonida yet?", message: "unknown", color: COLOR.unknown };
  return {
    label: "are we Leonida yet?",
    message: `${WORD[s.bootState]} · ${s.yes}/${s.rows.length} done`,
    color: COLOR[s.bootState],
  };
}

/** Endpoint format of shields.io, for anyone who wants their styling. */
export const shieldsJson = (s: ProjectStatus | undefined) => {
  const b = badgeParts(s);
  return { schemaVersion: 1, label: b.label, message: b.message, color: b.color.replace("#", "") };
};

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A self-contained flat badge, so embedding it needs no third-party service. */
export function badgeSvg(s: ProjectStatus | undefined): string {
  const { label, message, color } = badgeParts(s);
  const width = (t: string) => Math.round(t.length * 6.3 + 12);
  const lw = width(label), mw = width(message), w = lw + mw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(message)}"><title>${esc(label)}: ${esc(message)}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${mw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(label)}</text><text x="${lw / 2}" y="14">${esc(label)}</text><text x="${lw + mw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(message)}</text><text x="${lw + mw / 2}" y="14">${esc(message)}</text></g></svg>`;
}
