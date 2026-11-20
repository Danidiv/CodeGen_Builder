/**
 * Reads the visible words of a generated site out of its source code, so the server can put a title, a
 * description and the text into the first HTML of a published site. Link checkers, AI assistants,
 * crawlers and link previews (WhatsApp, Facebook) do not run JavaScript and used to see only "Loading site...".
 * This is a careful heuristic, not a full parser: a missed word is harmless, a wrong one is filtered out.
 */

export type SiteSeo = { title: string; description: string; text: string[]; image: string | null };

const CODE_FILE = /\.(tsx|jsx|ts|js)$/;
/** Files the platform adds itself; they never hold the site's words. */
const SKIP_FILE = /^\/(nexa|nexa-config|nexa-shot)\.ts$/;

const KEYS = "title|name|heading|headline|subtitle|tagline|description|desc|text|label|quote|answer|question|role|price|cta|body|content|caption|message|summary|city|address|hours";
const PROP_STRINGS = new RegExp(`\\b(?:${KEYS})\\s*:\\s*(["'\`])((?:\\\\.|(?!\\1)[^\\n]){3,300}?)\\1`, "g");
const ATTR_STRINGS = /\b(?:alt|placeholder|aria-label|title)\s*=\s*(["'])([^"'\n]{3,200})\1/g;
const JSX_TEXT = />([^<>{}]{2,400})</g;
const IMAGE_URL = /https:\/\/[^\s"'`)<>]+?\.(?:jpe?g|png|webp)(?:\?[^\s"'`)<>]*)?|https:\/\/(?:images\.unsplash\.com|images\.pexels\.com)\/[^\s"'`)<>]+/i;

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\n/g, " ")
    .replace(/\\(["'`])/g, "$1");
}

/** True for strings that are code or styling, not words for a visitor. */
function looksLikeCode(s: string): boolean {
  if (/^(?:[$€£]|Rs\.?|PKR)\s?\d[\d,.]*(?:\s?\/\s?\w+)?$/i.test(s.trim())) return false; // prices
  if (!/[A-Za-zÀ-ɏ؀-ۿ]{2,}/.test(s)) return true;
  if (/[();=]|=>|&&|\|\||\$\{|^\s*(?:import|export|const|let|return|function)\b/.test(s)) return true;
  if (/^(?:https?:|\/|\.\/|#|image:|data:|mailto:|tel:)/i.test(s.trim())) return true;
  // Tailwind class lists and ids: no spaces inside a token or many tokens with ":" "-" "[".
  if (/[:\[\]]/.test(s) && !/\s/.test(s.trim())) return true;
  const tokens = s.trim().split(/\s+/);
  if (tokens.length >= 3 && tokens.filter((t) => /^[a-z0-9-:/\[\]%.]+$/.test(t) && /[-:\[]/.test(t)).length >= tokens.length * 0.6) return true;
  if (!/\s/.test(s.trim()) && /-/.test(s) && s === s.toLowerCase()) return true;
  return false;
}

function clean(s: string): string {
  return decode(s).replace(/\s+/g, " ").trim();
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

export function extractSeo(name: string, files: Record<string, string>, maxChars = 6000): SiteSeo {
  const seen = new Set<string>();
  const text: string[] = [];
  let total = 0;
  let image: string | null = null;

  const add = (raw: string) => {
    const s = clean(raw);
    if (s.length < 2 || s.length > 400 || looksLikeCode(s)) return;
    const key = s.toLowerCase();
    if (seen.has(key) || total + s.length > maxChars) return;
    seen.add(key);
    text.push(s);
    total += s.length;
  };

  const paths = Object.keys(files)
    .filter((p) => CODE_FILE.test(p) && !SKIP_FILE.test(p))
    .sort((a, b) => (a === "/App.tsx" ? -1 : b === "/App.tsx" ? 1 : a.localeCompare(b)));

  for (const p of paths) {
    const code = stripComments(files[p]);
    if (!image) image = code.match(IMAGE_URL)?.[0] ?? null;
    // Collect in source order so the text reads top to bottom like the page.
    const found: { at: number; s: string }[] = [];
    for (const m of code.matchAll(JSX_TEXT)) found.push({ at: m.index ?? 0, s: m[1] });
    for (const m of code.matchAll(PROP_STRINGS)) found.push({ at: m.index ?? 0, s: m[2] });
    for (const m of code.matchAll(ATTR_STRINGS)) found.push({ at: m.index ?? 0, s: m[2] });
    found.sort((a, b) => a.at - b.at).forEach((f) => add(f.s));
  }

  const title = clean(name).slice(0, 80) || "Website";
  const long = text.find((t) => t.length >= 50 && t.split(" ").length >= 8);
  const fallback = text.filter((t) => t.toLowerCase() !== title.toLowerCase()).slice(0, 4).join(". ");
  let description = clean(long ?? fallback);
  if (description.length > 160) description = description.slice(0, 157).replace(/\s+\S*$/, "") + "...";
  return { title, description, text, image };
}
