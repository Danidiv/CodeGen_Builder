/** Marks where the (hidden) analysis of a reference website starts inside a user message. */
export const BRIEF_SEP = "\n\n[[SITE_BRIEF]]\n";

/**
 * The first http(s) link in a message, ignoring links inside [brackets] (template placeholders
 * like "[Paste your URL here, e.g., https://example.com]") and trailing punctuation.
 */
export function extractUrl(text: string): string | null {
  const t = text.split(BRIEF_SEP)[0].replace(/\[[^\]]*\]/g, " ");
  const m = t.match(/https?:\/\/[^\s<>"')\]]+/i);
  if (!m) return null;
  const url = m[0].replace(/[.,;:!?]+$/, "");
  try {
    const u = new URL(url);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Splits a stored user message into what the user typed and the hidden analysis. */
export function splitBrief(content: string): { text: string; brief: string | null; host: string | null } {
  const i = content.indexOf(BRIEF_SEP);
  if (i < 0) return { text: content, brief: null, host: null };
  const brief = content.slice(i + BRIEF_SEP.length);
  const host = brief.match(/^REFERENCE WEBSITE \(([^)]+)\)/)?.[1] ?? null;
  return { text: content.slice(0, i), brief, host };
}
