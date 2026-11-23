export type ClaimKind = "claiming" | "status" | "blocked" | "releasing" | "done" | "finding";

export interface ClaimEvent {
  user: string;
  kind: ClaimKind;
  text: string;
  itemIds: string[]; // e.g. BUILD-589, SHADER-1266
  refs: number[]; // #1234 references
  created_at: string;
  url: string;
}

const CLAIM_RE = /^\s*[*_`>\s-]*(claiming|status|blocked|releasing|done|finding)\s*[:：]\s*([\s\S]*)/i;

/** Parse one coordination-issue comment; returns null if it isn't a claim/done/finding. */
export function parseClaim(c: { user: { login: string } | null; body: string; created_at: string; html_url: string }): ClaimEvent | null {
  const m = CLAIM_RE.exec(c.body ?? "");
  if (!m) return null;
  const text = m[2].trim();
  // drop markdown noise: [label](url) -> label, bare **/` marks
  const firstLine = text.split("\n")[0]
    .replace(/\(?\[claim\]\([^)]*\)\)?/gi, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    user: c.user?.login ?? "ghost",
    kind: m[1].toLowerCase() as ClaimKind,
    text: firstLine.slice(0, 240),
    itemIds: [...new Set(text.match(/\b[A-Z][A-Z0-9]*-\d+\b/g) ?? [])],
    refs: [...new Set([...firstLine.matchAll(/#(\d{1,6})\b/g)].map((x) => Number(x[1])))],
    created_at: c.created_at,
    url: c.html_url,
  };
}

export interface Counted { name: string; count: number }
export interface AiStats {
  sample: number; // PRs inspected
  assisted: number;
  unmarked: number; // no AI-assisted note
  unnamed: number; // noted AI assistance but named no tool or model
  tools: Counted[]; // the harness: Claude Code, Codex, Cursor, ...
  models: Counted[]; // the model family: Claude, GPT, Gemini, GLM, Kimi, Qwen, ...
}

const AI_RE = /AI[- ]assisted(?:\s*\(([^)\n]*)\)|\s+with\s+([^.\n]+))?/i;

// Tools are the agent / editor a contributor ran. Order matters only for display.
const TOOLS: [RegExp, string][] = [
  [/claude[ -]code/i, "Claude Code"],
  [/\bcodex\b/i, "Codex"],
  [/\bcursor\b/i, "Cursor"],
  [/copilot/i, "Copilot"],
  [/antigravity/i, "Antigravity"],
  [/windsurf|cascade/i, "Windsurf"],
  [/gemini[ -]cli/i, "Gemini CLI"],
  [/\bcline\b|\broo[ -]?code\b|\bkilo\b/i, "Cline / Roo"],
  [/opencode|\baider\b|\bzed\b|\bwarp\b|\bamp\b|\bgoose\b|\bdroid\b|\bjunie\b|\bkiro\b/i, "Other agent"],
];

// Models, one entry per family so GLM, Kimi, Qwen, ... are never lumped together.
const MODELS: [RegExp, string][] = [
  [/\bclaude\b(?![ -]code)|\bopus\b|\bsonnet\b|\bhaiku\b|\bclaude[ -]code\b.*\b(?:opus|sonnet|haiku)\b/i, "Claude"],
  [/\bgpt[- ]?\d|\bchatgpt\b|\bo[134](?:-mini|-pro)?\b|\bopenai\b(?!\s+codex)/i, "GPT"],
  [/\bgemini\b(?![ -]cli)/i, "Gemini"],
  [/\bglm|\bz\.ai\b/i, "GLM"],
  [/\bkimi|\bmoonshot/i, "Kimi"],
  [/\bqwen|\bqwq/i, "Qwen"],
  [/\bdeepseek/i, "DeepSeek"],
  [/\bgrok/i, "Grok"],
  [/\bminimax/i, "MiniMax"],
  [/\bmistral|\bcodestral|\bdevstral|\bmagistral/i, "Mistral"],
  [/\bllama/i, "Llama"],
  [/\bcomposer\b/i, "Composer"],
  [/\bnemotron\b|\bphi[- ]?\d|\bcommand[ -]r\b|\bernie\b|\bhunyuan\b|\bdoubao\b|\bstep[- ]?\d|\bgranite\b|\bolmo\b|\bgemma\b/i, "Other model"],
];

/** What a PR body's AI-assisted note names. `assisted` is true even when it names nothing. */
export function parseAi(body: string | null): { assisted: boolean; tools: string[]; models: string[] } {
  const b = body ?? "";
  const m = AI_RE.exec(b);
  const raw = m ? (m[1] ?? m[2] ?? "") : /Generated with \[?Claude Code/i.test(b) ? "Claude Code" : null;
  if (raw === null) return { assisted: false, tools: [], models: [] };
  const pick = (table: [RegExp, string][]) => [...new Set(table.filter(([re]) => re.test(raw)).map(([, n]) => n))];
  return { assisted: true, tools: pick(TOOLS), models: pick(MODELS) };
}

const rank = (m: Map<string, number>): Counted[] =>
  [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

export function aiStats(bodies: (string | null)[]): AiStats {
  const tools = new Map<string, number>();
  const models = new Map<string, number>();
  let assisted = 0, unnamed = 0;
  for (const body of bodies) {
    const r = parseAi(body);
    if (!r.assisted) continue;
    assisted++;
    if (!r.tools.length && !r.models.length) unnamed++;
    for (const t of r.tools) tools.set(t, (tools.get(t) ?? 0) + 1);
    for (const x of r.models) models.set(x, (models.get(x) ?? 0) + 1);
  }
  return { sample: bodies.length, assisted, unmarked: bodies.length - assisted, unnamed, tools: rank(tools), models: rank(models) };
}
