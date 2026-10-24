/**
 * Turns the HTML of a reference website into a SHORT text brief about its layout and look
 * (section order, headings, colours, fonts, counts). It is inspiration for the AI only:
 * the brief tells the model NOT to copy text, brand, logos or images.
 */
export type SiteInfo = {
  host: string;
  title: string;
  description: string;
  sections: string[];
  headings: string[];
  navLinks: string[];
  buttons: string[];
  colors: string[];
  fonts: string[];
  counts: { images: number; videos: number; forms: number; sections: number };
  textLength: number;
  jsHeavy: boolean;
};

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, g: string) => {
      if (g[0] === "#") {
        const n = g[1].toLowerCase() === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : " ";
      }
      return ENT[g.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function text(html: string): string {
  return decode(html.replace(/<[^>]*>/g, " "));
}

function cut(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function uniq(list: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const k = s.toLowerCase();
    if (!s || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function meta(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0] ?? "";
  return decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "");
}

function hexOf(c: string): string | null {
  const m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (m) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return "#" + h;
  }
  const r = c.match(/^rgba?\(\s*(\d{1,3})[ ,]+(\d{1,3})[ ,]+(\d{1,3})/i);
  if (r) return "#" + [r[1], r[2], r[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("");
  return null;
}

/** Most used colours in the CSS, plain white/black/grey last. */
function topColors(css: string): string[] {
  const count = new Map<string, number>();
  for (const m of css.matchAll(/#[0-9a-f]{3,6}\b|rgba?\([^)]{5,30}\)/gi)) {
    const h = hexOf(m[0]);
    if (h) count.set(h, (count.get(h) ?? 0) + 1);
  }
  const sat = (h: string) => {
    const n = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return Math.max(...n) - Math.min(...n);
  };
  const all = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const colourful = all.filter((h) => sat(h) > 40);
  const neutral = all.filter((h) => sat(h) <= 40);
  return [...colourful.slice(0, 4), ...neutral.slice(0, 3)];
}

function fontsOf(html: string, css: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"']*family=([^&"':]+)/gi)) out.push(decode(m[1].replace(/\+/g, " ")));
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = m[1].split(",")[0].replace(/["']/g, "").trim();
    if (first && !/^(inherit|initial|var\(|-apple|system-ui|sans-serif|serif|monospace)/i.test(first)) out.push(first);
  }
  return uniq(out, 3);
}

export function analyzeHtml(html: string, host: string, extraCss = ""): SiteInfo {
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const inline = [...html.matchAll(/\bstyle=["']([^"']*)["']/gi)].map((m) => m[1]).join("\n");
  const theme = meta(html, "theme-color");
  const css = [styles, inline, extraCss, theme].join("\n");

  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "<svg></svg>");

  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || meta(html, "og:title");
  const description = cut(meta(html, "description") || meta(html, "og:description"), 200);

  const headings = uniq(
    [...body.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => `h${m[1]}: ${cut(text(m[2]), 80)}`).filter((h) => h.length > 5),
    24
  );

  const navBlock = body.match(/<nav\b[\s\S]*?<\/nav>/i)?.[0] ?? body.match(/<header\b[\s\S]*?<\/header>/i)?.[0] ?? "";
  const navLinks = uniq([...navBlock.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => cut(text(m[1]), 24)), 10);

  const buttons = uniq(
    [
      ...[...body.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((m) => text(m[1])),
      ...[...body.matchAll(/<a\b[^>]*class=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => text(m[1])),
    ].map((s) => cut(s, 30)),
    8
  );

  // Section order: landmark tags with the first heading inside them.
  const sections: string[] = [];
  const tagRe = /<(header|nav|main|section|footer|aside)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body)) && sections.length < 18) {
    const after = body.slice(m.index, m.index + 2500);
    const h = /^(header|nav)$/i.test(m[1]) ? null : after.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const cls = (m[2].match(/(?:id|class)=["']([^"']{1,40})/i)?.[1] ?? "").trim();
    sections.push(`${m[1].toLowerCase()}${cls ? ` (${cls})` : ""}${h ? `: "${cut(text(h[1]), 60)}"` : ""}`);
  }

  const visible = text(body);
  const counts = {
    images: (body.match(/<img\b/gi) ?? []).length,
    videos: (body.match(/<video\b|youtube\.com\/embed|player\.vimeo/gi) ?? []).length,
    forms: (body.match(/<form\b/gi) ?? []).length,
    sections: (body.match(/<section\b/gi) ?? []).length,
  };
  const scripts = (html.match(/<script\b/gi) ?? []).length;

  return {
    host,
    title: cut(title, 100),
    description,
    sections,
    headings,
    navLinks,
    buttons,
    colors: topColors(css),
    fonts: fontsOf(html, css),
    counts,
    textLength: visible.length,
    jsHeavy: visible.length < 500 && scripts >= 3,
  };
}

/** The text that is sent to the AI together with the user's request. */
export function buildBrief(info: SiteInfo): string {
  const L: string[] = [];
  L.push(`REFERENCE WEBSITE (${info.host})`);
  L.push(
    "This is an analysis of an existing website. Use it ONLY as inspiration for LAYOUT and DESIGN: " +
      "recreate a similar section order, grid/card layout, spacing, colour mood and typography feel with Tailwind. " +
      "Do NOT copy its text, brand name, logo, slogans or images. Write original placeholder copy for the user's own project, " +
      "use image:keywords placeholders for photos, and use an image or colour block where the site has a video. " +
      "Never mention the original brand in the result."
  );
  if (info.title) L.push(`Page title (for the topic only): ${info.title}`);
  if (info.description) L.push(`Topic: ${info.description}`);
  if (info.navLinks.length) L.push(`Navigation items (${info.navLinks.length}): ${info.navLinks.join(" | ")}`);
  if (info.buttons.length) L.push(`Button styles/labels seen: ${info.buttons.join(" | ")}`);
  if (info.sections.length) L.push("Section order:\n" + info.sections.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  if (info.headings.length) L.push("Headings in order:\n" + info.headings.join("\n"));
  if (info.colors.length) L.push(`Main colours (hex, most used first): ${info.colors.join(", ")}`);
  if (info.fonts.length) L.push(`Fonts: ${info.fonts.join(", ")} (use the closest available font style)`);
  L.push(`Counts: ${info.counts.images} images, ${info.counts.videos} videos, ${info.counts.forms} forms, ${info.counts.sections} sections.`);
  if (info.jsHeavy) {
    L.push("Note: this page builds itself with JavaScript, so little structure could be read. Keep the layout simple and follow the user's own description.");
  }
  return L.join("\n").slice(0, 6000);
}
