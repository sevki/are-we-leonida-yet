/** GitHub webhook support: signature check for `X-Hub-Signature-256`. */

const enc = new TextEncoder();

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Constant-time comparison, so the check does not leak how many leading characters matched. */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function validSignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return equal(mac, header.slice("sha256=".length));
}

/** Events that change what the dashboard shows. Everything else is acknowledged and ignored. */
export const RELEVANT_EVENTS = new Set(["pull_request", "issues", "issue_comment"]);
